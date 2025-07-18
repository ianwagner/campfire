import React, { useState, useRef, useEffect } from 'react';
import { FiSliders } from 'react-icons/fi';
import TabButton from './TabButton.jsx';

const SortButton = ({ value, onChange, options }) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (
        btnRef.current?.contains(e.target) ||
        menuRef.current?.contains(e.target)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
  };

  return (
    <div className="relative">
      <TabButton
        ref={btnRef}
        type="button"
        active={open}
        onClick={() => setOpen((o) => !o)}
        aria-label="Sort"
      >
        <FiSliders />
      </TabButton>
      {open && (
        <div
          ref={menuRef}
          className="absolute left-0 mt-1 bg-white dark:bg-[var(--dark-sidebar-bg)] border rounded shadow z-10 text-sm"
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              className={`block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] ${
                value === opt.value ? 'font-bold' : ''
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SortButton;
