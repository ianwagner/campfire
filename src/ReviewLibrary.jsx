import React, { useState, useEffect } from 'react';
import SaveButton from './components/SaveButton.jsx';
import useUnsavedChanges from './useUnsavedChanges.js';
import { splitCsvLine } from './utils/csv.js';
import Table from './components/common/Table';

const emptyReview = { id: '', name: '', body: '', title: '', rating: '', product: '' };

const inputClassName =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]';

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
      name: csvMap.name !== undefined && csvMap.name !== '' ? row[csvMap.name] || '' : '',
      body: csvMap.body !== undefined && csvMap.body !== '' ? row[csvMap.body] || '' : '',
      title: csvMap.title !== undefined && csvMap.title !== '' ? row[csvMap.title] || '' : '',
      rating: csvMap.rating !== undefined && csvMap.rating !== '' ? row[csvMap.rating] || '' : '',
      product: csvMap.product !== undefined && csvMap.product !== '' ? row[csvMap.product] || '' : '',
    }));
    setReviews((p) => [...p, ...newReviews]);
    setDirty(true);
    setCsvColumns([]);
    setCsvRows([]);
    setCsvMap({});
  };

  useUnsavedChanges(dirty, saveReviews);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Customer Reviews</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Centralize testimonials you can pull into briefs, landing pages, and ad creative.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-[var(--accent-color)] hover:text-[var(--accent-color)]" onClick={addRow}>
              Add Row
            </button>
            <label className="relative inline-flex cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-[var(--accent-color)] hover:text-[var(--accent-color)]">
              <input type="file" accept=".csv" onChange={handleCsv} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              Import CSV
            </label>
            <SaveButton onClick={saveReviews} canSave={dirty} loading={saving} />
          </div>
        </div>

        {csvColumns.length > 0 && (
          <div className="mt-6 space-y-3 rounded-2xl border border-dashed border-gray-300 bg-white/60 p-4 dark:border-gray-700/60 dark:bg-[var(--dark-sidebar-hover)]">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Map CSV Columns</h3>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {['name', 'body', 'title', 'rating', 'product'].map((key) => (
                <div key={key} className="space-y-1">
                  <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {key}
                  </label>
                  <select
                    className={`${inputClassName} text-sm`}
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
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded-lg bg-[var(--accent-color)] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:brightness-95"
                onClick={addCsvRows}
              >
                Add Rows
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 space-y-4">
          {reviews.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 p-6 text-sm text-gray-600 dark:border-gray-700/60 dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-300">
              No reviews yet. Add rows manually or import them from a CSV file.
            </div>
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
                        className={inputClassName}
                        value={r.name}
                        onChange={(e) => updateRow(r.id, 'name', e.target.value)}
                      />
                    </td>
                    <td>
                      <textarea
                        className={`${inputClassName} h-24 resize-y`}
                        value={r.body}
                        onChange={(e) => updateRow(r.id, 'body', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className={inputClassName}
                        value={r.title}
                        onChange={(e) => updateRow(r.id, 'title', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        className={inputClassName}
                        value={r.rating}
                        onChange={(e) => updateRow(r.id, 'rating', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className={inputClassName}
                        value={r.product}
                        onChange={(e) => updateRow(r.id, 'product', e.target.value)}
                      />
                    </td>
                    <td className="text-center">
                      <button
                        type="button"
                        className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
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
      </section>
    </div>
  );
};

export default ReviewLibrary;
