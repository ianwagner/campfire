import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { FiDownload, FiColumns, FiCopy } from 'react-icons/fi';
import { db } from './firebase/config';
import Table from './components/common/Table';
import IconButton from './components/IconButton.jsx';
import Button from './components/Button.jsx';
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

const formatLabel = (s) =>
  s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const baseColumnDefs = [
  { key: 'groupName', label: 'Ad Group', width: 'auto' },
  {
    key: 'recipeNo',
    label: 'Recipe #',
    width: 'auto',
    headerClass: 'text-center',
    cellClass: 'text-center',
  },
  { key: 'product', label: 'Product', width: 'auto' },
  { key: 'url', label: 'Url', width: 'auto' },
  { key: 'angle', label: 'Angle', width: 'auto' },
  { key: 'audience', label: 'Audience', width: 'auto' },
  { key: 'status', label: 'Status', width: 'auto' },
  { key: 'primary', label: 'Primary', width: 'auto' },
  { key: 'headline', label: 'Headline', width: 'auto' },
  { key: 'description', label: 'Description', width: 'auto' },
];

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
    // Allow nested product fields like product.description or product.benefits
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

const AdminDistribution = () => {
  const [months, setMonths] = useState([]);
  const [dueMonths, setDueMonths] = useState([]);
  const [brands, setBrands] = useState([]);
  const [month, setMonth] = useState('');
  const [dueMonth, setDueMonth] = useState('');
  const [brand, setBrand] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assetCols, setAssetCols] = useState([]);
  const [extraCols, setExtraCols] = useState([]);
  const allColumnDefs = [...baseColumnDefs, ...assetCols, ...extraCols];
  const [selectedCols, setSelectedCols] = useState(
    baseColumnDefs.map((c) => c.key),
  );
  const [showColMenu, setShowColMenu] = useState(false);
  const assetKeySet = new Set(assetCols.map((c) => c.key));

  // Keep selected columns limited to those that exist but do not
  // automatically enable newly discovered metadata columns so they can be
  // toggled on by the user via the column menu.
  useEffect(() => {
    const valid = new Set(
      [...baseColumnDefs, ...assetCols, ...extraCols].map((c) => c.key),
    );
    setSelectedCols((prev) => {
      const filtered = prev.filter((k) => valid.has(k));
      assetCols.forEach((c) => {
        if (!filtered.includes(c.key)) filtered.push(c.key);
      });
      return filtered;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetCols, extraCols]);

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
      if (!month && !dueMonth) {
        setRows([]);
        return;
      }
      setLoading(true);
      try {
        const args = [collection(db, 'adGroups')];
        if (brand) args.push(where('brandCode', '==', brand));
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
        const metaKeys = new Set();
        const aspectKeys = new Set();
        for (const gDoc of gSnap.docs) {
          const gData = gDoc.data();
          const groupMeta = flattenMeta(gData.metadata || {});
          Object.keys(groupMeta).forEach((k) => metaKeys.add(k));
          const rSnap = await getDocs(
            collection(db, 'adGroups', gDoc.id, 'recipes'),
          );
          const aSnap = await getDocs(
            collection(db, 'adGroups', gDoc.id, 'assets'),
          );
          const cSnap = await getDocs(
            collection(db, 'adGroups', gDoc.id, 'copyCards'),
          );
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
            if (!aspect) aspect = '9x16';
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
            Object.keys(recipeMeta).forEach((k) => metaKeys.add(k));
            const recipeNo = rData.recipeNo || rDoc.id || idx + 1;
            const product =
              rData.product?.name ||
              rData.product ||
              rData.components?.['product.name'] ||
              '';
            const url =
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
            const audience = rData.audience || rData.components?.audience || '';
            const assets =
              rData.status === 'archived' || rData.status === 'rejected'
                ? []
                : assetMap[String(recipeNo)] || [];
            const status = assets[0]?.status || rData.status || '';
            const row = {
              id: `${gDoc.id}_${rDoc.id}`,
              groupName: gData.name || gDoc.id,
              recipeNo,
              product,
              url,
              angle,
              audience,
              status,
              primary: copy.primary || '',
              headline: copy.headline || '',
              description: copy.description || '',
              ...groupMeta,
              ...recipeMeta,
            };
            assets.forEach(({ url, label }) => {
              if (!row[label]) row[label] = url;
              aspectKeys.add(label);
            });
            list.push(row);
          });
        }
        setRows(list);
        setAssetCols(
          Array.from(aspectKeys)
            .sort()
            .map((k) => ({
              key: k,
              label: k,
              width: '8rem',
              headerClass: 'text-center',
              cellClass: 'text-center',
            })),
        );
        setExtraCols(
          Array.from(metaKeys).map((k) => ({
            key: k,
            label: formatLabel(k),
            width: 'auto',
          })),
        );
      } catch (err) {
        console.error('Failed to fetch recipes', err);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    fetchRows();
  }, [month, dueMonth, brand]);

  const buildCsv = () => {
    if (!rows.length) return '';
    const cols = allColumnDefs.filter((c) => selectedCols.includes(c.key));
    const headers = cols.map((c) => c.label);
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const newline = '\r\n';
    return [
      headers.join(','),
      ...rows.map((r) =>
        cols
          .map((c) => {
            switch (c.key) {
              case 'groupName':
                return r.groupName;
              case 'recipeNo':
                return r.recipeNo;
              case 'product':
                return r.product;
              case 'angle':
                return r.angle;
              case 'audience':
                return r.audience || '-';
              case 'status':
                return r.status || '-';
              default:
                return r[c.key] || '';
            }
          })
          .map(escape)
          .join(','),
      ),
    ].join(newline);
  };

  const handleExport = () => {
    const csv = buildCsv();
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const fileParts = [];
    fileParts.push(brand || 'all-brands');
    if (month) fileParts.push(month);
    if (dueMonth) fileParts.push(`due-${dueMonth}`);
    const file = `${fileParts.join('_') || 'distribution'}.csv`;
    link.setAttribute('download', file);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopy = async () => {
    const csv = buildCsv();
    if (!csv) return;
    await copyCsvToClipboard(csv);
  };

  const toggleColumn = (key) => {
    setSelectedCols((p) =>
      p.includes(key) ? p.filter((k) => k !== key) : [...p, key],
    );
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
        <div className="flex items-center gap-2 relative">
          <IconButton
            onClick={() => setShowColMenu((p) => !p)}
            aria-label="Select Columns"
            className="text-xl"
          >
            <FiColumns />
          </IconButton>
          {showColMenu && (
            <div className="absolute right-0 top-full mt-2 bg-white border rounded shadow p-2 z-10 space-y-1 max-h-96 overflow-y-auto w-max max-w-[300px]">
              {allColumnDefs.map((c) => (
                <label key={c.key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedCols.includes(c.key)}
                    onChange={() => toggleColumn(c.key)}
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          )}
          <IconButton
            onClick={handleCopy}
            aria-label="Copy CSV"
            disabled={rows.length === 0}
            className={`text-xl ${rows.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <FiCopy />
          </IconButton>
          <IconButton
            onClick={handleExport}
            aria-label="Export CSV"
            disabled={rows.length === 0}
            className={`text-xl ${rows.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <FiDownload />
          </IconButton>
        </div>
      </div>
      {loading ? (
        <p>Loading...</p>
      ) : rows.length > 0 ? (
        <Table
          columns={allColumnDefs
            .filter((c) => selectedCols.includes(c.key))
            .map((c) => c.width)}
        >
          <thead>
            <tr>
              {allColumnDefs
                .filter((c) => selectedCols.includes(c.key))
                .map((c) => (
                  <th key={c.key} className={c.headerClass || ''}>
                    {c.label}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {allColumnDefs
                  .filter((c) => selectedCols.includes(c.key))
                  .map((c) => {
                    switch (c.key) {
                      case 'groupName':
                        return <td key={c.key}>{r.groupName}</td>;
                      case 'recipeNo':
                        return (
                          <td key={c.key} className={c.cellClass || ''}>
                            {r.recipeNo}
                          </td>
                        );
                      case 'product':
                        return <td key={c.key}>{r.product}</td>;
                      case 'angle':
                        return <td key={c.key}>{r.angle}</td>;
                      case 'audience':
                        return <td key={c.key}>{r.audience || '-'}</td>;
                      case 'status':
                        return <td key={c.key}>{r.status || '-'}</td>;
                      default:
                        if (assetKeySet.has(c.key)) {
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
                        }
                        return <td key={c.key}>{r[c.key] ?? '-'}</td>;
                    }
                  })}
              </tr>
            ))}
          </tbody>
        </Table>
      ) : month || dueMonth ? (
        <p>No recipes found.</p>
      ) : null}
    </div>
  );
};

export default AdminDistribution;
