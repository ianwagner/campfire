import React, { useEffect, useRef, useState } from 'react';
import {
  FiFilePlus,
  FiPackage,
  FiAlertOctagon,
  FiZap,
  FiMoreHorizontal,
} from 'react-icons/fi';
import IconButton from './IconButton.jsx';
import getUserName from '../utils/getUserName';

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const typeIcons = {
  newAds: FiFilePlus,
  newBrand: FiPackage,
  bug: FiAlertOctagon,
  feature: FiZap,
};

const Calendar = ({ requests }) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const [showWeekends, setShowWeekends] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef(null);
  const menuRef = useRef(null);
  const [names, setNames] = useState({});

  useEffect(() => {
    const ids = new Set();
    requests.forEach((r) => {
      if (r.editorId) ids.add(r.editorId);
      if (r.designerId) ids.add(r.designerId);
    });
    ids.forEach((id) => {
      if (!names[id]) {
        getUserName(id).then((n) =>
          setNames((p) => ({ ...p, [id]: n }))
        );
      }
    });
  }, [requests]);

  useEffect(() => {
    const handleClick = (e) => {
      if (
        menuBtnRef.current?.contains(e.target) ||
        menuRef.current?.contains(e.target)
      ) {
        return;
      }
      setMenuOpen(false);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const startDay = start.getDay();
  const daysInMonth = end.getDate();

  const cells = [];
  if (showWeekends) {
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(year, month, d));
    }
    while (cells.length % 7 !== 0) cells.push(null);
  } else {
    const firstOffset = startDay === 0 ? 0 : startDay - 1;
    for (let i = 0; i < firstOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      cells.push(date);
    }
    while (cells.length % 5 !== 0) cells.push(null);
  }

  const ticketsByDate = {};
  requests.forEach((r) => {
    if (!r.dueDate) return;
    const d = r.dueDate.toDate ? r.dueDate.toDate() : new Date(r.dueDate);
    const key = d.toISOString().slice(0, 10);
    if (!ticketsByDate[key]) ticketsByDate[key] = [];
    ticketsByDate[key].push(r);
  });

  const visibleDayNames = showWeekends
    ? dayNames
    : dayNames.slice(1, 6);

  const gridCols = showWeekends ? 7 : 5;

  return (
    <div>
      <div className="flex justify-end mb-1">
        <IconButton
          ref={menuBtnRef}
          onClick={() => setMenuOpen((o) => !o)}
          className="bg-transparent hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)]"
          aria-label="Menu"
        >
          <FiMoreHorizontal />
        </IconButton>
        {menuOpen && (
          <div
            ref={menuRef}
            className="absolute right-0 mt-6 z-10 bg-white dark:bg-[var(--dark-sidebar-bg)] border border-gray-300 dark:border-gray-600 rounded shadow text-sm"
          >
            <button
              onClick={() => {
                setShowWeekends((p) => !p);
                setMenuOpen(false);
              }}
              className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)]"
            >
              {showWeekends ? 'Hide weekends' : 'See weekends'}
            </button>
          </div>
        )}
      </div>
      <div
        className="grid gap-1 text-center text-sm font-semibold mb-2"
        style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
      >
        {visibleDayNames.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
      >
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="h-20 border" />;
          const key = date.toISOString().slice(0, 10);
          const tickets = ticketsByDate[key] || [];
          return (
            <div key={i} className="h-20 border p-1 text-xs overflow-hidden">
              <div className="mb-1 font-bold">{date.getDate()}</div>
              <div className="space-y-1">
                {tickets.map((t) => {
                  const Icon = typeIcons[t.type];
                  return (
                    <div
                      key={t.id}
                      className="border rounded p-1 flex items-start gap-1 text-[10px] bg-white dark:bg-[var(--dark-sidebar-bg)]"
                    >
                      {Icon && (
                        <Icon className="flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold truncate">
                          {t.title || t.brandCode || 'Ticket'}
                        </div>
                        {t.editorId && (
                          <div className="truncate">
                            {names[t.editorId] || t.editorId}
                          </div>
                        )}
                        {t.designerId && (
                          <div className="truncate">
                            {names[t.designerId] || t.designerId}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Calendar;
