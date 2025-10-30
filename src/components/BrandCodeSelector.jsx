import React, { useMemo } from 'react';
import TagInput from './TagInput.jsx';
import Button from './Button.jsx';

const BrandCodeSelector = ({
  id = 'brand-code-selector',
  value = [],
  onChange,
  suggestions = [],
  onAddAll,
}) => {
  const normalizedSuggestions = useMemo(() => {
    const unique = new Set();
    suggestions.forEach((code) => {
      if (code) {
        unique.add(String(code).trim());
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [suggestions]);

  const handleAdd = (code) => {
    const trimmed = String(code || '').trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) return;
    onChange([...value, trimmed]);
  };

  const availableSuggestions = useMemo(
    () => normalizedSuggestions.filter((code) => !value.includes(code)),
    [normalizedSuggestions, value]
  );

  const hasSuggestions = availableSuggestions.length > 0;

  return (
    <div className="space-y-3">
      <TagInput
        id={id}
        value={value}
        onChange={onChange}
        suggestions={normalizedSuggestions}
        placeholder="Type a brand code and press enter"
        containerClassName="flex w-full flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus-within:border-[var(--accent-color)] focus-within:ring-2 focus-within:ring-[var(--accent-color)] focus-within:ring-offset-0 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)]"
        inputClassName="min-w-[8rem] flex-1 border-none bg-transparent px-1 py-1 text-sm text-gray-700 outline-none focus:ring-0 dark:text-gray-200"
        addOnBlur
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="neutral"
          size="sm"
          onClick={onAddAll}
          disabled={normalizedSuggestions.length === 0}
        >
          Add all brand codes
        </Button>
      </div>
      {hasSuggestions && (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3 text-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Suggested codes
          </p>
          <div className="flex flex-wrap gap-2">
            {availableSuggestions.slice(0, 20).map((code) => (
              <button
                type="button"
                key={code}
                onClick={() => handleAdd(code)}
                className="rounded-full border border-[var(--accent-color)] bg-white px-3 py-1 text-xs font-medium text-[var(--accent-color)] transition hover:bg-[var(--accent-color-10)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-opacity-30 dark:bg-transparent"
              >
                {code}
              </button>
            ))}
            {availableSuggestions.length > 20 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                +{availableSuggestions.length - 20} more available
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BrandCodeSelector;
