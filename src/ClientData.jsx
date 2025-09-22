import React, { useEffect, useState } from 'react';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { FiDownload, FiEdit2, FiSave, FiCopy } from 'react-icons/fi';
import { db } from './firebase/config';
import Table from './components/common/Table';
import Button from './components/Button.jsx';
import IconButton from './components/IconButton.jsx';
import parseAdFilename from './utils/parseAdFilename';
import copyCsvToClipboard from './utils/copyCsvToClipboard';

const monthKey = (date) => date.toISOString().slice(0, 7);

const formatMonth = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1)).toLocaleString('default', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

const baseColumnDefs = [
  { key: 'storeId', label: 'Store ID', width: 'auto' },
  { key: 'groupName', label: 'Ad Group', width: 'auto' },
  {
    key: 'recipeNo',
    label: 'Recipe #',
    width: 'auto',
    headerClass: 'text-center',
    cellClass: 'text-center',
  },
  { key: 'product', label: 'Product', width: 'auto' },
  { key: 'moment', label: 'Moment', width: 'auto' },
  { key: 'funnel', label: 'Funnel', width: 'auto' },
  { key: 'goLive', label: 'Go Live', width: 'auto' },
  { key: 'url', label: 'Url', width: 'auto' },
  { key: 'angle', label: 'Angle', width: 'auto' },
  { key: 'audience', label: 'Audience', width: 'auto' },
  { key: 'status', label: 'Status', width: 'auto' },
  { key: 'primary', label: 'Primary', width: 'auto' },
  { key: 'headline', label: 'Headline', width: 'auto' },
  { key: 'description', label: 'Description', width: 'auto' },
];

const assetCols = [
  {
    key: '1x1',
    label: '1x1',
    width: '48px',
    headerClass: 'text-center',
    cellClass: 'text-center',
  },
  {
    key: '9x16',
    label: '9x16',
    width: '48px',
    headerClass: 'text-center',
    cellClass: 'text-center',
  },
];

const allColumnDefs = [...baseColumnDefs, ...assetCols];

const baseColumnKeys = new Set(baseColumnDefs.map((c) => c.key));
const structuralKeys = new Set([
  'components',
  'metadata',
  'assets',
  'type',
  'selected',
  'brandCode',
]);

const shouldOmitKey = (k) => {
  const matchBase = Array.from(baseColumnKeys).some((b) => {
    if (b === 'product') return k === b;
    return k === b || k.startsWith(`${b}.`);
  });
  const matchStructural = Array.from(structuralKeys).some(
    (b) => k === b || k.startsWith(`${b}.`),
  );
  return matchBase || matchStructural;
};

const flattenMeta = (obj, prefix = '', res = {}) => {
  Object.entries(obj || {}).forEach(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') {
      if (Array.isArray(v)) {
        v.forEach((item, idx) => {
          if (item && typeof item === 'object') {
            flattenMeta(item, `${key}.${idx}`, res);
          } else {
            res[`${key}.${idx}`] = item;
          }
        });
      } else {
        flattenMeta(v, key, res);
      }
    } else {
      res[key] = v;
    }
  });
  Object.keys(res).forEach((k) => {
    if (shouldOmitKey(k)) delete res[k];
  });
  return res;
};

