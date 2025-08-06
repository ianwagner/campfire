import React, { useEffect, useState } from 'react';
import { FiThumbsDown, FiThumbsUp, FiEdit } from 'react-icons/fi';
import {
  collection,
  getDocs,
  query,
  where,
  collectionGroup,
  getCountFromServer,
} from 'firebase/firestore';
import { db } from './firebase/config';
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

        const resultPromises = statDocs.map(async (docSnap) => {
          const data = docSnap.data() || {};
          const counts = data.counts || {};
          let contracted = 0;
          let briefed = 0;
          let delivered = 0;
          let approved = 0;

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
            }
          }

          if (contracted === 0) return null;
          const needed = contracted > delivered ? contracted - delivered : 0;
          const status =
            delivered < contracted
              ? 'under'
              : delivered > contracted
                ? 'over'
                : 'complete';

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
          };
        });

        const results = (await Promise.all(resultPromises)).filter(Boolean);
        if (active) setRows(results);
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
                  {r.status === 'under' ? (
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
