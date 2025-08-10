import React, { useState } from 'react';
import Button from './Button.jsx';

const TagInput = ({
  value = [],
  onChange,
  suggestions = [],
  id = 'tag-input',
  onlySuggestions = false,
  addOnBlur = false,
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
    <div className="flex flex-wrap items-center gap-1">
        {value.map((tag) => (
          <span key={tag} className="tag bg-accent-10 text-accent flex items-center">
            {tag}
          <Button
            type="button"
            variant="delete"
            onClick={() => removeTag(tag)}
            className="ml-1 text-xs"
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
