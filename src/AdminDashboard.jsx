import React, { useEffect, useState } from 'react';
import { FiThumbsDown, FiThumbsUp, FiEdit, FiAlertTriangle } from 'react-icons/fi';
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

function AdminDashboard({ agencyId, brandCodes = [], requireFilters = false } = {}) {
  const thisMonth = getMonthString();
  const [month, setMonth] = useState(thisMonth);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

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

        const computeCounts = async (brand) => {
          let contracted = 0;
          let briefed = 0;
          let delivered = 0;
          let approved = 0;
          let error = false;

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
                const startStr = c.startDate ? c.startDate.slice(0, 7) : '';
                if (!startStr) return;
                const start = new Date(`${startStr}-01`);
                let end;
                const endStr = c.endDate ? c.endDate.slice(0, 7) : '';
                if (endStr) {
                  end = new Date(`${endStr}-01`);
                } else if (c.renews || c.repeat) {
                  const current = new Date();
                  current.setDate(1);
                  end = selected > current ? current : selected;
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
              const adQ = query(
                collection(db, 'adGroups'),
                where('brandCode', '==', brandCode),
                where('dueDate', '>=', Timestamp.fromDate(startDate)),
                where('dueDate', '<', Timestamp.fromDate(endDate))
              );
              const adSnap = await getDocs(adQ);
              for (const g of adSnap.docs) {
                const [rSnap, aSnap] = await Promise.all([
                  getCountFromServer(collection(db, 'adGroups', g.id, 'recipes')),
                  getDocs(
                    query(
                      collection(db, 'adGroups', g.id, 'assets'),
                      where('status', 'in', [
                        'approved',
                        'rejected',
                        'edit_requested',
                      ])
                    )
                  ),
                ]);
                briefed += rSnap.data().count || 0;
                const deliveredSet = new Set();
                const approvedSet = new Set();
                aSnap.docs.forEach((a) => {
                  const data = a.data() || {};
                  const key = `${g.id}:${data.recipeCode || ''}`;
                  deliveredSet.add(key);
                  if (data.status === 'approved') {
                    approvedSet.add(key);
                  }
                });
                delivered += deliveredSet.size;
                approved += approvedSet.size;
              }
            }

            if (
              contracted === 0 &&
              briefed === 0 &&
              delivered === 0 &&
              approved === 0
            ) {
              return null;
            }

            return {
              id: brandId || brand.code,
              code: brandCode,
              name: brandName,
              contracted,
              briefed,
              delivered,
              approved,
              needed:
                contracted > delivered ? contracted - delivered : 0,
              status:
                delivered < contracted
                  ? 'under'
                  : delivered > contracted
                    ? 'over'
                    : 'complete',
              error,
            };
          } catch (err) {
            console.error('Failed to compute counts', err);
            return {
              id: brand.id,
              code: brand.code,
              name: brand.name,
              contracted: '?',
              briefed: '?',
              delivered: '?',
              approved: '?',
              needed: '?',
              status: 'error',
              error: true,
            };
          }
        };

        const resultPromises = statDocs.map(async (docSnap) => {
          const data = docSnap.data() || {};
          const counts = data.counts || {};
          let contracted = 0;
          let briefed = 0;
          let delivered = 0;
          let approved = 0;
          let error = false;

          for (const [m, v] of Object.entries(counts)) {
            if (m === month) {
              contracted += Number(v.contracted || 0);
              briefed += Number(v.briefed || 0);
              delivered += Number(v.delivered || 0);
              approved += Number(v.approved || 0);
            }
          }

          if (
            data.code &&
            (contracted === 0 || (briefed === 0 && delivered === 0 && approved === 0))
          ) {
            return await computeCounts({ id: docSnap.id, code: data.code, name: data.name });
          }

          if (contracted === 0 && !error) return null;

          return {
            id: docSnap.id,
            code: data.code,
            name: data.name,
            contracted,
            briefed,
            delivered,
            approved,
            needed:
              contracted > delivered ? contracted - delivered : 0,
            status:
              delivered < contracted
                ? 'under'
                : delivered > contracted
                  ? 'over'
                  : 'complete',
            error,
          };
        });
        const fallbackPromises = extraBrands.map((brand) => computeCounts(brand));

        const results = (await Promise.all(resultPromises)).filter(Boolean);
        const fallbackResults = (await Promise.all(fallbackPromises)).filter(Boolean);
        const merged = [...results, ...fallbackResults];
        if (active) setRows(merged);
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
  }, [month, agencyId, brandCodes]);

  return (
    <PageWrapper title="Dashboard">
      <MonthSelector value={month} onChange={setMonth} className="mb-4" />
      {loading ? (
        <p>Loading...</p>
      ) : rows.length === 0 ? (
        <p>No contracts found.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Brand</th>
              <th>Contracted</th>
              <th>Briefed</th>
              <th>Delivered</th>
              <th>Approved</th>
              <th>Needed</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.code || r.name}</td>
                <td className="text-center">{r.contracted}</td>
                <td className="text-center">{r.briefed}</td>
                <td className="text-center">{r.delivered}</td>
                <td className="text-center">{r.approved}</td>
                <td className="text-center">{r.needed}</td>
                <td className="text-center">
                  {r.error ? (
                    <span className="flex items-center justify-center gap-1 text-yellow-500">
                      <FiAlertTriangle />
                      warning
                    </span>
                  ) : r.status === 'under' ? (
                    <span className="flex items-center justify-center gap-1 text-reject">
                      <FiThumbsDown />
                      {r.status}
                    </span>
                  ) : r.status === 'over' ? (
                    <span className="flex items-center justify-center gap-1 text-edit">
                      <FiEdit />
                      {r.status}
                    </span>
                  ) : r.status === 'complete' ? (
                    <span className="flex items-center justify-center gap-1 text-approve">
                      <FiThumbsUp />
                      {r.status}
                    </span>
                  ) : (
                    r.status
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </PageWrapper>
  );
}

export default AdminDashboard;
