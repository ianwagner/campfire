import React, { useEffect, useState } from 'react';
import { FiThumbsDown, FiThumbsUp, FiEdit } from 'react-icons/fi';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
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
          let contracted = 0;
          for (const c of contracts) {
            if (!c.startDate) continue;
            const stills = Number(c.stills || 0);
            const videos = Number(c.videos || 0);
            let sd = new Date(c.startDate);
            const ed = c.endDate ? new Date(c.endDate) : null;
            while (sd <= end && (!ed || sd <= ed)) {
              if (sd >= start && sd <= end)
                contracted += stills + videos;
              if (!c.renews) break;
              sd = new Date(sd.getFullYear(), sd.getMonth() + 1, sd.getDate());
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
          let delivered = 0;
          let reviewed = 0;
          let rejected = 0;
          let approved = 0;
          gSnap.docs.forEach((g) => {
            const data = g.data() || {};
            const approvedCount = data.approvedCount || 0;
            const rejectedCount = data.rejectedCount || 0;
            delivered += approvedCount + rejectedCount;
            reviewed += data.reviewedCount || 0;
            rejected += rejectedCount;
            approved += approvedCount;
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
