import React, { useEffect, useMemo, useState } from 'react';
import { FiCheck } from 'react-icons/fi';

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
  allowDueDateChange = false,
  restrictToDueDate = false,
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

  useEffect(() => {
    if (restrictToDueDate) {
      setMenu(null);
    }
  }, [restrictToDueDate]);

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
    if (restrictToDueDate && data.type !== 'due') return;
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
        if (data.type === 'due' && allowDueDateChange) {
          const res = { ...g, dueDate: nd };
          onDateChange(group.id, { dueDate: nd });
          return res;
        }
        return g;
      })
    );
  };

  const availableDesigners = restrictToDueDate ? [] : designers;
  const availableEditors = restrictToDueDate ? [] : editors;

  const handleAssign = (role, personId) => {
    if (restrictToDueDate) return;
    const { groupId, date } = menu;
    const list = role === 'designer' ? availableDesigners : availableEditors;
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
  const filtered = sorted.filter((g) => {
    const due = g.dueDate
      ? typeof g.dueDate.toDate === 'function'
        ? g.dueDate.toDate()
        : new Date(g.dueDate)
      : null;
    return !due || due >= start;
  });

  return (
    <div className="mt-4">
      <div className="sticky top-0 z-20 bg-white dark:bg-[var(--dark-bg)] pb-2">
        <div className="flex items-center space-x-2">
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
      </div>
      <div className="overflow-auto max-h-[70vh]">
        <table className="min-w-max border-collapse text-xs">
          <thead>
            <tr className="sticky top-0 z-10 bg-white dark:bg-[var(--dark-bg)]">
              <th className="sticky top-0 left-0 z-10 bg-white dark:bg-[var(--dark-bg)] text-left p-2 border border-gray-300 dark:border-gray-600 max-w-[16rem] w-[16rem] outline outline-1 outline-gray-300">
                Ad Group
              </th>
              {days.map((d) => (
                <th
                  key={d.toISOString()}
                  className="sticky top-0 p-2 border border-gray-300 dark:border-gray-600 text-center whitespace-nowrap bg-white dark:bg-[var(--dark-bg)]"
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
            {filtered.map((g) => {
              const designDate =
                restrictToDueDate || !g.designDueDate
                  ? null
                  : typeof g.designDueDate.toDate === 'function'
                  ? g.designDueDate.toDate()
                  : new Date(g.designDueDate);
              const editorDate =
                restrictToDueDate || !g.editorDueDate
                  ? null
                  : typeof g.editorDueDate.toDate === 'function'
                  ? g.editorDueDate.toDate()
                  : new Date(g.editorDueDate);
              const dueDate = g.dueDate
                ? typeof g.dueDate.toDate === 'function'
                  ? g.dueDate.toDate()
                  : new Date(g.dueDate)
                : null;
            return (
              <tr key={g.id}>
                <td className="sticky left-0 z-10 bg-white dark:bg-[var(--dark-bg)] p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap max-w-[16rem] w-[16rem] overflow-hidden text-ellipsis outline outline-1 outline-gray-300">
                  <div className="font-semibold text-xs truncate">{g.name}</div>
                  <div className="text-[10px] text-gray-600 dark:text-gray-400 truncate">
                    {g.brandCode} ({g.recipeCount ?? 0})
                  </div>
                </td>
                {days.map((d) => {
                  let content = null;
                  let bg = '';
                  let draggable = false;
                  let dragType = null;
                  const isDesignDay = !restrictToDueDate && designDate && isSameDay(d, designDate);
                  const isEditorDay = !restrictToDueDate && editorDate && isSameDay(d, editorDate);
                  const unassignedDesigner = isDesignDay && !g.designerId;
                  const unassignedEditor = isEditorDay && !g.editorId;
                  if (isDesignDay) {
                    content = (
                      <span className="flex items-center">
                        {g.designerName}
                        {['designed', 'reviewed', 'done'].includes(g.status) && (
                          <FiCheck className="ml-1" />
                        )}
                      </span>
                    );
                    bg = 'bg-blue-100 dark:bg-blue-900';
                    draggable = true;
                    dragType = 'design';
                  } else if (isEditorDay) {
                    content = (
                      <span className="flex items-center">
                        {g.editorName}
                        {['briefed', 'designed', 'reviewed', 'done'].includes(g.status) && (
                          <FiCheck className="ml-1" />
                        )}
                      </span>
                    );
                    bg = 'bg-green-100 dark:bg-green-900';
                    draggable = true;
                    dragType = 'editor';
                  } else if (dueDate && isSameDay(d, dueDate)) {
                    content = 'Due';
                    bg = 'bg-red-100 dark:bg-red-900';
                    if (allowDueDateChange) {
                      draggable = true;
                      dragType = 'due';
                    }
                  }
                  const showMenu =
                    !restrictToDueDate && menu && menu.groupId === g.id && isSameDay(menu.date, d);
                  return (
                    <td
                      key={d.toISOString()}
                      className={`p-2 border min-w-[5rem] relative border-gray-300 dark:border-gray-600 ${bg}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDrop(e, g, d)}
                      onClick={() => {
                        if (restrictToDueDate || content) return;
                        if (unassignedDesigner)
                          setMenu({ groupId: g.id, date: d, step: 'designer' });
                        else if (unassignedEditor)
                          setMenu({ groupId: g.id, date: d, step: 'editor' });
                        else setMenu({ groupId: g.id, date: d, step: 'type' });
                      }}
                    >
                      {content && (
                        <div
                          draggable={draggable}
                          onDragStart={(e) =>
                            draggable &&
                            e.dataTransfer.setData(
                              'text/plain',
                              JSON.stringify({ id: g.id, type: dragType })
                            )
                          }
                          className={draggable ? 'cursor-move' : ''}
                        >
                          {content}
                        </div>
                      )}
                      {showMenu && menu.step === 'type' && (
                        <div
                          className="absolute z-20 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow p-2 space-y-1"
                          onClick={(e) => e.stopPropagation()}
                        >
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
                        <div
                          className="absolute z-20 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow p-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            className="bg-transparent"
                            onChange={(e) => {
                              e.stopPropagation();
                              if (e.target.value) handleAssign(menu.step, e.target.value);
                            }}
                          >
                            <option value="">Select {menu.step}</option>
                            {(menu.step === 'designer' ? availableDesigners : availableEditors).map((p) => (
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
    </div>
  );
};

export default AdGroupGantt;

