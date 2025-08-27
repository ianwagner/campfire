import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import PageWrapper from './components/PageWrapper.jsx';
import MonthSelector from './components/MonthSelector.jsx';
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
  const [cells, setCells] = useState({}); // { 'week-day': [code] }

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

  const allocate = (code) => {
    setBrands((prev) =>
      prev.map((b) =>
        b.code === code && b.remaining > 0
          ? { ...b, allocated: b.allocated + 1, remaining: b.remaining - 1 }
          : b,
      ),
    );
  };

  const handleDragStart = (code) => setDragCode(code);

  const allowDrop = (e) => e.preventDefault();

  const handleDrop = (cellKey) => {
    if (!dragCode) return;
    const brand = brands.find((b) => b.code === dragCode);
    if (!brand || brand.remaining <= 0) {
      setDragCode(null);
      return;
    }
    setCells((prev) => {
      const blocks = prev[cellKey] || [];
      return { ...prev, [cellKey]: [...blocks, dragCode] };
    });
    allocate(dragCode);
    setDragCode(null);
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
                    {blocks.map((code, idx) => (
                      <div
                        key={idx}
                        className="rounded bg-blue-200 p-1 text-xs"
                      >
                        {code}
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

  return (
    <PageWrapper title="Capacity Planner">
      <div className="mb-4 flex justify-end">
        <MonthSelector value={month} onChange={setMonth} />
      </div>
      <div className="flex gap-4">
        <div className="w-48">
          <h2 className="mb-2 font-semibold">Brand Bank</h2>
          <div className="flex flex-col gap-2">
            {brands.filter((b) => b.remaining > 0).map((b) => (
              <div
                key={b.code}
                draggable
                onDragStart={() => handleDragStart(b.code)}
                className="cursor-move rounded bg-blue-300 p-2 text-center"
              >
                {b.code}
              </div>
            ))}
            {brands.filter((b) => b.remaining > 0).length === 0 && (
              <div className="text-sm text-gray-500">No remaining brands</div>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto">{renderGrid()}</div>
      </div>
    </PageWrapper>
  );
};

export default AdminCapacityPlanner;

