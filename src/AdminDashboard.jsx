import React, { useEffect, useState } from 'react';
import { FiCheck } from 'react-icons/fi';
import {
  collection,
  getDocs,
  query,
  where,
  getCountFromServer,
  doc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase/config';
import { getAuth } from 'firebase/auth';
import PageWrapper from './components/PageWrapper.jsx';
import Table from './components/common/Table';
import MonthSelector from './components/MonthSelector.jsx';
import getMonthString from './utils/getMonthString.js';
import TabButton from './components/TabButton.jsx';
import { normalizeReviewVersion } from './utils/reviewVersion';

function AdminDashboard({ agencyId, brandCodes = [], requireFilters = false } = {}) {
  const thisMonth = getMonthString();
  const [month, setMonth] = useState(thisMonth);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [briefOnly, setBriefOnly] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return;

    user.getIdTokenResult(true)
      .then((token) => {
        console.log(token.claims);
        if (!token.claims.admin) {
          // optionally handle missing admin claim
        }
      })
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      setLoading(true);
      if (requireFilters && brandCodes.length === 0 && !agencyId) {
        if (active) {
          setRows([]);
          setLoading(false);
        }
        return;
      }
      try {
        const base = collection(db, 'brandStats');
        let statDocs = [];
        if (brandCodes.length > 0) {
          const chunks = [];
          for (let i = 0; i < brandCodes.length; i += 10) {
            chunks.push(brandCodes.slice(i, i + 10));
          }
          const snaps = await Promise.all(
            chunks.map((chunk) =>
              getDocs(query(base, where('code', 'in', chunk)))
            )
          );
          snaps.forEach((snap) => statDocs.push(...snap.docs));
        } else if (agencyId) {
          const snap = await getDocs(query(base, where('agencyId', '==', agencyId)));
          statDocs = snap.docs;
        } else {
          const snap = await getDocs(base);
          statDocs = snap.docs;
        }
        let extraBrands = [];
        if (statDocs.length === 0) {
          if (brandCodes.length > 0) {
            extraBrands = brandCodes.map((code) => ({ id: code, code }));
          } else {
            let brandQuery = agencyId
              ? query(collection(db, 'brands'), where('agencyId', '==', agencyId))
              : collection(db, 'brands');
            const brandSnap = await getDocs(brandQuery);
            extraBrands = brandSnap.docs.map((d) => ({
              id: d.id,
              code: d.data().code,
              name: d.data().name,
            }));
            if (extraBrands.length === 0) {
              let contractQuery = agencyId
                ? query(collection(db, 'contracts'), where('agencyId', '==', agencyId))
                : collection(db, 'contracts');
              const contractSnap = await getDocs(contractQuery);
              extraBrands = contractSnap.docs.map((d) => {
                const data = d.data() || {};
                return {
                  id: data.brandId || d.id,
                  code: data.brandCode,
                  name: data.brandName,
                };
              });
            }
          }
        } else if (brandCodes.length > 0) {
          const existingCodes = new Set(
            statDocs.map((d) => (d.data() || {}).code)
          );
          const missing = brandCodes.filter((c) => !existingCodes.has(c));
          extraBrands = missing.map((code) => ({ id: code, code }));
        }

        const computeCounts = async (brand, { briefOnly: briefFilter } = {}) => {
          let contracted = 0;
          let briefed = 0;
          let delivered = 0;
          let approved = 0;
          let rejected = 0;

          try {
            let brandId = brand.id;
            let brandCode = brand.code;
            let brandName = brand.name;
            let brandSnap;
            if (brandId) {
              brandSnap = await getDoc(doc(db, 'brands', brandId));
            }
            if ((!brandSnap || !brandSnap.exists()) && brandCode) {
              const q = query(
                collection(db, 'brands'),
                where('code', '==', brandCode)
              );
              const snap = await getDocs(q);
              if (!snap.empty) {
                brandSnap = snap.docs[0];
                brandId = brandSnap.id;
              }
            }
            if (brandSnap && brandSnap.exists()) {
              const bData = brandSnap.data() || {};
              brandName = brandName || bData.name;
              const contracts = Array.isArray(bData.contracts)
                ? bData.contracts
                : [];
              const selected = new Date(`${month}-01`);
              contracts.forEach((c) => {
                const contractMode =
                  typeof c.mode === 'string'
                    ? c.mode.toLowerCase()
                    : 'production';
                const isBriefContract = contractMode === 'brief';
                if (briefFilter ? !isBriefContract : isBriefContract) {
                  return;
                }
                const startStr = c.startDate ? c.startDate.slice(0, 7) : '';
                if (!startStr) return;
                const start = new Date(`${startStr}-01`);
                let end;
                const endStr = c.endDate ? c.endDate.slice(0, 7) : '';
                if (endStr) {
                  end = new Date(`${endStr}-01`);
                } else if (c.renews || c.repeat) {
                  // Open-ended contracts should count for future months up to five years
                  end = new Date(start);
                  end.setMonth(end.getMonth() + 60);
                } else {
                  end = new Date(`${startStr}-01`);
                }
                if (selected >= start && selected <= end) {
                  const units = Number(c.stills || 0) + Number(c.videos || 0);
                  contracted += units;
                }
              });
            }

            if (brandCode) {
              const startDate = new Date(`${month}-01`);
              const endDate = new Date(startDate);
              endDate.setMonth(endDate.getMonth() + 1);
              const monthQ = query(
                collection(db, 'adGroups'),
                where('brandCode', '==', brandCode),
                where('month', '==', month)
              );
              const dueQ = query(
                collection(db, 'adGroups'),
                where('brandCode', '==', brandCode),
                where('dueDate', '>=', Timestamp.fromDate(startDate)),
                where('dueDate', '<', Timestamp.fromDate(endDate))
              );
              const [monthSnap, dueSnap] = await Promise.all([
                getDocs(monthQ),
                getDocs(dueQ),
              ]);
              const dueDocs = dueSnap.docs.filter((g) => {
                const data = g.data() || {};
                return !data.month;
              });
              const adDocs = [...monthSnap.docs, ...dueDocs];
              for (const g of adDocs) {
                const gData = g.data() || {};
                const normalizedReview = normalizeReviewVersion(
                  gData.reviewVersion ?? gData.reviewType ?? 1
                );
                const isBriefGroup = normalizedReview === '3';
                if (briefFilter && !isBriefGroup) continue;
                if (!briefFilter && isBriefGroup) continue;
                const [rSnap, aSnap] = await Promise.all([
                  getCountFromServer(collection(db, 'adGroups', g.id, 'recipes')),
                  getDocs(
                    query(
                      collection(db, 'adGroups', g.id, 'assets'),
                      where('status', 'in', [
                        'ready',
                        'approved',
                        'rejected',
                        'edit_requested',
                        'pending',
                      ])
                    )
                  ),
                ]);
                const recipeCount = rSnap.data().count || 0;
                briefed += recipeCount;
                const deliveredSet = new Set();
                const approvedSet = new Set();
                const rejectedSet = new Set();
                aSnap.docs.forEach((a) => {
                  const data = a.data() || {};
                  const key = `${g.id}:${data.recipeCode || ''}`;
                  deliveredSet.add(key);
                  if (data.status === 'approved') {
                    approvedSet.add(key);
                  }
                  if (data.status === 'rejected') {
                    rejectedSet.add(key);
                  }
                });
                let deliveredCount = deliveredSet.size;
                if (briefFilter && gData.status === 'designed') {
                  deliveredCount = Math.max(deliveredCount, recipeCount);
                }
                delivered += deliveredCount;
                if (!briefFilter) {
                  approved += approvedSet.size;
                  rejected += rejectedSet.size;
                }
              }
            }

            const noProgress =
              contracted === 0 &&
              briefed === 0 &&
              delivered === 0 &&
              (briefFilter || (approved === 0 && rejected === 0));
            if (noProgress) {
              return null;
            }

            return {
              id: brandId || brand.code || brand.id,
              code: brandCode,
              name: brandName,
              contracted,
              briefed,
              delivered,
              approved: briefFilter ? '-' : approved,
              rejected: briefFilter ? '-' : rejected,
            };
          } catch (err) {
            console.error('Failed to compute counts', err);
            return {
              id: brand.id || brand.code,
              code: brand.code,
              name: brand.name,
              contracted: '?',
              briefed: '?',
              delivered: '?',
              approved: briefFilter ? '-' : '?',
              rejected: briefFilter ? '-' : '?',
            };
          }
        };

        const brandEntryMap = new Map();
        statDocs.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const entry = {
            id: docSnap.id,
            code: data.code,
            name: data.name,
          };
          const key = entry.code || entry.id;
          if (key && !brandEntryMap.has(key)) {
            brandEntryMap.set(key, entry);
          }
        });
        extraBrands.forEach((brand) => {
          const key = brand.code || brand.id;
          if (key && !brandEntryMap.has(key)) {
            brandEntryMap.set(key, brand);
          }
        });

        const brandEntries = Array.from(brandEntryMap.values());
        const computedResults = (
          await Promise.all(
            brandEntries.map((brand) => computeCounts(brand, { briefOnly }))
          )
        ).filter(Boolean);
        computedResults.sort((a, b) =>
          (a.name || a.code || '').localeCompare(b.name || b.code || '')
        );
        if (active) setRows(computedResults);
      } catch (err) {
        console.error('Failed to fetch dashboard data', err);
        if (active) setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchData();
    return () => {
      active = false;
    };
  }, [month, agencyId, brandCodes, briefOnly]);

  return (
    <PageWrapper title="Dashboard">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <MonthSelector value={month} onChange={setMonth} className="sm:mb-0" />
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            View
          </span>
          <div className="inline-flex overflow-hidden rounded border border-gray-300 dark:border-gray-600">
            <TabButton
              type="button"
              active={!briefOnly}
              onClick={() => setBriefOnly(false)}
              className="rounded-none border-0 border-r border-gray-300 dark:border-gray-600"
              aria-pressed={!briefOnly}
            >
              Production
            </TabButton>
            <TabButton
              type="button"
              active={briefOnly}
              onClick={() => setBriefOnly(true)}
              className="rounded-none border-0"
              aria-pressed={briefOnly}
            >
              Brief Only
            </TabButton>
          </div>
        </div>
      </div>
      {loading ? (
        <p>Loading...</p>
      ) : rows.length === 0 ? (
        <p>No contracts found.</p>
      ) : (
        <Table className="dashboard-table">
          <thead>
            <tr>
              <th>Brand</th>
              <th>Contracted</th>
              <th>Briefed</th>
              <th>Delivered</th>
              {!briefOnly && <th>Approved</th>}
              {!briefOnly && <th>Rejected</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const contracted = Number(r.contracted);
              const briefedMatch = Number(r.briefed) >= contracted;
              const deliveredMatch = Number(r.delivered) >= contracted;
              const approvedMatch = !briefOnly && Number(r.approved) >= contracted;
              return (
                <tr key={r.id}>
                  <td data-label="Brand">{r.code || r.name}</td>
                  <td className="text-center" data-label="Contracted">
                    {r.contracted}
                  </td>
                  <td
                    className={`text-center ${briefedMatch ? 'bg-approve-10' : ''}`}
                    data-label="Briefed"
                  >
                    {r.briefed}
                    {briefedMatch && (
                      <FiCheck className="inline ml-1 text-approve" />
                    )}
                  </td>
                  <td
                    className={`text-center ${deliveredMatch ? 'bg-approve-10' : ''}`}
                    data-label="Delivered"
                  >
                    {r.delivered}
                    {deliveredMatch && (
                      <FiCheck className="inline ml-1 text-approve" />
                    )}
                  </td>
                  {!briefOnly && (
                    <td
                      className={`text-center ${approvedMatch ? 'bg-approve-10' : ''}`}
                      data-label="Approved"
                    >
                      {r.approved}
                      {approvedMatch && (
                        <FiCheck className="inline ml-1 text-approve" />
                      )}
                    </td>
                  )}
                  {!briefOnly && (
                    <td className="text-center text-reject" data-label="Rejected">
                      {r.rejected}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </PageWrapper>
  );
}

export default AdminDashboard;
