import React, { useEffect, useMemo, useState } from 'react';
import { FiCheck, FiX } from 'react-icons/fi';
import Modal from './Modal.jsx';
import Button from './Button.jsx';

const BrandCodeSelectionModal = ({
  open = false,
  brands = [],
  selected = [],
  onApply,
  onClose,
  title = 'Manage brand access',
  description = 'Search, sort, and select which brand codes this account can access.',
  emptyMessage = 'No brand codes match your search.',
  applyLabel = 'Apply selection',
}) => {
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [localSelection, setLocalSelection] = useState(new Set(selected));

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSortOrder('asc');
    setLocalSelection(new Set(selected));
  }, [open, selected]);

  const filteredBrands = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = brands
      .filter((code) => code && (!term || code.toLowerCase().includes(term)))
      .sort((a, b) => (sortOrder === 'asc' ? a.localeCompare(b) : b.localeCompare(a)));
    return list;
  }, [brands, search, sortOrder]);

  const toggleBrand = (code) => {
    setLocalSelection((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleApply = () => {
    if (typeof onApply === 'function') {
      onApply(Array.from(localSelection).sort((a, b) => a.localeCompare(b)));
    }
  };

  const handleSelectVisible = () => {
    setLocalSelection((prev) => {
      const next = new Set(prev);
      filteredBrands.forEach((code) => next.add(code));
      return next;
    });
  };

  const handleClearAll = () => {
    setLocalSelection(new Set());
  };

  if (!open) return null;

  return (
    <Modal sizeClass="max-w-2xl w-full">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
            {description && (
              <p className="text-sm text-gray-500 dark:text-gray-300">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:hover:bg-[var(--dark-sidebar-hover)]"
            aria-label="Close brand selection"
          >
            <FiX />
          </button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brand codes"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)] dark:text-gray-200"
          />
          <div className="flex items-center gap-2">
            <label htmlFor="brand-sort" className="text-sm text-gray-600 dark:text-gray-300">
              Sort
            </label>
            <select
              id="brand-sort"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)] dark:text-gray-200"
            >
              <option value="asc">A → Z</option>
              <option value="desc">Z → A</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
          <button
            type="button"
            onClick={handleSelectVisible}
            className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:bg-[var(--dark-sidebar-hover)] dark:hover:bg-[var(--dark-sidebar)]"
          >
            Select visible
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:bg-[var(--dark-sidebar-hover)] dark:hover:bg-[var(--dark-sidebar)]"
          >
            Clear all
          </button>
          <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
            {localSelection.size} selected
          </span>
        </div>
        <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)]">
          {filteredBrands.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-300">{emptyMessage}</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {filteredBrands.map((code) => {
                const active = localSelection.has(code);
                return (
                  <li key={code}>
                    <button
                      type="button"
                      onClick={() => toggleBrand(code)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition hover:shadow focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] ${
                        active
                          ? 'border-[var(--accent-color)] bg-white text-[var(--accent-color)] dark:bg-[var(--dark-sidebar)]'
                          : 'border-gray-200 bg-white text-gray-700 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-200'
                      }`}
                      aria-pressed={active}
                    >
                      <span>{code}</span>
                      {active && <FiCheck className="text-base" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="neutral" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" onClick={handleApply}>
            {applyLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default BrandCodeSelectionModal;
