import React, { useState, useEffect, useRef } from 'react';
import { FiTrash } from 'react-icons/fi';
import Table from './components/common/Table';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase/config';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase/config';

import syncAssetLibrary from "./utils/syncAssetLibrary";
import { splitCsvLine } from './utils/csv.js';

const emptyAsset = {
  id: '',
  name: '',
  url: '',
  type: '',
  description: '',
  product: '',
  campaign: '',
  thumbnailUrl: '',
};

const AssetLibrary = ({ brandCode = '' }) => {
  const [assets, setAssets] = useState([]);
  const [selected, setSelected] = useState({});
  const [filter, setFilter] = useState('');
  const [csvColumns, setCsvColumns] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [csvMap, setCsvMap] = useState({});
  const [bulkValues, setBulkValues] = useState({ type: '', product: '', campaign: '' });
  const [loading, setLoading] = useState(false);

  const lastIdx = useRef(null);
  const dragValue = useRef(null);
  const dragField = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        let q = collection(db, 'adAssets');
        if (brandCode) q = query(q, where('brandCode', '==', brandCode));
        const snap = await getDocs(q);
        if (!cancelled) {
          setAssets(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      } catch (err) {
        console.error('Failed to load asset library', err);
      }
    };

    load();
    const up = () => {
      dragValue.current = null;
      dragField.current = null;
    };
    window.addEventListener('mouseup', up);
    return () => {
      cancelled = true;
      window.removeEventListener('mouseup', up);
    };
  }, [brandCode]);

  const addRow = () => {
    const id = Math.random().toString(36).slice(2);
    setAssets((p) => [...p, { ...emptyAsset, id }]);
  };

  const updateRow = (id, field, value) => {
    setAssets((p) => p.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
  };

  const deleteSelected = () => {
    const ids = Object.keys(selected).filter((k) => selected[k]);
    setAssets((p) => p.filter((a) => !ids.includes(a.id)));
    setSelected({});
  };

  const deleteRow = (id) => {
    setAssets((p) => p.filter((a) => a.id !== id));
    setSelected((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
  };

  const bulkEdit = () => {
    const ids = Object.keys(selected).filter((k) => selected[k]);
    setAssets((p) =>
      p.map((a) =>
        ids.includes(a.id)
          ? { ...a, ...Object.fromEntries(Object.entries(bulkValues).filter(([_, v]) => v !== '')) }
          : a
      )
    );
    setBulkValues({ type: '', product: '', campaign: '' });
  };

  const createThumbnails = async () => {
    const rows = assets.filter((a) => selected[a.id]);
    if (rows.length === 0) return;
    setLoading(true);
    try {
      const callable = httpsCallable(functions, 'generateThumbnailsForAssets', { timeout: 60000 });
      const payload = rows.map((r) => ({ url: r.url, name: r.name }));
      const res = await callable({ assets: payload });
      const results = res.data?.results || [];
      setAssets((prev) =>
        prev.map((a) => {
          const match = results.find((r) => r.name === a.name);
          return match && match.thumbnailUrl ? { ...a, thumbnailUrl: match.thumbnailUrl } : a;
        })
      );
    } catch (err) {
      console.error('Failed to generate thumbnails', err);
    }
    setLoading(false);
  };

  const createMissingThumbnails = async () => {
    const rows = assets.filter((a) => !a.thumbnailUrl && a.url);
    if (rows.length === 0) return;
    setLoading(true);
    const callable = httpsCallable(functions, 'generateThumbnailsForAssets', { timeout: 60000 });
    for (const row of rows) {
      try {
        const res = await callable({ assets: [{ url: row.url, name: row.name }] });
        const result = res.data?.results?.[0];
        if (result?.thumbnailUrl) {
          setAssets((prev) =>
            prev.map((a) => (a.id === row.id ? { ...a, thumbnailUrl: result.thumbnailUrl } : a))
          );
        }
      } catch (err) {
        console.error('Failed to generate thumbnail', err);
      }
    }
    setLoading(false);
  };

  const tagRow = async (row) => {
    const callable = httpsCallable(functions, 'generateTagsForAssets', { timeout: 300000 });
    try {
      const res = await callable({ assets: [{ url: row.url, name: row.name }] });
      const result = res.data?.results?.[0];
      if (result) {
        setAssets((prev) =>
          prev.map((a) =>
            a.id === row.id
              ? { ...a, type: result.type || a.type, description: result.description || a.description, product: result.product || a.product, campaign: result.campaign || a.campaign }
              : a
          )
        );
      }
    } catch (err) {
      console.error('Failed to tag asset', err);
    }
  };

  const tagSelected = async () => {
    const rows = assets.filter((a) => selected[a.id] && a.url);
    if (rows.length === 0) return;
    setLoading(true);
    for (const row of rows) {
      // eslint-disable-next-line no-await-in-loop
      await tagRow(row);
    }
    setLoading(false);
  };

  const tagMissing = async () => {
    const rows = assets.filter((a) => (!a.type || !a.description) && a.url);
    if (rows.length === 0) return;
    setLoading(true);
    for (const row of rows) {
      // eslint-disable-next-line no-await-in-loop
      await tagRow(row);
    }
    setLoading(false);
  };

  const saveAssets = async () => {
    try {
      await syncAssetLibrary(brandCode, assets);
      alert('Assets saved');
    } catch (err) {
      console.error('Failed to save assets', err);
    }
  };


  const handleCheckChange = (e, idx, id) => {
    const checked = e.target.checked;
    if (e.shiftKey && lastIdx.current !== null) {
      const start = Math.min(lastIdx.current, idx);
      const end = Math.max(lastIdx.current, idx);
      const ids = filtered.slice(start, end + 1).map((a) => a.id);
      setSelected((p) => {
        const next = { ...p };
        ids.forEach((rid) => {
          next[rid] = checked;
        });
        return next;
      });
    } else {
      setSelected((p) => ({ ...p, [id]: checked }));
      lastIdx.current = idx;
    }
  };

  const handleInputDown = (field, value) => (e) => {
    if (e.altKey) {
      dragValue.current = value;
      dragField.current = field;
    }
  };

  const handleInputOver = (id) => (e) => {
    if (dragValue.current !== null && dragField.current) {
      updateRow(id, dragField.current, dragValue.current);
    }
  };

  const handleCsv = async (e) => {
    const f = e.target.files?.[0];
    setCsvColumns([]);
    setCsvRows([]);
    setCsvMap({});
    if (!f) return;
    const text = await f.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return;
    const headers = splitCsvLine(lines[0]).map((h) => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i]) rows.push(splitCsvLine(lines[i]).map((p) => p.trim()));
    }
    setCsvColumns(headers);
    setCsvRows(rows);
  };

  const addCsvRows = () => {
    const newAssets = csvRows.map((row) => ({
      id: Math.random().toString(36).slice(2),
      name: row[csvMap.name] || '',
      url: row[csvMap.url] || '',
      thumbnailUrl: row[csvMap.thumbnailUrl] || '',
      type: row[csvMap.type] || '',
      description: row[csvMap.description] || '',
      product: row[csvMap.product] || '',
      campaign: row[csvMap.campaign] || '',
    }));
    setAssets((p) => [...p, ...newAssets]);
    setCsvColumns([]);
    setCsvRows([]);
    setCsvMap({});
  };

  const filtered = assets.filter((a) => {
    const term = filter.toLowerCase();
    return (
      !term ||
      a.name.toLowerCase().includes(term) ||
      a.product.toLowerCase().includes(term) ||
      a.campaign.toLowerCase().includes(term)
    );
  });

  return (
    <div>
      <div className="mb-4 flex flex-col sm:flex-row gap-2">
        <button type="button" className="btn-secondary" onClick={addRow}>
          Add Row
        </button>
        <input type="file" accept=".csv" onChange={handleCsv} />
        <input
          type="text"
          placeholder="Filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="p-1 border rounded sm:ml-auto"
        />
      </div>
      {csvColumns.length > 0 && (
        <div className="mb-4 space-y-2">
          {['name', 'url', 'thumbnailUrl', 'type', 'description', 'product', 'campaign'].map((key) => (
            <div key={key}>
              <label className="block text-sm mb-1 capitalize">{key} Column</label>
              <select
                className="p-1 border rounded w-full"
                value={csvMap[key] ?? ''}
                onChange={(e) => setCsvMap({ ...csvMap, [key]: e.target.value })}
              >
                <option value="">Ignore</option>
                {csvColumns.map((c, idx) => (
                  <option key={idx} value={idx}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button type="button" className="btn-primary" onClick={addCsvRows}>
            Add Rows
          </button>
        </div>
      )}
      {Object.keys(selected).some((k) => selected[k]) && (
        <div className="mb-2 flex flex-wrap gap-2 items-end">
          <button type="button" className="btn-delete" onClick={deleteSelected}>
            Delete Selected
          </button>
          <input
            className="p-1 border rounded"
            placeholder="Type"
            value={bulkValues.type}
            onChange={(e) => setBulkValues({ ...bulkValues, type: e.target.value })}
          />
          <input
            className="p-1 border rounded"
            placeholder="Product"
            value={bulkValues.product}
            onChange={(e) => setBulkValues({ ...bulkValues, product: e.target.value })}
          />
          <input
            className="p-1 border rounded"
            placeholder="Campaign"
            value={bulkValues.campaign}
            onChange={(e) => setBulkValues({ ...bulkValues, campaign: e.target.value })}
          />
          <button type="button" className="btn-secondary" onClick={bulkEdit}>
            Apply To Selected
          </button>
        </div>
      )}
      <Table>
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>URL</th>
              <th>Thumbnail</th>
              <th>Type</th>
              <th>Description</th>
              <th>Product</th>
              <th>Campaign</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a, idx) => (
              <tr key={a.id}>
                <td className="text-center">
                  <input
                    type="checkbox"
                    checked={selected[a.id] || false}
                    onChange={(e) => handleCheckChange(e, idx, a.id)}
                  />
                </td>
                <td>
                  <input
                    className="w-full p-1 border rounded"
                    value={a.name}
                    onMouseDown={handleInputDown('name', a.name)}
                    onMouseOver={handleInputOver(a.id)}
                    onChange={(e) => updateRow(a.id, 'name', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="w-full p-1 border rounded"
                    value={a.url}
                    onMouseDown={handleInputDown('url', a.url)}
                    onMouseOver={handleInputOver(a.id)}
                    onChange={(e) => updateRow(a.id, 'url', e.target.value)}
                  />
                </td>
                <td>
                  <span className="relative inline-block group w-full">
                    <input
                      className="w-full p-1 border rounded"
                      value={a.thumbnailUrl}
                      onMouseDown={handleInputDown('thumbnailUrl', a.thumbnailUrl)}
                      onMouseOver={handleInputOver(a.id)}
                      onChange={(e) => updateRow(a.id, 'thumbnailUrl', e.target.value)}
                    />
                    {a.thumbnailUrl && (
                      <img
                        src={a.thumbnailUrl}
                        alt="preview"
                        className="hidden group-hover:block absolute left-full ml-2 top-1/2 -translate-y-1/2 min-w-[100px] w-auto h-auto border shadow-lg z-10"
                      />
                    )}
                  </span>
                </td>
                <td>
                  <input
                    className="w-full p-1 border rounded"
                    value={a.type}
                    onMouseDown={handleInputDown('type', a.type)}
                    onMouseOver={handleInputOver(a.id)}
                    onChange={(e) => updateRow(a.id, 'type', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="w-full p-1 border rounded"
                    value={a.description}
                    onMouseDown={handleInputDown('description', a.description)}
                    onMouseOver={handleInputOver(a.id)}
                    onChange={(e) => updateRow(a.id, 'description', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="w-full p-1 border rounded"
                    value={a.product}
                    onMouseDown={handleInputDown('product', a.product)}
                    onMouseOver={handleInputOver(a.id)}
                    onChange={(e) => updateRow(a.id, 'product', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="w-full p-1 border rounded"
                    value={a.campaign}
                    onMouseDown={handleInputDown('campaign', a.campaign)}
                    onMouseOver={handleInputOver(a.id)}
                    onChange={(e) => updateRow(a.id, 'campaign', e.target.value)}
                  />
                </td>
                <td className="text-center">
                  <button
                    type="button"
                    onClick={() => deleteRow(a.id)}
                    aria-label="Delete"
                    className="btn-delete"
                  >
                    <FiTrash />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      <div className="mt-4 flex gap-2 items-center">
        <button type="button" className="btn-primary" onClick={saveAssets}>
          Save
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={loading || !Object.keys(selected).some((k) => selected[k])}
          onClick={createThumbnails}
        >
          {loading ? 'Processing...' : 'Create Thumbnails'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={loading}
          onClick={createMissingThumbnails}
        >
          {loading ? 'Processing...' : 'Create Missing Thumbnails'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={loading || !Object.keys(selected).some((k) => selected[k])}
          onClick={tagSelected}
        >
          {loading ? 'Processing...' : 'Tag Selected'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={loading}
          onClick={tagMissing}
        >
          {loading ? 'Processing...' : 'Tag Missing'}
        </button>
      </div>
    </div>
  );
};

export default AssetLibrary;
