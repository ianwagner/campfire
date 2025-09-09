import React from 'react';

const AdGroupGantt = ({ groups = [] }) => {
  const start = new Date();
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday as start
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);

  const days = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // skip weekends
    days.push(d);
  }

  const sorted = [...groups].sort((a, b) => {
    const ad = a.dueDate
      ? typeof a.dueDate.toDate === 'function'
        ? a.dueDate.toDate()
        : new Date(a.dueDate)
      : null;
    const bd = b.dueDate
      ? typeof b.dueDate.toDate === 'function'
        ? b.dueDate.toDate()
        : new Date(b.dueDate)
      : null;
    const adTime = ad ? ad.getTime() : Infinity;
    const bdTime = bd ? bd.getTime() : Infinity;
    return adTime - bdTime;
  });

  const isSameDay = (d1, d2) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  return (
    <div className="overflow-x-auto mt-4">
      <table className="min-w-max border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white dark:bg-[var(--dark-bg)] text-left p-2 border">Ad Group</th>
            {days.map((d) => (
              <th
                key={d.toISOString()}
                className="p-2 border text-center whitespace-nowrap"
              >
                {d.toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'numeric',
                  day: 'numeric',
                })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((g) => {
            const designDate = g.designDueDate
              ? typeof g.designDueDate.toDate === 'function'
                ? g.designDueDate.toDate()
                : new Date(g.designDueDate)
              : null;
            const editorDate = g.editorDueDate
              ? typeof g.editorDueDate.toDate === 'function'
                ? g.editorDueDate.toDate()
                : new Date(g.editorDueDate)
              : null;
            const dueDate = g.dueDate
              ? typeof g.dueDate.toDate === 'function'
                ? g.dueDate.toDate()
                : new Date(g.dueDate)
              : null;
            return (
              <tr key={g.id}>
                <td className="sticky left-0 z-10 bg-white dark:bg-[var(--dark-bg)] p-2 border whitespace-nowrap">
                  <div className="font-semibold">{g.name}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {g.brandCode}
                  </div>
                </td>
                {days.map((d) => {
                  let content = null;
                  let bg = '';
                  if (designDate && isSameDay(d, designDate)) {
                    content = g.designerName;
                    bg = 'bg-blue-100';
                  } else if (editorDate && isSameDay(d, editorDate)) {
                    content = g.editorName;
                    bg = 'bg-green-100';
                  } else if (dueDate && isSameDay(d, dueDate)) {
                    content = 'Due';
                    bg = 'bg-red-100';
                  }
                  return (
                    <td
                      key={d.toISOString()}
                      className={`p-2 border min-w-[5rem] ${bg}`}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default AdGroupGantt;
