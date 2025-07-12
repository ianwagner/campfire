import React, { useEffect, useState } from 'react';
import { FiThumbsDown, FiThumbsUp, FiEdit } from 'react-icons/fi';
import { collection, getDocs, query, where } from 'firebase/firestore';
import parseAdFilename from './utils/parseAdFilename';
import { db } from './firebase/config';
import PageWrapper from './components/PageWrapper.jsx';
import Table from './components/common/Table';
import DateRangeSelector from './components/DateRangeSelector.jsx';

function AdminDashboard() {
  const today = new Date().toISOString().slice(0, 7);
  const lastMonth = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();
  const [range, setRange] = useState({ start: lastMonth, end: today });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [sYear, sMonth] = range.start.split('-').map(Number);
        const [eYear, eMonth] = range.end.split('-').map(Number);
        const start = new Date(sYear, sMonth - 1, 1);
        const end = new Date(eYear, eMonth, 0);
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
            const sd = new Date(c.startDate);
            const ed = c.endDate ? new Date(c.endDate) : sd;
            if (sd <= end && ed >= start) {
              contracted += stills + videos;
            }
          }
          if (contracted === 0) continue;
          const q = query(
            collection(db, 'adGroups'),
            where('brandCode', '==', brand.code || brand.codeId || ''),
            where('dueDate', '>=', start),
            where('dueDate', '<=', end)
          );
          const gSnap = await getDocs(q);
          let delivered = 0;
          let reviewed = 0;
          let rejected = 0;
          let approved = 0;
          for (const g of gSnap.docs) {
            const assetSnap = await getDocs(collection(db, 'adGroups', g.id, 'assets'));
            const map = {};
            assetSnap.docs.forEach((a) => {
              const ad = a.data() || {};
              const code = ad.recipeCode || parseAdFilename(ad.filename || '').recipeCode;
              if (!code) return;
              if (!map[code]) {
                map[code] = { reviewed: false, approved: false, rejected: false };
              }
              if (ad.status !== 'ready' && ad.status !== 'pending') map[code].reviewed = true;
              if (ad.status === 'approved') map[code].approved = true;
              if (ad.status === 'rejected') map[code].rejected = true;
            });
            Object.values(map).forEach((m) => {
              if (m.approved || m.rejected) delivered += 1;
              if (m.reviewed || m.approved || m.rejected) reviewed += 1;
              if (m.rejected) rejected += 1;
              if (m.approved) approved += 1;
            });
          }
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
        <p>No recipes found.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Brand</th>
              <th>Recipes</th>
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
