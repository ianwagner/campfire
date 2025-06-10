import React, { useRef, useState } from 'react';

const PromptTextarea = ({ value, onChange, placeholders = [], className = '' }) => {
  const ref = useRef(null);
  const [showList, setShowList] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const [match, setMatch] = useState('');

  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);
    const cursor = e.target.selectionStart;
    const sub = val.slice(0, cursor);
    const m = sub.match(/{{([^{}]*)$/);
    if (m) {
      const q = m[1];
      const opts = placeholders.filter((p) => p.startsWith(q));
      setMatch(q);
      setFiltered(opts);
      setShowList(opts.length > 0);
    } else {
      setShowList(false);
    }
  };

  const insert = (p) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart - match.length - 2; // remove opening {{
    const before = value.slice(0, start);
    const after = value.slice(el.selectionEnd);
    const placeholder = `{{${p}}}`;
    const text = `${before}${placeholder}${after}`;
    onChange(text);
    setShowList(false);
    setTimeout(() => {
      el.focus();
      const pos = before.length + placeholder.length; // place cursor after placeholder
      el.selectionStart = el.selectionEnd = pos;
    }, 0);
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        className={`w-full p-2 border rounded ${className}`}
        value={value}
        onChange={handleChange}
      />
      {showList && (
        <ul className="absolute z-10 bg-white border rounded shadow text-sm mt-1 max-h-40 overflow-auto dark:bg-[var(--dark-sidebar-bg)] dark:border-[var(--dark-sidebar-hover)] dark:text-[var(--dark-text)]">
          {filtered.map((p) => (
            <li key={p}>
              <button
                type="button"
                className="block w-full text-left px-2 py-1 hover:bg-accent-10"
                onClick={() => insert(p)}
              >
                {'{{' + p + '}}'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PromptTextarea;
