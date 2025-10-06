import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { FiEdit3, FiSave, FiTrash2 } from 'react-icons/fi';

const normalizeText = (value) => (typeof value === 'string' ? value : value ? String(value) : '');

const createDraftFromCard = (card) => ({
  id: card.id || '',
  localId: card.id || `local-${Math.random().toString(36).slice(2, 10)}`,
  primary: normalizeText(card.primary),
  headline: normalizeText(card.headline),
  description: normalizeText(card.description),
  original: {
    primary: normalizeText(card.primary),
    headline: normalizeText(card.headline),
    description: normalizeText(card.description),
  },
});

const createEmptyDraft = () =>
  createDraftFromCard({ id: '', primary: '', headline: '', description: '' });

const buildDrafts = (cards) => cards.map((card) => createDraftFromCard(card));

const ReviewCopyPanel = ({
  productName,
  copyCards,
  onSave,
  onDelete,
  disabled = false,
  readOnly = false,
  className = '',
}) => {
  const [drafts, setDrafts] = useState(() => buildDrafts(copyCards));
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    if (readOnly) return;
    setDrafts(buildDrafts(copyCards));
  }, [copyCards, readOnly]);

  const hasDrafts = readOnly ? copyCards.length > 0 : drafts.length > 0;

  const handleFieldChange = (localId, field, value) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.localId === localId
          ? {
              ...draft,
              [field]: value,
            }
          : draft,
      ),
    );
  };

  const getDraftById = (localId) => drafts.find((draft) => draft.localId === localId);

  const hasChanges = (draft) => {
    if (!draft) return false;
    return (
      draft.primary !== draft.original.primary ||
      draft.headline !== draft.original.headline ||
      draft.description !== draft.original.description
    );
  };

  const handleSave = async (localId) => {
    if (readOnly || !onSave) return;
    const draft = getDraftById(localId);
    if (!draft || !hasChanges(draft)) return;
    setSavingId(localId);
    try {
      const saved = await onSave({
        id: draft.id,
        primary: draft.primary,
        headline: draft.headline,
        description: draft.description,
        product: productName,
      });
      if (saved) {
        setDrafts((prev) =>
          prev.map((item) => {
            if (item.localId !== localId) return item;
            const resolvedId = saved.id || draft.id;
            return {
              ...item,
              id: resolvedId || '',
              primary: saved.primary ?? draft.primary,
              headline: saved.headline ?? draft.headline,
              description: saved.description ?? draft.description,
              original: {
                primary: saved.primary ?? draft.primary,
                headline: saved.headline ?? draft.headline,
                description: saved.description ?? draft.description,
              },
            };
          }),
        );
      }
    } catch (err) {
      console.error('Failed to save platform copy', err);
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (readOnly || !onDelete || !id) return;
    try {
      await onDelete(id);
    } catch (err) {
      console.error('Failed to delete platform copy', err);
    }
  };

  const removeDraft = (localId) => {
    setDrafts((prev) => prev.filter((draft) => draft.localId !== localId));
  };

  const handleAddDraft = () => {
    if (readOnly) return;
    setDrafts((prev) => [...prev, createEmptyDraft()]);
  };

  if (!hasDrafts) {
    return (
      <div
        className={`rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-200 ${className}`}
      >
        <p className="font-medium">Platform copy</p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-300">
          No platform copy is saved for this product yet.
        </p>
        {!readOnly && (
          <button
            type="button"
            onClick={handleAddDraft}
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-indigo-500 px-3 py-1.5 text-sm font-medium text-indigo-600 transition hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-indigo-400 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
          >
            <FiEdit3 className="h-4 w-4" aria-hidden="true" />
            Add copy card
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] ${className}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900 dark:text-[var(--dark-text)]">Platform copy</p>
        {!readOnly && (
          <FiEdit3 className="h-4 w-4 text-gray-400" aria-hidden="true" />
        )}
      </div>
      <div className="space-y-4">
        {(readOnly ? copyCards : drafts).map((card, index) => {
          const localId = readOnly ? card.id || `readonly-${index}` : card.localId;
          const primaryValue = readOnly ? normalizeText(card.primary) : card.primary;
          const headlineValue = readOnly ? normalizeText(card.headline) : card.headline;
          const descriptionValue = readOnly ? normalizeText(card.description) : card.description;
          const disabledState = disabled || savingId === localId;
          return (
            <div
              key={localId}
              className="rounded-xl border border-gray-200 p-3 dark:border-[var(--border-color-default)]"
            >
              <div className="mb-2 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-300">
                  Primary Text
                  {readOnly ? (
                    <p className="mt-1 text-sm font-normal normal-case text-gray-800 dark:text-gray-100">
                      {primaryValue || '—'}
                    </p>
                  ) : (
                    <textarea
                      value={primaryValue}
                      onChange={(event) => handleFieldChange(localId, 'primary', event.target.value)}
                      rows={3}
                      disabled={disabledState}
                      className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-100"
                    />
                  )}
                </label>
                <label className="flex flex-col text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-300">
                  Headline
                  {readOnly ? (
                    <p className="mt-1 text-sm font-normal normal-case text-gray-800 dark:text-gray-100">
                      {headlineValue || '—'}
                    </p>
                  ) : (
                    <textarea
                      value={headlineValue}
                      onChange={(event) => handleFieldChange(localId, 'headline', event.target.value)}
                      rows={3}
                      disabled={disabledState}
                      className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-100"
                    />
                  )}
                </label>
              </div>
              <label className="mb-3 flex flex-col text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-300">
                Description
                {readOnly ? (
                  <p className="mt-1 text-sm font-normal normal-case text-gray-800 dark:text-gray-100">
                    {descriptionValue || '—'}
                  </p>
                ) : (
                  <textarea
                    value={descriptionValue}
                    onChange={(event) => handleFieldChange(localId, 'description', event.target.value)}
                    rows={2}
                    disabled={disabledState}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-100"
                  />
                )}
              </label>
              {!readOnly && (
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => handleSave(localId)}
                    disabled={disabledState || !hasChanges(getDraftById(localId))}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                      disabledState || !hasChanges(getDraftById(localId))
                        ? 'cursor-not-allowed border-gray-200 text-gray-400'
                        : 'border-indigo-500 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-400 dark:text-indigo-300 dark:hover:bg-indigo-500/10'
                    }`}
                  >
                    <FiSave className="h-4 w-4" aria-hidden="true" />
                    Save copy
                  </button>
                  {onDelete && card.id ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(card.id)}
                      disabled={disabledState}
                      className="inline-flex items-center gap-2 rounded-full border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
                    >
                      <FiTrash2 className="h-4 w-4" aria-hidden="true" />
                      Delete
                    </button>
                  ) : (
                    !readOnly && (
                      <button
                        type="button"
                        onClick={() => removeDraft(localId)}
                        disabled={disabledState}
                        className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:border-[var(--border-color-default)] dark:text-gray-200 dark:hover:bg-[var(--dark-sidebar-hover)]"
                      >
                        <FiTrash2 className="h-4 w-4" aria-hidden="true" />
                        Discard
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

ReviewCopyPanel.propTypes = {
  productName: PropTypes.string,
  copyCards: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      primary: PropTypes.string,
      headline: PropTypes.string,
      description: PropTypes.string,
      product: PropTypes.string,
    }),
  ),
  onSave: PropTypes.func,
  onDelete: PropTypes.func,
  disabled: PropTypes.bool,
  readOnly: PropTypes.bool,
  className: PropTypes.string,
};

ReviewCopyPanel.defaultProps = {
  productName: '',
  copyCards: [],
  onSave: null,
  onDelete: null,
  disabled: false,
  readOnly: false,
  className: '',
};

export default ReviewCopyPanel;
