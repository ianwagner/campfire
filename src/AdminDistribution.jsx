import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase/config';
import Table from './components/common/Table';

const AdminDistribution = () => {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [brandCode, setBrandCode] = useState('');
  const [brandCodes, setBrandCodes] = useState([]);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const fetchBrands = async () => {
      try {
        const snap = await getDocs(collection(db, 'brands'));
        setBrandCodes(
          snap.docs
            .map((d) => d.data().code)
            .filter(Boolean)
            .sort(),
        );
      } catch (err) {
        console.error('Failed to load brands', err);
        setBrandCodes([]);
      }
    };
    fetchBrands();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!brandCode || !month) {
        setRows([]);
        return;
      }
      try {
        const q = query(
          collection(db, 'adGroups'),
          where('brandCode', '==', brandCode),
        );
        const snap = await getDocs(q);
        const list = [];
        for (const gDoc of snap.docs) {
          const gData = gDoc.data();
          if (gData.month !== month) continue;
          try {
            const rSnap = await getDocs(
              collection(db, 'adGroups', gDoc.id, 'recipes'),
            );
            rSnap.docs.forEach((rDoc) => {
              const rData = rDoc.data();
              list.push({
                id: `${gDoc.id}_${rDoc.id}`,
                title: gData.title || '',
                recipeNo: rData.recipeNo || rDoc.id,
                product: rData.product || '',
                angle: rData.angle || '',
                audience: rData.audience || '',
              });
            });
          } catch (err) {
            console.error('Failed to load recipes', err);
          }
        }
        setRows(list);
      } catch (err) {
        console.error('Failed to load ad groups', err);
        setRows([]);
      }
    };
    fetchData();
  }, [brandCode, month]);

  const months = useMemo(() => {
    const arr = [];
    const now = new Date();
    for (let i = 0; i < 12; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      arr.push(d.toISOString().slice(0, 7));
    }
    return arr;
  }, []);

  return (
    <div>
      <h2 className="text-xl mb-4">Distribution</h2>
      <div className="flex gap-4 mb-4">
        <div>
          <label className="block text-sm mb-1">Month</label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="p-1 border rounded"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1">Brand Code</label>
          <select
            value={brandCode}
            onChange={(e) => setBrandCode(e.target.value)}
            className="p-1 border rounded"
          >
            <option value="">Select brand</option>
            {brandCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
      </div>
      {rows.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <th>Ad Group Title</th>
              <th>Recipe #</th>
              <th>Product</th>
              <th>Angle</th>
              <th>Audience</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td>
                <td>{r.recipeNo}</td>
                <td>{r.product}</td>
                <td>{r.angle}</td>
                <td>{r.audience}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p>No recipes found.</p>
      )}
    </div>
  );
};

export default AdminDistribution;

