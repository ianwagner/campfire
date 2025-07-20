import React, { useState, useEffect } from 'react';
import SaveButton from './components/SaveButton.jsx';
import useUnsavedChanges from './useUnsavedChanges.js';
import { splitCsvLine } from './utils/csv.js';
import Table from './components/common/Table';

const emptyReview = { id: '', name: '', body: '', title: '', rating: '', product: '' };

const ReviewLibrary = ({ brandCode = '' }) => {
  const [reviews, setReviews] = useState([]);
  const [csvColumns, setCsvColumns] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [csvMap, setCsvMap] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const key = brandCode ? `reviews_${brandCode}` : 'reviews';
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setReviews(parsed.map((r) => ({ ...emptyReview, ...r })));
          setDirty(false);
        }
      } catch (err) {
        console.error('Failed to parse stored reviews', err);
      }
    }
  }, [brandCode]);

  const addRow = () => {
    const id = Math.random().toString(36).slice(2);
    setReviews((p) => [...p, { ...emptyReview, id }]);
    setDirty(true);
  };

  const updateRow = (id, field, value) => {
    setReviews((p) => p.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    setDirty(true);
  };

  const deleteRow = (id) => {
    setReviews((p) => p.filter((r) => r.id !== id));
    setDirty(true);
  };

  const saveReviews = () => {
    try {
      setSaving(true);
      const key = brandCode ? `reviews_${brandCode}` : 'reviews';
      localStorage.setItem(key, JSON.stringify(reviews));
      setDirty(false);
    } catch (err) {
      console.error('Failed to save reviews', err);
    } finally {
      setSaving(false);
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
    const newReviews = csvRows.map((row) => ({
      id: Math.random().toString(36).slice(2),
      name:
        csvMap.name !== undefined && csvMap.name !== ''
          ? row[csvMap.name] || ''
          : '',
      body:
        csvMap.body !== undefined && csvMap.body !== ''
          ? row[csvMap.body] || ''
          : '',
      title:
        csvMap.title !== undefined && csvMap.title !== ''
          ? row[csvMap.title] || ''
          : '',
      rating:
        csvMap.rating !== undefined && csvMap.rating !== ''
          ? row[csvMap.rating] || ''
          : '',
      product:
        csvMap.product !== undefined && csvMap.product !== ''
          ? row[csvMap.product] || ''
          : '',
    }));
    setReviews((p) => [...p, ...newReviews]);
    setDirty(true);
    setCsvColumns([]);
    setCsvRows([]);
    setCsvMap({});
  };

  useUnsavedChanges(dirty, saveReviews);

  return (
    <div>
      <div className="mb-4 flex gap-2 flex-wrap">
        <button type="button" className="btn-secondary" onClick={addRow}>
          Add Row
        </button>
        <input type="file" accept=".csv" onChange={handleCsv} />
        <SaveButton onClick={saveReviews} canSave={dirty} loading={saving} />
      </div>
      {csvColumns.length > 0 && (
        <div className="mb-4 space-y-2">
          {['name', 'body', 'title', 'rating', 'product'].map((key) => (
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
      {reviews.length === 0 ? (
        <p>No reviews found.</p>
      ) : (
        <Table>
          <thead>
              <tr>
                <th>Name</th>
                <th>Body</th>
                <th>Title</th>
                <th>Rating</th>
                <th>Product</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      className="p-1 border rounded w-full"
                      value={r.name}
                      onChange={(e) => updateRow(r.id, 'name', e.target.value)}
                    />
                  </td>
                  <td>
                    <textarea
                      className="p-1 border rounded w-full"
                      value={r.body}
                      onChange={(e) => updateRow(r.id, 'body', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="p-1 border rounded w-full"
                      value={r.title}
                      onChange={(e) => updateRow(r.id, 'title', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      className="p-1 border rounded w-full"
                      value={r.rating}
                      onChange={(e) => updateRow(r.id, 'rating', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="p-1 border rounded w-full"
                      value={r.product}
                      onChange={(e) => updateRow(r.id, 'product', e.target.value)}
                    />
                  </td>
                  <td className="text-center">
                    <button
                      type="button"
                      className="btn-delete"
                      onClick={() => deleteRow(r.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
      )}
    </div>
  );
};

export default ReviewLibrary;
