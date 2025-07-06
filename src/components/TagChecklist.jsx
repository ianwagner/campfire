import React, { useState } from 'react';
import Button from './Button.jsx';

const TagChecklist = ({ options = [], value = [], onChange, id = 'tag-checklist' }) => {
  const [input, setInput] = useState('');
  const nameMap = Object.fromEntries(options.map((o) => [o.name, o.id]));
  const selected = value || [];
  const remaining = options.filter((o) => !selected.includes(o.id));

  const addTag = (name) => {
    const idVal = nameMap[name];
    if (!idVal) return;
    if (!selected.includes(idVal)) {
      onChange([...selected, idVal]);
    }
    setInput('');
  };

  const removeTag = (idVal) => {
    onChange(selected.filter((v) => v !== idVal));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(input.trim());
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
        {selected.map((idVal) => {
          const opt = options.find((o) => o.id === idVal);
          const label = opt ? opt.name : idVal;
          return (
            <span key={idVal} className="tag bg-accent-10 text-accent flex items-center">
              {label}
              <Button
                type="button"
                variant="delete"
              onClick={() => removeTag(idVal)}
              className="ml-1 text-xs"
            >
              &times;
            </Button>
          </span>
        );
      })}
      <input
        id={id}
        list={`${id}-list`}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        className="flex-1 p-1 border rounded"
      />
      {remaining.length > 0 && (
        <datalist id={`${id}-list`}>
          {remaining.map((o) => (
            <option key={o.id} value={o.name} />
          ))}
        </datalist>
      )}
    </div>
  );
};

export default TagChecklist;
