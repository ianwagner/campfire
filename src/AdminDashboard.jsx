import React, { useEffect, useState } from 'react';
import { FiThumbsDown, FiThumbsUp, FiEdit } from 'react-icons/fi';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import parseAdFilename from './utils/parseAdFilename.js';
import { db } from './firebase/config';
import PageWrapper from './components/PageWrapper.jsx';
import Table from './components/common/Table';
import DateRangeSelector from './components/DateRangeSelector.jsx';
import getMonthString from './utils/getMonthString.js';

function AdminDashboard({ agencyId } = {}) {
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
      try {
        const [sYear, sMonth] = range.start.split('-').map(Number);
        const [eYear, eMonth] = range.end.split('-').map(Number);
        const start = new Date(Date.UTC(sYear, sMonth - 1, 1));
        const end = new Date(Date.UTC(eYear, eMonth, 0, 23, 59, 59, 999));
        const base = collection(db, 'brands');
        const bQuery = agencyId ? query(base, where('agencyId', '==', agencyId)) : base;
        const snap = await getDocs(bQuery);
        const brands = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const results = [];
        for (const brand of brands) {
          const contracts = Array.isArray(brand.contracts) ? brand.contracts : [];
          let contracted = 0;
          for (const c of contracts) {
            if (!c.startDate) continue;
            const stills = Number(c.stills || 0);
            const videos = Number(c.videos || 0);
            let sd = new Date(c.startDate);
            const ed = c.endDate ? new Date(c.endDate) : null;
            while (sd <= end && (!ed || sd <= ed)) {
              if (sd >= start && sd <= end) {
                contracted += stills + videos;
              }
              if (!c.renews) break;
              sd.setMonth(sd.getMonth() + 1);
            }
          }
          if (contracted === 0) continue;
          const q = query(
            collection(db, 'adGroups'),
            where('brandCode', '==', brand.code || brand.codeId || ''),
            where('dueDate', '>=', Timestamp.fromDate(start)),
            where('dueDate', '<=', Timestamp.fromDate(end)),
          );
          const gSnap = await getDocs(q);
          const recipeSet = new Set();
          const approvedSet = new Set();
          const deliveredSet = new Set();

          for (const g of gSnap.docs) {
            const assetsSnap = await getDocs(
              collection(db, 'adGroups', g.id, 'assets')
            );
            assetsSnap.docs.forEach((ad) => {
              const data = ad.data() || {};
              const info = parseAdFilename(data.filename || '');
              const recipe = data.recipeCode || info.recipeCode || '';
              if (!recipe) return;
              const groupCode =
                data.adGroupCode || info.adGroupCode || g.id;
              const key = `${groupCode}-${recipe}`;
              recipeSet.add(key);
              if (
                ['ready', 'approved', 'rejected', 'edit_requested'].includes(
                  data.status
                )
              )
                deliveredSet.add(key);
              if (data.status === 'approved') approvedSet.add(key);
            });
          }

          const briefed = recipeSet.size;
          const delivered = deliveredSet.size;
          const approved = approvedSet.size;
          const needed = contracted > delivered ? contracted - delivered : 0;
          const status =
            delivered < contracted
              ? 'under'
              : delivered > contracted
                ? 'over'
                : 'complete';
          results.push({
            id: brand.id,
            code: brand.code,
            name: brand.name,
            contracted,
            briefed,
            delivered,
            approved,
            needed,
            status,
          });
        }
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
  }, [range.start, range.end, agencyId]);

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
