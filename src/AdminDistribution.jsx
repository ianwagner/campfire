import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { FiDownload } from 'react-icons/fi';
import { db } from './firebase/config';
import Table from './components/common/Table';
import IconButton from './components/IconButton.jsx';
import Button from './components/Button.jsx';
import parseAdFilename from './utils/parseAdFilename';

const monthKey = (date) => date.toISOString().slice(0, 7);

const formatMonth = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1)).toLocaleString('default', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

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
          const aSnap = await getDocs(collection(db, 'adGroups', gDoc.id, 'assets'));

          const assetMap = {};
          aSnap.docs.forEach((aDoc) => {
            const aData = aDoc.data();
            if (["archived", "rejected"].includes(aData.status)) return;
            const info = parseAdFilename(aData.filename || '');
            const recipe = String(aData.recipeCode || info.recipeCode || '');
            const url = aData.adUrl || aData.firebaseUrl || aData.url;
            if (!recipe || !url) return;
            const normalized = recipe.replace(/^0+/, '');
            const label = info.aspectRatio || 'link';
            const entry = { url, label };
            if (!assetMap[recipe]) assetMap[recipe] = [];
            assetMap[recipe].push(entry);
            if (normalized !== recipe) {
              if (!assetMap[normalized]) assetMap[normalized] = [];
              assetMap[normalized].push(entry);
            }
          });

          rSnap.docs.forEach((rDoc, idx) => {
            const rData = rDoc.data();
            const recipeNo = rData.recipeNo || rDoc.id || idx + 1;
            const product =
              rData.product?.name ||
              rData.product ||
              rData.components?.['product.name'] ||
              '';
            const angle =
              rData.metadata?.angle ||
              rData.components?.angle ||
              rData.angle ||
              '';
            const audience = rData.audience || rData.components?.audience || '';
            const status = rData.status || '';
            const links =
              status === 'archived' || status === 'rejected'
                ? []
                : assetMap[String(recipeNo)] || [];
            list.push({
              id: `${gDoc.id}_${rDoc.id}`,
              groupName: gData.name || gDoc.id,
              recipeNo,
              product,
              angle,
              audience,
              status,
              links,
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

  const handleExport = () => {
    if (!rows.length) return;
    const headers = ['Ad Group', 'Recipe #', 'Product', 'Angle', 'Audience', 'Status', 'Links'];
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.join(','),
      ...rows.map((r) =>
        [
          r.groupName,
          r.recipeNo,
          r.product,
          r.angle,
          r.audience || '-',
          r.status || '-',
          (r.links || []).map((l) => l.url).join(' '),
        ]
          .map(escape)
          .join(','),
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const file = `${brand}_${month || dueMonth}.csv`;
    link.setAttribute('download', file);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Distribution</h1>
      <div className="flex items-center justify-between mb-4">
        <div className="flex space-x-4">
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="p-1 border rounded"
          >
            <option value="">Select Month Tag</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonth(m)}
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
                {formatMonth(m)}
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
        <IconButton
          onClick={handleExport}
          aria-label="Export CSV"
          disabled={rows.length === 0}
          className={`text-xl ${rows.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <FiDownload />
        </IconButton>
      </div>
      {loading ? (
        <p>Loading...</p>
      ) : rows.length > 0 ? (
        <Table columns={['auto', 'auto', 'auto', 'auto', 'auto', 'auto', '12rem']}>
          <thead>
            <tr>
              <th>Ad Group</th>
              <th className="text-center">Recipe #</th>
              <th>Product</th>
              <th>Angle</th>
              <th>Audience</th>
              <th>Status</th>
              <th>Links</th>
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
                <td>{r.status || '-'}</td>
                <td className="flex flex-wrap gap-2">
                  {r.links && r.links.length > 0
                    ? r.links.map((l, i) => (
                        <Button
                          as="a"
                          key={i}
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="secondary"
                          className="px-2 py-1 text-sm"
                        >
                          {l.label}
                        </Button>
                      ))
                    : '-'}
                </td>
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
