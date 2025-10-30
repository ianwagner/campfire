import React, { useState } from 'react';
import Button from './Button.jsx';

const TagInput = ({
  value = [],
  onChange,
  suggestions = [],
  id = 'tag-input',
  onlySuggestions = false,
  addOnBlur = false,
  placeholder = '',
  className = '',
  inputClassName = '',
}) => {
  const [input, setInput] = useState('');

  const addTag = (tag) => {
    const t = tag.trim();
    if (!t) return;
    if (onlySuggestions && !suggestions.includes(t)) return;
    if (!value.includes(t)) {
      onChange([...value, t]);
    }
    setInput('');
  };

  const removeTag = (tag) => {
      onChange(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Comma') {
      e.preventDefault();
      addTag(input);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`.trim()}>
      {value.map((tag) => (
        <span key={tag} className="tag bg-accent-10 text-accent">
          <span>{tag}</span>
          <Button
            type="button"
            variant="delete"
            onClick={() => removeTag(tag)}
            className="text-xs"
          >
            &times;
          </Button>
        </span>
      ))}
      <input
        id={id}
        list={`${id}-list`}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => addOnBlur && addTag(input)}
        placeholder={placeholder}
        className={`flex-1 rounded border border-gray-300 bg-white p-1 text-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-gray-200 ${inputClassName}`.trim()}
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
