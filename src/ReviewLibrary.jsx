import React, { useState, useEffect } from 'react';
import { splitCsvLine } from './utils/csv.js';

const emptyReview = { id: '', name: '', body: '' };

const ReviewLibrary = ({ brandCode = '' }) => {
  const [reviews, setReviews] = useState([]);
  const [csvColumns, setCsvColumns] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [csvMap, setCsvMap] = useState({});

  useEffect(() => {
    const key = brandCode ? `reviews_${brandCode}` : 'reviews';
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setReviews(parsed);
      } catch (err) {
        console.error('Failed to parse stored reviews', err);
      }
    }
  }, [brandCode]);

  const addRow = () => {
    const id = Math.random().toString(36).slice(2);
    setReviews((p) => [...p, { ...emptyReview, id }]);
  };

  const updateRow = (id, field, value) => {
    setReviews((p) => p.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const deleteRow = (id) => {
    setReviews((p) => p.filter((r) => r.id !== id));
  };

  const saveReviews = () => {
    try {
      const key = brandCode ? `reviews_${brandCode}` : 'reviews';
      localStorage.setItem(key, JSON.stringify(reviews));
      alert('Reviews saved');
    } catch (err) {
      console.error('Failed to save reviews', err);
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
    }));
    setReviews((p) => [...p, ...newReviews]);
    setCsvColumns([]);
    setCsvRows([]);
    setCsvMap({});
  };

  return (
    <div>
      <div className="mb-4 flex gap-2 flex-wrap">
        <button type="button" className="btn-secondary" onClick={addRow}>
          Add Row
        </button>
        <input type="file" accept=".csv" onChange={handleCsv} />
        <button type="button" className="btn-primary" onClick={saveReviews}>
          Save Reviews
        </button>
      </div>
      {csvColumns.length > 0 && (
        <div className="mb-4 space-y-2">
          {['name', 'body'].map((key) => (
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
        <div className="overflow-x-auto table-container">
          <table className="ad-table min-w-max text-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Body</th>
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
          </table>
        </div>
      )}
    </div>
  );
};

export default ReviewLibrary;
