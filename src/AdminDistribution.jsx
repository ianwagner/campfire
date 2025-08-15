import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase/config';
import Table from './components/common/Table';

const monthKey = (date) => date.toISOString().slice(0, 7);

const AdminDistribution = () => {
  const [months, setMonths] = useState([]);
  const [dueMonths, setDueMonths] = useState([]);
  const [brands, setBrands] = useState([]);
  const [month, setMonth] = useState('');
  const [dueMonth, setDueMonth] = useState('');
  const [brand, setBrand] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const agSnap = await getDocs(collection(db, 'adGroups'));
        const monthSet = new Set();
        const dueMonthSet = new Set();
        const brandSet = new Set();
        agSnap.docs.forEach((d) => {
          const data = d.data();
          if (data.month) monthSet.add(data.month);
          const dueDate = data.dueDate?.toDate ? data.dueDate.toDate() : data.dueDate;
          if (dueDate instanceof Date && !isNaN(dueDate)) {
            dueMonthSet.add(monthKey(dueDate));
          }
          if (data.brandCode) brandSet.add(data.brandCode);
        });
        setMonths(Array.from(monthSet).sort());
        setDueMonths(Array.from(dueMonthSet).sort());
        setBrands(Array.from(brandSet).sort());
      } catch (err) {
        console.error('Failed to fetch filter data', err);
      }
    };
    fetchFilters();
  }, []);

  useEffect(() => {
    const fetchRows = async () => {
      if (!brand || (!month && !dueMonth)) {
        setRows([]);
        return;
      }
      setLoading(true);
      try {
        const args = [collection(db, 'adGroups'), where('brandCode', '==', brand)];
        if (month) args.push(where('month', '==', month));
        if (dueMonth) {
          const start = new Date(`${dueMonth}-01`);
          const end = new Date(start);
          end.setMonth(end.getMonth() + 1);
          args.push(where('dueDate', '>=', start));
          args.push(where('dueDate', '<', end));
        }
        const gSnap = await getDocs(query(...args));
        const list = [];
        for (const gDoc of gSnap.docs) {
          const gData = gDoc.data();
          const rSnap = await getDocs(collection(db, 'adGroups', gDoc.id, 'recipes'));
          rSnap.docs.forEach((rDoc, idx) => {
            const rData = rDoc.data();
            const product =
              rData.product?.name ||
              rData.product ||
              rData.components?.['product.name'] ||
              '';
            const angle = rData.angle || rData.components?.angle || '';
            const audience = rData.audience || rData.components?.audience || '';
            list.push({
              id: `${gDoc.id}_${rDoc.id}`,
              groupName: gData.name || gDoc.id,
              recipeNo: rData.recipeNo || rDoc.id || idx + 1,
              product,
              angle,
              audience,
            });
          });
        }
        setRows(list);
      } catch (err) {
        console.error('Failed to fetch recipes', err);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    fetchRows();
  }, [month, dueMonth, brand]);

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Distribution</h1>
      <div className="flex space-x-4 mb-4">
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="p-1 border rounded"
        >
          <option value="">Select Month Tag</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {new Date(`${m}-01`).toLocaleString('default', {
                month: 'short',
                year: 'numeric',
              })}
            </option>
          ))}
        </select>
        <select
          value={dueMonth}
          onChange={(e) => setDueMonth(e.target.value)}
          className="p-1 border rounded"
        >
          <option value="">Select Due Date Month</option>
          {dueMonths.map((m) => (
            <option key={m} value={m}>
              {new Date(`${m}-01`).toLocaleString('default', {
                month: 'short',
                year: 'numeric',
              })}
            </option>
          ))}
        </select>
        <select
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="p-1 border rounded"
        >
          <option value="">Select Brand</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
      {loading ? (
        <p>Loading...</p>
      ) : rows.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <th>Ad Group</th>
              <th>Recipe #</th>
              <th>Product</th>
              <th>Angle</th>
              <th>Audience</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.groupName}</td>
                <td className="text-center">{r.recipeNo}</td>
                <td>{r.product}</td>
                <td>{r.angle}</td>
                <td>{r.audience || '-'}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (month || dueMonth) && brand ? (
        <p>No recipes found.</p>
      ) : null}
    </div>
  );
};

export default AdminDistribution;
