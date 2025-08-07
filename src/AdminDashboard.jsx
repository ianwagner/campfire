import React, { useEffect, useState } from 'react';
import { FiThumbsDown, FiThumbsUp, FiEdit, FiAlertTriangle } from 'react-icons/fi';
import {
  collection,
  getDocs,
  query,
  where,
  collectionGroup,
  getCountFromServer,
} from 'firebase/firestore';
import { db } from './firebase/config';
import { getAuth } from 'firebase/auth';
import PageWrapper from './components/PageWrapper.jsx';
import Table from './components/common/Table';
import DateRangeSelector from './components/DateRangeSelector.jsx';
import getMonthString from './utils/getMonthString.js';

function AdminDashboard({ agencyId, brandCodes = [], requireFilters = false } = {}) {
  const thisMonth = getMonthString();
  const lastMonth = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return getMonthString(d);
  })();
  const [range, setRange] = useState({ start: lastMonth, end: thisMonth });
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

        const resultPromises = statDocs.map(async (docSnap) => {
          const data = docSnap.data() || {};
          const counts = data.counts || {};
          let contracted = 0;
          let briefed = 0;
          let delivered = 0;
          let approved = 0;
          let error = false;

          for (const [m, v] of Object.entries(counts)) {
            if (m >= range.start && m <= range.end) {
              contracted += Number(v.contracted || 0);
              briefed += Number(v.briefed || 0);
              delivered += Number(v.delivered || 0);
              approved += Number(v.approved || 0);
            }
          }

          // Fallback to counting assets directly when no pre-aggregated data
          if (contracted === 0 && data.code) {
            try {
              const [totalSnap, briefedSnap, deliveredSnap, approvedSnap] =
                await Promise.all([
                  getCountFromServer(
                    query(
                      collectionGroup(db, 'assets'),
                      where('brandCode', '==', data.code)
                    )
                  ),
                  getCountFromServer(
                    query(
                      collectionGroup(db, 'assets'),
                      where('brandCode', '==', data.code),
                      where('status', '==', 'briefed')
                    )
                  ),
                  getCountFromServer(
                    query(
                      collectionGroup(db, 'assets'),
                      where('brandCode', '==', data.code),
                      where('status', '==', 'delivered')
                    )
                  ),
                  getCountFromServer(
                    query(
                      collectionGroup(db, 'assets'),
                      where('brandCode', '==', data.code),
                      where('status', '==', 'approved')
                    )
                  ),
                ]);
              contracted = totalSnap.data().count || 0;
              briefed = briefedSnap.data().count || 0;
              delivered = deliveredSnap.data().count || 0;
              approved = approvedSnap.data().count || 0;
            } catch (err) {
              console.error('Failed to count assets', err);
              error = true;
            }
          }

          if (contracted === 0 && !error) return null;

          let needed;
          let status;
          if (error) {
            contracted = '?';
            briefed = '?';
            delivered = '?';
            approved = '?';
            needed = '?';
            status = 'error';
          } else {
            needed = contracted > delivered ? contracted - delivered : 0;
            status =
              delivered < contracted
                ? 'under'
                : delivered > contracted
                  ? 'over'
                  : 'complete';
          }

          return {
            id: docSnap.id,
            code: data.code,
            name: data.name,
            contracted,
            briefed,
            delivered,
            approved,
            needed,
            status,
            error,
          };
        });
        const fallbackPromises = extraBrands.map(async (brand) => {
          let contracted = 0;
          let briefed = 0;
          let delivered = 0;
          let approved = 0;
          let error = false;
          try {
            const [totalSnap, briefedSnap, deliveredSnap, approvedSnap] =
              await Promise.all([
                getCountFromServer(
                  query(
                    collectionGroup(db, 'assets'),
                    where('brandCode', '==', brand.code)
                  )
                ),
                getCountFromServer(
                  query(
                    collectionGroup(db, 'assets'),
                    where('brandCode', '==', brand.code),
                    where('status', '==', 'briefed')
                  )
                ),
                getCountFromServer(
                  query(
                    collectionGroup(db, 'assets'),
                    where('brandCode', '==', brand.code),
                    where('status', '==', 'delivered')
                  )
                ),
                getCountFromServer(
                  query(
                    collectionGroup(db, 'assets'),
                    where('brandCode', '==', brand.code),
                    where('status', '==', 'approved')
                  )
                ),
              ]);
            contracted = totalSnap.data().count || 0;
            briefed = briefedSnap.data().count || 0;
            delivered = deliveredSnap.data().count || 0;
            approved = approvedSnap.data().count || 0;
          } catch (err) {
            console.error('Failed to count assets', err);
            error = true;
          }
          if (contracted === 0 && !error) return null;

          let needed;
          let status;
          if (error) {
            contracted = '?';
            briefed = '?';
            delivered = '?';
            approved = '?';
            needed = '?';
            status = 'error';
          } else {
            needed = contracted > delivered ? contracted - delivered : 0;
            status =
              delivered < contracted
                ? 'under'
                : delivered > contracted
                  ? 'over'
                  : 'complete';
          }

          return {
            id: brand.id,
            code: brand.code,
            name: brand.name,
            contracted,
            briefed,
            delivered,
            approved,
            needed,
            status,
            error,
          };
        });

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
  }, [range.start, range.end, agencyId, brandCodes]);

  return (
    <PageWrapper title="Dashboard">
      <DateRangeSelector
        startDate={range.start}
        endDate={range.end}
        onChange={(r) => setRange(r)}
      />
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
