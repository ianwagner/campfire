import React, { useMemo, useState } from 'react';
import { FiPlus, FiTrash2 } from 'react-icons/fi';
import {
  MONTHLY_BRIEF_BODY_COPY,
  MONTHLY_BRIEF_MENU_LABEL,
  formatDeliveryWindow,
  getMonthlyBriefHeader,
  getMonthlyBriefIntro,
} from './monthlyBriefCopy.js';

const DEFAULT_FIELDS = ['products', 'assets', 'notes', 'deadline'];

const normalizeFields = (fields) => {
  if (!Array.isArray(fields) || fields.length === 0) {
    return new Set(DEFAULT_FIELDS);
  }
  return new Set(fields);
};

const parseProducts = (value) =>
  value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

const sanitizeAssets = (list) =>
  list
    .map((asset) => ({
      name: (asset?.name || '').trim(),
      url: (asset?.url || '').trim(),
      type: asset?.type || '',
    }))
    .filter((asset) => asset.name || asset.url);

const BriefForm = ({
  period,
  agencyName,
  deliveryWindowDays,
  instructions,
  onSubmit,
  onCancel,
  submitting = false,
  initialValues = {},
  fields,
  locale = 'en-US',
}) => {
  const fieldSet = useMemo(() => normalizeFields(fields), [fields]);
  const productsInitial = Array.isArray(initialValues.products)
    ? initialValues.products.join('\n')
    : initialValues.products || '';
  const assetsInitial = Array.isArray(initialValues.assets) ? initialValues.assets : [];
  const [productsText, setProductsText] = useState(productsInitial);
  const [notes, setNotes] = useState(initialValues.notes || '');
  const [deadline, setDeadline] = useState(initialValues.deadline || '');
  const [assets, setAssets] = useState(() => {
    if (assetsInitial.length === 0) return [{ name: '', url: '', type: '' }];
    return assetsInitial.map((asset) => ({ name: asset.name || '', url: asset.url || '', type: asset.type || '' }));
  });
  const [error, setError] = useState('');

  const handleAssetChange = (index, key, value) => {
    setAssets((prev) => prev.map((asset, idx) => (idx === index ? { ...asset, [key]: value } : asset)));
  };

  const handleAddAsset = () => {
    setAssets((prev) => [...prev, { name: '', url: '', type: '' }]);
  };

  const handleRemoveAsset = (index) => {
    setAssets((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const payload = {};
    if (fieldSet.has('products')) {
      payload.products = parseProducts(productsText);
    }
    if (fieldSet.has('notes')) {
      payload.notes = notes.trim();
    }
    if (fieldSet.has('deadline')) {
      payload.deadline = deadline ? deadline.trim() : null;
    }
    if (fieldSet.has('assets')) {
      payload.assets = sanitizeAssets(assets);
    }

    if (fieldSet.has('assets') && (!payload.assets || payload.assets.length === 0)) {
      payload.assets = [];
    }

    if (fieldSet.has('products') && payload.products.length === 0 && !payload.notes) {
      setError('Add at least one product/campaign or leave a note so we know where to begin.');
      return;
    }

    try {
      await onSubmit(payload);
    } catch (err) {
      console.error('Failed to submit brief', err);
      setError(err.message || 'Something went wrong. Please try again.');
    }
  };

  const windowCopy = formatDeliveryWindow(deliveryWindowDays, { includeRolling: true });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-accent uppercase tracking-wide">{MONTHLY_BRIEF_MENU_LABEL}</p>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{getMonthlyBriefHeader(agencyName)}</h1>
        <p className="text-lg text-gray-700 dark:text-gray-300">{getMonthlyBriefIntro(period, locale)}</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">{MONTHLY_BRIEF_BODY_COPY}</p>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{windowCopy}</p>
      </header>

      {instructions && (
        <div className="border border-dashed border-accent/50 rounded-xl p-4 bg-accent-10 text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap">
          {instructions}
        </div>
      )}

      {fieldSet.has('products') && (
        <div>
          <label htmlFor="monthly-brief-products" className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
            Products & Campaigns
          </label>
          <textarea
            id="monthly-brief-products"
            value={productsText}
            onChange={(e) => setProductsText(e.target.value)}
            placeholder="List each product or campaign on its own line"
            className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 min-h-[140px] bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <p className="mt-1 text-xs text-gray-500">We’ll use these to guide creative direction.</p>
        </div>
      )}

      {fieldSet.has('assets') && (
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Assets</h2>
            <p className="text-xs text-gray-500">Share any must-use visuals or references (URLs for now).</p>
          </div>
          <div className="space-y-3">
            {assets.map((asset, index) => (
              <div
                key={`asset-${index}`}
                className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 flex flex-col sm:flex-row gap-2"
              >
                <input
                  type="text"
                  value={asset.name}
                  onChange={(e) => handleAssetChange(index, 'name', e.target.value)}
                  placeholder="Asset name"
                  className="flex-1 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <input
                  type="url"
                  value={asset.url}
                  onChange={(e) => handleAssetChange(index, 'url', e.target.value)}
                  placeholder="https://example.com/asset"
                  className="flex-1 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
                />
                {assets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveAsset(index)}
                    className="shrink-0 inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                    aria-label="Remove asset"
                  >
                    <FiTrash2 />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={handleAddAsset}
              className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-accent-dark"
            >
              <FiPlus /> Add another asset
            </button>
          </div>
        </div>
      )}

      {fieldSet.has('notes') && (
        <div>
          <label htmlFor="monthly-brief-notes" className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
            Notes
          </label>
          <textarea
            id="monthly-brief-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Need anything specific? Drop creative direction, offers, or context here."
            className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 min-h-[120px] bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      )}

      {fieldSet.has('deadline') && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <label htmlFor="monthly-brief-deadline" className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Target launch date (optional)
          </label>
          <input
            id="monthly-brief-deadline"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-3 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-full border border-gray-300 dark:border-gray-700 text-sm"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className={`px-5 py-2 rounded-full text-sm font-semibold text-white bg-accent hover:bg-accent-dark transition-colors ${
            submitting ? 'opacity-70 cursor-wait' : ''
          }`}
        >
          {submitting ? 'Sending...' : 'Submit brief'}
        </button>
      </div>
    </form>
  );
};

export default BriefForm;
