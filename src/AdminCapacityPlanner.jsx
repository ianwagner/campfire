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
                    <button
                      key={i}
                      onClick={() => allocate(b.code)}
                      className="h-5 w-5 rounded-full bg-blue-300 hover:bg-blue-400"
                      title="Allocate"
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
    </PageWrapper>
  );
};

export default AdminCapacityPlanner;

