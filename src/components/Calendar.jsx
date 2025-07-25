import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { FiFilePlus, FiPackage, FiAlertOctagon, FiZap, FiCheck } from 'react-icons/fi';
import getUserName from '../utils/getUserName';

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const typeIcons = {
  newAds: FiFilePlus,
  newBrand: FiPackage,
  bug: FiAlertOctagon,
  feature: FiZap,
};

const Calendar = forwardRef(
  (
    {
      requests,
      showWeekends = false,
      onDragStart,
      onDateChange,
      onCardClick,
    },
    ref,
  ) => {
    const now = new Date();
    const [names, setNames] = useState({});
    const todayRef = useRef(null);
    const containerRef = useRef(null);

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
    if (todayRef.current && containerRef.current) {
      todayRef.current.scrollIntoView({ block: 'center' });
    }
  }, []);

  useImperativeHandle(ref, () => ({
    goToToday: () => {
      if (todayRef.current) {
        todayRef.current.scrollIntoView({ block: 'center' });
      }
    },
  }));

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

  const months = [];
  for (let i = -3; i <= 3; i++) {
    months.push(new Date(now.getFullYear(), now.getMonth() + i, 1));
  }

  const allowDrop = (e) => e.preventDefault();

  const renderMonth = (base, idx) => {
    const year = base.getFullYear();
    const month = base.getMonth();

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

    return (
      <div key={idx} className="mb-6">
        <h2 className="text-lg font-bold mb-2">
          {base.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </h2>
        <div
          className="grid gap-1 text-center text-sm font-semibold mb-2"
          style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
        >
          {visibleDayNames.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div
          className="grid gap-1 auto-rows-min"
          style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
        >
          {cells.map((date, i) => {
            if (!date) return <div key={i} className="min-h-20 border" />;
            const key = date.toISOString().slice(0, 10);
            const tickets = ticketsByDate[key] || [];
            const isToday = date.toDateString() === now.toDateString();
            return (
              <div
                ref={isToday ? todayRef : null}
                key={i}
                className={`border p-1 text-xs overflow-hidden ${isToday ? 'bg-[var(--accent-color-10)]' : ''}`}
                onDragOver={allowDrop}
                onDrop={() => onDateChange && onDateChange(date)}
              >
                <div className="mb-1 font-bold">{date.getDate()}</div>
                <div className="space-y-1">
                  {tickets.map((t) => {
                    const Icon = typeIcons[t.type];
                    return (
                      <div
                        key={t.id}
                        className="relative border rounded p-1 flex items-start gap-1 text-[10px] bg-white dark:bg-[var(--dark-sidebar-bg)] cursor-pointer"
                        draggable
                        onDragStart={() => onDragStart && onDragStart(t.id)}
                        onClick={() => onCardClick && onCardClick(t)}
                      >
                        {t.adGroupId && (
                          <FiCheck className="absolute top-0.5 right-0.5 text-[var(--accent-color)]" />
                        )}
                        {Icon && <Icon className="flex-shrink-0" />}
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{t.title || 'Ticket'}</div>
                          {t.brandCode && <div className="truncate">{t.brandCode}</div>}
                          {t.editorId && <div className="truncate">{names[t.editorId] || t.editorId}</div>}
                          {t.designerId && <div className="truncate">{names[t.designerId] || t.designerId}</div>}
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

  return (
    <div ref={containerRef} className="overflow-y-auto">
      {months.map((m, idx) => renderMonth(m, idx))}
    </div>
  );
});

export default Calendar;
