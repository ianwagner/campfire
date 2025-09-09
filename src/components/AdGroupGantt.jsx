import React, { useEffect, useMemo, useState } from 'react';

/**
 * Displays ad groups on a simple Gantt style timeline.
 *
 * Features:
 *  - Scroll backward/forward in weekly increments
 *  - Drag designer/editor due dates to new days
 *  - Click empty day to add a designer or editor due date
 *  - Dark mode friendly
 */
const AdGroupGantt = ({
  groups = [],
  designers = [],
  editors = [],
  onDateChange = () => {},
  onAssign = () => {},
}) => {
  const startOfWeek = (d) => {
    const s = new Date(d);
    const day = s.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday as start
    s.setDate(s.getDate() + diff);
    s.setHours(0, 0, 0, 0);
    return s;
  };

  const [start, setStart] = useState(() => startOfWeek(new Date()));
  const [localGroups, setLocalGroups] = useState([]);
  const [menu, setMenu] = useState(null); // {groupId, date, step}

  // remove completed groups
  useEffect(() => {
    setLocalGroups(groups.filter((g) => g.status !== 'done'));
  }, [groups]);

  // build list of business days starting from start date
  const days = useMemo(() => {
    const res = [];
    for (let i = 0; i < 28; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      if (d.getDay() === 0 || d.getDay() === 6) continue; // skip weekends
      res.push(d);
    }
    return res;
  }, [start]);

  const shift = (days) => {
    setStart((prev) => {
      const n = new Date(prev);
      n.setDate(n.getDate() + days);
      return n;
    });
  };

  const sorted = [...localGroups].sort((a, b) => {
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

  const handleDrop = (e, group, date) => {
    const txt = e.dataTransfer.getData('text/plain');
    if (!txt) return;
    const data = JSON.parse(txt);
    if (data.id !== group.id) return;
    setLocalGroups((prev) =>
      prev.map((g) => {
        if (g.id !== group.id) return g;
        const nd = new Date(date);
        if (data.type === 'design') {
          const res = { ...g, designDueDate: nd };
          onDateChange(group.id, { designDueDate: nd });
          return res;
        }
        if (data.type === 'editor') {
          const res = { ...g, editorDueDate: nd };
          onDateChange(group.id, { editorDueDate: nd });
          return res;
        }
        return g;
      })
    );
  };

  const handleAssign = (role, personId) => {
    const { groupId, date } = menu;
    const list = role === 'designer' ? designers : editors;
    const person = list.find((p) => p.id === personId);
    setLocalGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              ...(role === 'designer'
                ? {
                    designerId: personId,
                    designerName: person?.name || personId,
                    designDueDate: date,
                  }
                : {
                    editorId: personId,
                    editorName: person?.name || personId,
                    editorDueDate: date,
                  }),
            }
          : g
      )
    );
    onAssign(groupId, role, personId, date);
    setMenu(null);
  };

  const isSameDay = (d1, d2) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  return (
    <div className="overflow-x-auto mt-4">
      <div className="flex items-center space-x-2 mb-2">
        <button
          className="px-2 py-1 border rounded bg-white dark:bg-[var(--dark-bg)] dark:text-gray-200"
          onClick={() => shift(-7)}
          aria-label="Previous week"
        >
          ◀
        </button>
        <button
          className="px-2 py-1 border rounded bg-white dark:bg-[var(--dark-bg)] dark:text-gray-200"
          onClick={() => shift(7)}
          aria-label="Next week"
        >
          ▶
        </button>
      </div>
      <table className="min-w-max border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white dark:bg-[var(--dark-bg)] text-left p-2 border border-gray-300 dark:border-gray-600">
              Ad Group
            </th>
            {days.map((d) => (
              <th
                key={d.toISOString()}
                className="p-2 border border-gray-300 dark:border-gray-600 text-center whitespace-nowrap"
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
                <td className="sticky left-0 z-10 bg-white dark:bg-[var(--dark-bg)] p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap">
                  <div className="font-semibold">{g.name}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">{g.brandCode}</div>
                </td>
                {days.map((d) => {
                  let content = null;
                  let bg = '';
                  let draggable = false;
                  let dragType = null;
                  if (designDate && isSameDay(d, designDate)) {
                    content = g.designerName;
                    bg = 'bg-blue-100 dark:bg-blue-900';
                    draggable = true;
                    dragType = 'design';
                  } else if (editorDate && isSameDay(d, editorDate)) {
                    content = g.editorName;
                    bg = 'bg-green-100 dark:bg-green-900';
                    draggable = true;
                    dragType = 'editor';
                  } else if (dueDate && isSameDay(d, dueDate)) {
                    content = 'Due';
                    bg = 'bg-red-100 dark:bg-red-900';
                  }
                  const showMenu =
                    menu && menu.groupId === g.id && isSameDay(menu.date, d);
                  return (
                    <td
                      key={d.toISOString()}
                      className={`p-2 border min-w-[5rem] relative border-gray-300 dark:border-gray-600 ${bg}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDrop(e, g, d)}
                      onClick={() =>
                        !content && setMenu({ groupId: g.id, date: d, step: 'type' })
                      }
                    >
                      {content && (
                        <div
                          draggable={draggable}
                          onDragStart={(e) =>
                            e.dataTransfer.setData(
                              'text/plain',
                              JSON.stringify({ id: g.id, type: dragType })
                            )
                          }
                          className="cursor-move"
                        >
                          {content}
                        </div>
                      )}
                      {showMenu && menu.step === 'type' && (
                        <div className="absolute z-20 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow p-2 space-y-1">
                          <button
                            className="block w-full text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenu({ ...menu, step: 'designer' });
                            }}
                          >
                            Add designer
                          </button>
                          <button
                            className="block w-full text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenu({ ...menu, step: 'editor' });
                            }}
                          >
                            Add editor
                          </button>
                        </div>
                      )}
                      {showMenu && menu.step && menu.step !== 'type' && (
                        <div className="absolute z-20 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow p-2">
                          <select
                            className="bg-transparent"
                            onChange={(e) => {
                              e.stopPropagation();
                              if (e.target.value) handleAssign(menu.step, e.target.value);
                            }}
                          >
                            <option value="">Select {menu.step}</option>
                            {(menu.step === 'designer' ? designers : editors).map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
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