const ClientData = ({ brandCodes = [] }) => {
  const [months, setMonths] = useState([]);
  const [dueMonths, setDueMonths] = useState([]);
  const [brands, setBrands] = useState([]);
  const [month, setMonth] = useState('');
  const [dueMonth, setDueMonth] = useState('');
  const [brand, setBrand] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedRows, setEditedRows] = useState({});
  const [showApprovedOnly, setShowApprovedOnly] = useState(false);
  const nonEditable = new Set([
    'recipeNo',
    '1x1',
    '9x16',
    'storeId',
    'groupName',
    'product',
    'status',
  ]);
  const displayedRows = showApprovedOnly
    ? rows.filter((r) => (r.status || '').toLowerCase() === 'approved')
    : rows;

  useEffect(() => {
    const fetchFilters = async () => {
      if (!brandCodes.length) {
        setMonths([]);
        setDueMonths([]);
        setBrands([]);
        return;
      }
      try {
        const chunks = [];
        for (let i = 0; i < brandCodes.length; i += 10) {
          chunks.push(brandCodes.slice(i, i + 10));
        }
        const snaps = await Promise.all(
          chunks.map((chunk) =>
            getDocs(
              query(collection(db, 'adGroups'), where('brandCode', 'in', chunk))
            )
          )
        );
        const monthSet = new Set();
        const dueMonthSet = new Set();
        const brandSet = new Set();
        snaps.forEach((snap) => {
          snap.docs.forEach((d) => {
            const data = d.data();
            if (data.month) monthSet.add(data.month);
            const dueDate = data.dueDate?.toDate ? data.dueDate.toDate() : data.dueDate;
            if (dueDate instanceof Date && !isNaN(dueDate)) {
              dueMonthSet.add(monthKey(dueDate));
            }
            if (data.brandCode) brandSet.add(data.brandCode);
          });
        });
        setMonths(Array.from(monthSet).sort());
        setDueMonths(Array.from(dueMonthSet).sort());
        setBrands(Array.from(brandSet).sort());
      } catch (err) {
        console.error('Failed to fetch filter data', err);
      }
    };
    fetchFilters();
  }, [brandCodes]);

  useEffect(() => {
    const fetchRows = async () => {
      if (!brandCodes.includes(brand) || (!month && !dueMonth)) {
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
        const [gSnap, brandSnap] = await Promise.all([
          getDocs(query(...args)),
          getDocs(query(collection(db, 'brands'), where('code', '==', brand))),
        ]);
        const brandStoreId = brandSnap.empty ? '' : brandSnap.docs[0].data().storeId || '';
        const list = [];
        for (const gDoc of gSnap.docs) {
          const gData = gDoc.data();
          const groupMeta = flattenMeta(gData.metadata || {});
          const rSnap = await getDocs(collection(db, 'adGroups', gDoc.id, 'recipes'));
          const aSnap = await getDocs(collection(db, 'adGroups', gDoc.id, 'assets'));
          const cSnap = await getDocs(collection(db, 'adGroups', gDoc.id, 'copyCards'));
          const copiesByProduct = {};
          cSnap.docs.forEach((d) => {
            const data = d.data();
            const prodName = data.product || '';
            if (!copiesByProduct[prodName]) copiesByProduct[prodName] = [];
            copiesByProduct[prodName].push(data);
          });

          const assetMap = {};
          aSnap.docs.forEach((aDoc) => {
            const aData = aDoc.data();
            if (["archived", "rejected"].includes(aData.status)) return;
            const info = parseAdFilename(aData.filename || '');
            const recipe = String(aData.recipeCode || info.recipeCode || '');
            const url = aData.adUrl || aData.firebaseUrl || aData.url;
            if (!recipe || !url) return;
            const normalized = recipe.replace(/^0+/, '');
            let aspect = info.aspectRatio || aData.aspectRatio || '';
            const aspectValid = /^\d+x\d+$/.test(aspect);
            if (!aspectValid && aData.filename) {
              const base = aData.filename.replace(/\.[^/.]+$/, '');
              const match = base.match(/(\d+x\d+)/);
              if (match) aspect = match[1];
            }
            aspect = aspect.replace(/_?V\d+$/i, '').replace(/s$/, '');
            if (!['1x1', '9x16'].includes(aspect)) {
              if (!aspect) {
                aspect = '9x16';
              } else {
                return;
              }
            }
            const label = aspect;
            const entry = { url, label, status: aData.status || '' };
            if (!assetMap[recipe]) assetMap[recipe] = [];
            assetMap[recipe].push(entry);
            if (normalized !== recipe) {
              if (!assetMap[normalized]) assetMap[normalized] = [];
              assetMap[normalized].push(entry);
            }
          });

          rSnap.docs.forEach((rDoc, idx) => {
            const rData = rDoc.data();
            const merged = {
              ...rData,
              ...(rData.components || {}),
              ...(rData.metadata || {}),
            };
            const recipeMeta = flattenMeta(merged);
            const recipeNo = rData.recipeNo || rDoc.id || idx + 1;
            const product =
              rData.product?.name ||
              rData.product ||
              rData.components?.['product.name'] ||
              '';
            const url =
              rData.metadata?.url ||
              rData.url ||
              rData.product?.url ||
              rData.components?.product?.url ||
              rData.components?.['product.url'] ||
              '';
            const copyList = copiesByProduct[product] || [];
            const copy =
              copyList.length > 0
                ? copyList[Math.floor(Math.random() * copyList.length)]
                : {};
            const angle =
              rData.metadata?.angle ||
              rData.components?.angle ||
              rData.angle ||
              '';
            const audience =
              rData.metadata?.audience ||
              rData.audience ||
              rData.components?.audience ||
              '';
            const moment =
              rData.metadata?.moment ||
              gData.metadata?.moment ||
              '';
            const funnel =
              rData.metadata?.funnel ||
              gData.metadata?.funnel ||
              '';
            const goLive =
              rData.metadata?.goLive ||
              gData.metadata?.goLive ||
              '';
            const primary = rData.metadata?.primary || copy.primary || '';
            const headline = rData.metadata?.headline || copy.headline || '';
            const description =
              rData.metadata?.description || copy.description || '';
            const assets =
              rData.status === 'archived' || rData.status === 'rejected'
                ? []
                : assetMap[String(recipeNo)] || [];
            const status = assets[0]?.status || rData.status || '';
            const row = {
              id: `${gDoc.id}|${rDoc.id}`,
              groupName: gData.name || gDoc.id,
              recipeNo,
              product,
              url,
              angle,
              audience,
              status,
              primary,
              headline,
              description,
              moment,
              funnel,
              goLive,
              ...groupMeta,
              ...recipeMeta,
            };
            assets.forEach(({ url, label }) => {
              if (['1x1', '9x16'].includes(label)) {
                row[label] = url;
              }
            });
            row.storeId = brandStoreId || gData.storeId || row.storeId || '';
            list.push(row);
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
  }, [brand, month, dueMonth, brandCodes]);

  const handleCellChange = (rowId, key, value) => {
    setEditedRows((prev) => ({
      ...prev,
      [rowId]: { ...(prev[rowId] || {}), [key]: value },
    }));
  };

  const handleSave = async () => {
    const updates = [];
    Object.entries(editedRows).forEach(([rowId, changes]) => {
      const [groupId, recipeId] = rowId.split('|');
      if (!groupId || !recipeId) return;
      const payload = {};
      Object.entries(changes).forEach(([k, v]) => {
        if (!nonEditable.has(k)) {
          payload[`metadata.${k}`] = v;
        }
      });
      if (Object.keys(payload).length > 0) {
        updates.push(updateDoc(doc(db, 'adGroups', groupId, 'recipes', recipeId), payload));
      }
    });
    try {
      await Promise.all(updates);
      setRows((prev) =>
        prev.map((r) => (editedRows[r.id] ? { ...r, ...editedRows[r.id] } : r)),
      );
      setEditMode(false);
      setEditedRows({});
    } catch (err) {
      console.error('Failed to save edits', err);
    }
  };

  const buildCsv = () => {
    if (!displayedRows.length) return '';
    const headers = allColumnDefs.map((c) => c.label);
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const newline = '\r\n';
    return [
      headers.join(','),
      ...displayedRows.map((r) =>
        allColumnDefs
          .map((c) => {
            switch (c.key) {
              case 'recipeNo':
                return r.recipeNo;
              case '1x1':
              case '9x16':
                return r[c.key] || '';
              default:
                return r[c.key] || '';
            }
          })
          .map(escape)
          .join(',')
      ),
    ].join(newline);
  };

  const handleCopy = async () => {
    const csv = buildCsv();
    if (!csv) return;
    await copyCsvToClipboard(csv);
  };

  const handleExport = () => {
    const csv = buildCsv();
    if (!csv) return;
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
      <h1 className="text-2xl mb-4">Data</h1>
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
          <label className="flex items-center space-x-1">
            <input
              type="checkbox"
              checked={showApprovedOnly}
              onChange={(e) => setShowApprovedOnly(e.target.checked)}
            />
            <span>Approved Only</span>
          </label>
        </div>
        <div className="flex space-x-2">
          <IconButton
            onClick={editMode ? handleSave : () => setEditMode(true)}
            aria-label={editMode ? 'Save' : 'Edit'}
            disabled={displayedRows.length === 0}
            className={`text-xl ${
              displayedRows.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {editMode ? <FiSave /> : <FiEdit2 />}
          </IconButton>
          <IconButton
            onClick={handleCopy}
            aria-label="Copy CSV"
            disabled={displayedRows.length === 0}
            className={`text-xl ${
              displayedRows.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <FiCopy />
          </IconButton>
          <IconButton
            onClick={handleExport}
            aria-label="Export CSV"
            disabled={displayedRows.length === 0}
            className={`text-xl ${
              displayedRows.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <FiDownload />
          </IconButton>
        </div>
      </div>
      {loading ? (
        <p>Loading...</p>
      ) : displayedRows.length > 0 ? (
        <Table columns={allColumnDefs.map((c) => c.width)}>
          <thead>
            <tr>
              {allColumnDefs.map((c) => (
                <th key={c.key} className={c.headerClass || ''}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((r) => (
              <tr key={r.id}>
                {allColumnDefs.map((c) => {
                  switch (c.key) {
                    case 'recipeNo':
                      return (
                        <td key={c.key} className={c.cellClass || ''}>
                          {r.recipeNo}
                        </td>
                      );
                    case '1x1':
                    case '9x16':
                      const url = r[c.key];
                      return (
                        <td key={c.key} className="text-center">
                          {url ? (
                            <Button
                              as="a"
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              variant="secondary"
                              className="px-2 py-1 text-sm"
                            >
                              Link
                            </Button>
                          ) : (
                            '-'
                          )}
                        </td>
                      );
                    default:
                      const original = r[c.key] ?? '';
                      const value = editedRows[r.id]?.[c.key] ?? original;
                      const editable = editMode && !nonEditable.has(c.key);
                      return (
                        <td key={c.key} className={c.cellClass || ''}>
                          {editable ? (
                            <input
                              className="w-full p-1 border rounded"
                              value={value}
                              onChange={(e) =>
                                handleCellChange(r.id, c.key, e.target.value)
                              }
                            />
                          ) : (
                            value || '-'
                          )}
                        </td>
                      );
                  }
                })}
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

export default ClientData;

