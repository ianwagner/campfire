import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase/config';
import PageWrapper from './components/PageWrapper.jsx';
import Table from './components/common/Table';
import DateRangeSelector from './components/DateRangeSelector.jsx';

function AdminDashboard() {
  const today = new Date().toISOString().split('T')[0];
  const lastMonth = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  })();
  const [range, setRange] = useState({ start: lastMonth, end: today });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const start = new Date(range.start);
        const end = new Date(range.end);
        const snap = await getDocs(collection(db, 'brands'));
        const brands = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const results = [];
        for (const brand of brands) {
          const contracts = Array.isArray(brand.contracts) ? brand.contracts : [];
          const contractInRange = contracts.filter((c) => {
            if (!c.startDate) return false;
            const sd = new Date(c.startDate);
            return sd >= start && sd <= end;
          });
          if (contractInRange.length === 0) continue;
          const contracted = contractInRange.reduce(
            (s, c) => s + Number(c.stills || 0) + Number(c.videos || 0),
            0,
          );
          const q = query(
            collection(db, 'adGroups'),
            where('brandCode', '==', brand.code || brand.codeId || ''),
          );
          const gSnap = await getDocs(q);
          let inProgress = 0;
          let reviewed = 0;
          let rejected = 0;
          let approved = 0;
          gSnap.docs.forEach((g) => {
            const data = g.data() || {};
            inProgress += data.readyCount || 0;
            reviewed += data.reviewedCount || 0;
            rejected += data.rejectedCount || 0;
            approved += data.approvedCount || 0;
          });
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
            inProgress,
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
              <th>In Progress</th>
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
                <td className="text-center">{r.inProgress}</td>
                <td className="text-center">{r.reviewed}</td>
                <td className="text-center">{r.rejected}</td>
                <td className="text-center">{r.approved}</td>
                <td className="text-center">{r.needed}</td>
                <td className="text-center">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </PageWrapper>
  );
}

export default AdminDashboard;
