import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import PageWrapper from './components/PageWrapper.jsx';
import MonthSelector from './components/MonthSelector.jsx';
import Table from './components/common/Table';
import getMonthString from './utils/getMonthString.js';
import { db } from './firebase/config';

// Compute the number of contracted units for a given month
const getCapForMonth = (contracts = [], month) => {
  const selected = new Date(`${month}-01`);
  let cap = 0;
  contracts.forEach((c) => {
    const startStr = c.startDate ? c.startDate.slice(0, 7) : '';
    if (!startStr) return;
    const start = new Date(`${startStr}-01`);
    let end;
    const endStr = c.endDate ? c.endDate.slice(0, 7) : '';
    if (endStr) {
      end = new Date(`${endStr}-01`);
    } else if (c.renews || c.repeat) {
      end = new Date(start);
      end.setMonth(end.getMonth() + 60);
    } else {
      end = new Date(`${startStr}-01`);
    }
    if (selected >= start && selected <= end) {
      cap += Number(c.stills || 0) + Number(c.videos || 0);
    }
  });
  return cap;
};

const AdminCapacityPlanner = () => {
  const [month, setMonth] = useState(getMonthString());
  const [brands, setBrands] = useState([]); // {code, cap, allocated, remaining}
  const [dragCode, setDragCode] = useState(null);
  const [cells, setCells] = useState({}); // { 'YYYY-MM-DD': [{code, qty}] }

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(collection(db, 'brands'));
        const rows = snap.docs.map((doc) => {
          const data = doc.data() || {};
          const code = data.code || doc.id;
          const contracts = Array.isArray(data.contracts) ? data.contracts : [];
          const cap = getCapForMonth(contracts, month);
          return { code, cap, allocated: 0, remaining: cap };
        });
        setBrands(rows.filter((b) => b.cap > 0));
      } catch (err) {
        console.error('Failed to load contracts', err);
        setBrands([]);
      }
    };
    load();
    setCells({});
  }, [month]);

  const allocate = (code, qty) => {
    if (!qty) return;
    setBrands((prev) =>
      prev.map((b) =>
        b.code === code && b.remaining >= qty
          ? { ...b, allocated: b.allocated + qty, remaining: b.remaining - qty }
          : b,
      ),
    );
  };

  const handleDragStart = (code) => setDragCode(code);

  const allowDrop = (e) => e.preventDefault();

  const handleDrop = (dateKey) => {
    if (!dragCode) return;
    const brand = brands.find((b) => b.code === dragCode);
    if (!brand || brand.remaining <= 0) {
      setDragCode(null);
      return;
    }
    const qtyStr = prompt('Enter quantity');
    const qty = parseInt(qtyStr, 10);
    if (!qty || qty <= 0 || qty > brand.remaining) {
      setDragCode(null);
      return;
    }
    setCells((prev) => {
      const blocks = prev[dateKey] || [];
      return { ...prev, [dateKey]: [...blocks, { code: dragCode, qty }] };
    });
    allocate(dragCode, qty);
    setDragCode(null);
  };

  const renderCalendar = () => {
    const selected = new Date(`${month}-01`);
    const year = selected.getFullYear();
    const monthIdx = selected.getMonth();

    const start = new Date(year, monthIdx, 1);
    const end = new Date(year, monthIdx + 1, 0);
    const startDay = start.getDay();
    const daysInMonth = end.getDate();

    const slots = [];
    for (let i = 0; i < startDay; i++) slots.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      slots.push(new Date(year, monthIdx, d));
    }
    while (slots.length % 7 !== 0) slots.push(null);

    return (
      <div className="mt-8">
        <div className="grid grid-cols-7 gap-1 text-center text-sm font-semibold mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {slots.map((date, i) => {
            if (!date)
              return <div key={i} className="border min-h-20" />;
            const key = date.toISOString().slice(0, 10);
            const blocks = cells[key] || [];
            return (
              <div
                key={i}
                className="border p-1 min-h-20 text-xs"
                onDragOver={allowDrop}
                onDrop={() => handleDrop(key)}
              >
                <div className="mb-1 font-bold">{date.getDate()}</div>
                <div className="space-y-1">
                  {blocks.map((b, idx) => (
                    <div
                      key={idx}
                      className="rounded bg-blue-200 p-1"
                    >
                      {b.code} ({b.qty})
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <PageWrapper title="Capacity Planner">
      <div className="mb-4 flex justify-end">
        <MonthSelector value={month} onChange={setMonth} />
      </div>
      <Table columns={['2fr', '3fr', '1fr', '1fr', '1fr']}>
        <thead>
          <tr className="text-left">
            <th className="p-2">Brand</th>
            <th className="p-2">Units</th>
            <th className="p-2 text-center">Cap</th>
            <th className="p-2 text-center">Allocated</th>
            <th className="p-2 text-center">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {brands.map((b) => (
            <tr key={b.code} className="border-t">
              <td className="p-2">{b.code}</td>
              <td className="p-2">
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: b.remaining }).map((_, i) => (
                    <div
                      key={i}
                      draggable={b.remaining > 0}
                      onDragStart={() => handleDragStart(b.code)}
                      className="h-5 w-5 rounded-full bg-blue-300 hover:bg-blue-400 cursor-move"
                      title="Drag to allocate"
                    />
                  ))}
                </div>
              </td>
              <td className="p-2 text-center">{b.cap}</td>
              <td className="p-2 text-center">{b.allocated}</td>
              <td className="p-2 text-center">
                {b.remaining === 0 ? 'Done' : b.remaining}
              </td>
            </tr>
          ))}
          {brands.length === 0 && (
            <tr>
              <td colSpan="5" className="p-4 text-center">
                No contracts found
              </td>
            </tr>
          )}
        </tbody>
      </Table>
      {renderCalendar()}
    </PageWrapper>
  );
};

export default AdminCapacityPlanner;

