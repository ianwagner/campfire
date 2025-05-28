import React, { useEffect, useState, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase/config';

const AdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({});
  const [approvals, setApprovals] = useState([]);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      try {
        const groupSnap = await getDocs(collection(db, 'adGroups'));
        const countMap = {
          approved: 0,
          rejected: 0,
          edit_requested: 0,
          pending: 0,
          ready: 0,
          archived: 0,
        };
        const approvalsList = [];
        for (const g of groupSnap.docs) {
          const assetsSnap = await getDocs(collection(db, 'adGroups', g.id, 'assets'));
          assetsSnap.docs.forEach((d) => {
            const ad = d.data();
            const status = ad.status || 'pending';
            if (countMap[status] === undefined) countMap[status] = 0;
            countMap[status] += 1;
            if (status === 'approved' && ad.lastUpdatedAt?.toDate) {
              approvalsList.push(ad.lastUpdatedAt.toDate());
            }
          });
        }
        setStats(countMap);
        setApprovals(approvalsList);
      } catch (err) {
        console.error('Failed to fetch stats', err);
        setStats({});
        setApprovals([]);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const chart = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(d.toISOString().slice(0, 10));
    }
    const counts = {};
    approvals.forEach((date) => {
      const ds = date.toISOString().slice(0, 10);
      if (ds >= startDate && ds <= endDate) {
        counts[ds] = (counts[ds] || 0) + 1;
      }
    });
    const values = days.map((d) => counts[d] || 0);
    const max = Math.max(...values, 1);
    const width = 400;
    const height = 120;
    const step = days.length > 1 ? width / (days.length - 1) : width;
    const path = values
      .map((v, i) => {
        const x = i * step;
        const y = height - (v / max) * height;
        return `${i === 0 ? 'M' : 'L'}${x},${y}`;
      })
      .join(' ');
    return { width, height, path };
  }, [approvals, startDate, endDate]);

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Admin Dashboard</h1>
      {loading ? (
        <p>Loading statistics...</p>
      ) : (
        <>
          <div className="mb-6">
            <h2 className="text-xl mb-2">Ad Status Totals</h2>
            <ul className="space-y-1">
              {Object.entries(stats).map(([k, v]) => (
                <li key={k}>
                  {k.replace('_', ' ')}: {v}
                </li>
              ))}
            </ul>
          </div>
          <div className="mb-6">
            <h2 className="text-xl mb-2">Approvals Over Time</h2>
            <div className="flex items-center space-x-2 mb-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border px-2 py-1"
              />
              <span>-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border px-2 py-1"
              />
            </div>
            <svg width={chart.width} height={chart.height} className="bg-gray-100">
              <path d={chart.path} stroke="blue" fill="none" />
            </svg>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
