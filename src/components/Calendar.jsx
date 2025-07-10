import React from 'react';

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const Calendar = ({ requests }) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const startDay = start.getDay();
  const daysInMonth = end.getDate();

  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const ticketsByDate = {};
  requests.forEach((r) => {
    if (!r.dueDate) return;
    const d = r.dueDate.toDate ? r.dueDate.toDate() : new Date(r.dueDate);
    const key = d.toISOString().slice(0, 10);
    if (!ticketsByDate[key]) ticketsByDate[key] = [];
    ticketsByDate[key].push(r);
  });

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm font-semibold mb-2">
        {dayNames.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="h-20 border" />;
          const key = date.toISOString().slice(0, 10);
          const tickets = ticketsByDate[key] || [];
          return (
            <div key={i} className="h-20 border p-1 text-sm relative">
              <div className="text-xs">{date.getDate()}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {tickets.map((t) => (
                  <div key={t.id} className="relative group">
                    <div className="w-2 h-2 bg-accent rounded-full" />
                    <div className="absolute z-10 hidden group-hover:block bg-white dark:bg-[var(--dark-sidebar-bg)] border border-gray-300 dark:border-gray-600 text-xs p-1 rounded whitespace-nowrap">
                      {t.title || t.brandCode || 'Ticket'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Calendar;
