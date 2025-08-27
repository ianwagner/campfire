import React, { useEffect, useState } from 'react';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import PageWrapper from './components/PageWrapper.jsx';
import MonthSelector from './components/MonthSelector.jsx';
import getMonthString from './utils/getMonthString.js';
import { db } from './firebase/config';

const AdminCapacityPlanner = () => {
  const [month, setMonth] = useState(getMonthString());
  const [brands, setBrands] = useState([]); // {code}
  const [dragCode, setDragCode] = useState(null);
  const [cells, setCells] = useState({}); // { 'week-day': [ {code, value} ] }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(collection(db, 'brands'));
        const rows = snap.docs.map((d) => ({ code: d.data().code || d.id }));
        setBrands(rows);
        const saved = await getDoc(doc(db, 'capacity-planner', month));
        setCells(saved.exists() ? saved.data().cells || {} : {});
      } catch (err) {
        console.error('Failed to load capacity planner', err);
        setCells({});
      }
    };
    load();
  }, [month]);

  const handleDragStart = (code) => setDragCode(code);
  const allowDrop = (e) => e.preventDefault();

  const handleDrop = (cellKey) => {
    if (!dragCode) return;
    const valStr = prompt('Enter number', '1');
    const value = Number(valStr);
    if (!valStr || Number.isNaN(value)) {
      setDragCode(null);
      return;
    }
    setCells((prev) => {
      const blocks = prev[cellKey] || [];
      return { ...prev, [cellKey]: [...blocks, { code: dragCode, value }] };
    });
    setDragCode(null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await setDoc(
        doc(db, 'capacity-planner', month),
        { cells, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (err) {
      console.error('Failed to save capacity planner', err);
    } finally {
      setSaving(false);
    }
  };

  const renderGrid = () => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    return (
      <div className="grid grid-cols-6 gap-2">
        <div />
        {days.map((d) => (
          <div key={d} className="text-center font-semibold">
            {d}
          </div>
        ))}
        {Array.from({ length: 4 }).map((_, week) => (
          <React.Fragment key={week}>
            <div className="flex items-center font-semibold">Week {week + 1}</div>
            {Array.from({ length: 5 }).map((_, day) => {
              const key = `${week}-${day}`;
              const blocks = cells[key] || [];
              return (
                <div
                  key={key}
                  className="border h-24 p-1"
                  onDragOver={allowDrop}
                  onDrop={() => handleDrop(key)}
                >
                  <div className="space-y-1">
                    {blocks.map((b, idx) => (
                      <div key={idx} className="rounded bg-blue-200 p-1 text-xs">
                        {b.code} ({b.value})
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const renderTable = () => {
    const tally = {};
    Object.values(cells).forEach((blocks) => {
      blocks.forEach((b) => {
        tally[b.code] = (tally[b.code] || 0) + Number(b.value || 0);
      });
    });
    const rows = Object.entries(tally);
    if (rows.length === 0) return null;
    return (
      <table className="mt-4 w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2 text-left">Brand</th>
            <th className="border p-2 text-left">Tally</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([code, total]) => (
            <tr key={code}>
              <td className="border p-2">{code}</td>
              <td className="border p-2">{total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <PageWrapper title="Capacity Planner">
      <div className="mb-4 flex justify-between">
        <MonthSelector value={month} onChange={setMonth} />
        <button
          onClick={handleSave}
          className="btn-primary px-3 py-1"
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      <div className="flex gap-4">
        <div className="w-48">
          <h2 className="mb-2 font-semibold">Brand Bank</h2>
          <div className="flex flex-col gap-2">
            {brands.map((b) => (
              <div
                key={b.code}
                draggable
                onDragStart={() => handleDragStart(b.code)}
                className="cursor-move rounded bg-blue-300 p-2 text-center"
              >
                {b.code}
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {renderGrid()}
          {renderTable()}
        </div>
      </div>
    </PageWrapper>
  );
};

export default AdminCapacityPlanner;
