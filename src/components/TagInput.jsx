import React, { useState } from 'react';

const TagInput = ({ value = [], onChange, suggestions = [], id = 'tag-input' }) => {
  const [input, setInput] = useState('');

  const addTag = (tag) => {
    const t = tag.trim();
    if (!t) return;
    if (!value.includes(t)) {
      onChange([...value, t]);
    }
    setInput('');
  };

  const removeTag = (tag) => {
    onChange(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(input);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.map((tag) => (
        <span
          key={tag}
          className="tag bg-gray-200 text-gray-700 dark:bg-[var(--dark-sidebar-hover)] dark:text-[var(--dark-text)] flex items-center"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="ml-1 text-xs text-red-500"
          >
            &times;
          </button>
        </span>
      ))}
      <input
        id={id}
        list={`${id}-list`}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        className="flex-1 p-1 border rounded"
      />
      {suggestions.length > 0 && (
        <datalist id={`${id}-list`}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
};

export default TagInput;
