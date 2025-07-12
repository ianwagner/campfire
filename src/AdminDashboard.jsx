import React, { useEffect, useState } from 'react';
import { FiThumbsDown, FiThumbsUp, FiEdit } from 'react-icons/fi';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import parseAdFilename from './utils/parseAdFilename.js';
import { db } from './firebase/config';
import PageWrapper from './components/PageWrapper.jsx';
import Table from './components/common/Table';
import DateRangeSelector from './components/DateRangeSelector.jsx';

function AdminDashboard() {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const lastMonth = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();
  const [range, setRange] = useState({ start: lastMonth, end: thisMonth });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const start = new Date(`${range.start}-01`);
        const end = new Date(`${range.end}-01`);
        end.setMonth(end.getMonth() + 1, 0);
        const snap = await getDocs(collection(db, 'brands'));
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
          const reviewedSet = new Set();
          const approvedSet = new Set();
          const rejectedSet = new Set();

          for (const g of gSnap.docs) {
            const assetsSnap = await getDocs(
              collection(db, 'adGroups', g.id, 'assets')
            );
            assetsSnap.docs.forEach((ad) => {
              const data = ad.data() || {};
              const info = parseAdFilename(data.filename || '');
              const recipe = data.recipeCode || info.recipeCode || '';
              if (!recipe) return;
              if (data.status !== 'ready') reviewedSet.add(recipe);
              if (data.status === 'approved') approvedSet.add(recipe);
              if (data.status === 'rejected') rejectedSet.add(recipe);
            });
          }

          const delivered = new Set([
            ...approvedSet,
            ...rejectedSet,
          ]).size;
          const reviewed = reviewedSet.size;
          const rejected = rejectedSet.size;
          const approved = approvedSet.size;
          const needed = contracted > approved ? contracted - approved : 0;
          const status =
            approved < contracted
              ? 'under'
              : approved > contracted
                ? 'over'
                : 'complete';
          results.push({
            id: brand.id,
            code: brand.code,
            name: brand.name,
            contracted,
            delivered,
            reviewed,
            rejected,
            approved,
            needed,
            status,
          });
        }
        setRows(results);
      } catch (err) {
        console.error('Failed to fetch dashboard data', err);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [range.start, range.end]);

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
              <th>Delivered</th>
              <th>Reviewed</th>
              <th>Rejected</th>
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
                <td className="text-center">{r.delivered}</td>
                <td className="text-center">{r.reviewed}</td>
                <td className="text-center">{r.rejected}</td>
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
