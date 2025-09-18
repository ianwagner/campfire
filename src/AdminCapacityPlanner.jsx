import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Timestamp,
  collection,
  getCountFromServer,
  getDocs,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import PageWrapper from './components/PageWrapper.jsx';
import { db } from './firebase/config';

const DAYS_PER_WEEK = 7;
const WEEKS_TO_RENDER = 8;

const dayKey = (date) => date.toISOString().slice(0, 10);

const addDays = (input, amount) => {
  const date = new Date(input);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + amount);
  date.setHours(0, 0, 0, 0);
  return date;
};

const startOfWeek = (input) => {
  const date = new Date(input);
  date.setHours(12, 0, 0, 0);
  const day = date.getDay();
  const diff = (day + 6) % 7;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfWeek = (input) => {
  const start = startOfWeek(input);
  start.setDate(start.getDate() + 6);
  start.setHours(23, 59, 59, 999);
  return start;
};

const formatWeekTitle = (weekStart) => {
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  return `Week of ${weekStart.toLocaleDateString(undefined, options)}`;
};

const AdminCapacityPlanner = () => {
  const [startWeekMs, setStartWeekMs] = useState(() => startOfWeek(new Date()).getTime());
  const [groupsByDay, setGroupsByDay] = useState({});
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);

  const weeks = useMemo(() => {
    const base = new Date(startWeekMs);
    return Array.from({ length: WEEKS_TO_RENDER }, (_, index) =>
      addDays(base, index * DAYS_PER_WEEK)
    );
  }, [startWeekMs]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  }, [startWeekMs]);

  useEffect(() => {
    let cancelled = false;

    const fetchGroups = async () => {
      setLoading(true);
      try {
        const firstWeekStart = startOfWeek(new Date(startWeekMs));
        const lastWeekStart = addDays(firstWeekStart, (WEEKS_TO_RENDER - 1) * DAYS_PER_WEEK);
        const rangeStart = firstWeekStart;
        const rangeEnd = endOfWeek(lastWeekStart);

        const q = query(
          collection(db, 'adGroups'),
          where('dueDate', '>=', Timestamp.fromDate(rangeStart)),
          where('dueDate', '<=', Timestamp.fromDate(rangeEnd)),
          orderBy('dueDate', 'asc')
        );

        const snap = await getDocs(q);

        const groups = await Promise.all(
          snap.docs.map(async (docSnap) => {
            const data = docSnap.data();
            if (!data?.dueDate) return null;
            if (data.status === 'archived') return null;

            const dueDate = data.dueDate.toDate
              ? data.dueDate.toDate()
              : new Date(data.dueDate);
            if (Number.isNaN(dueDate?.getTime())) return null;

            let adsCount = 0;
            try {
              const countSnap = await getCountFromServer(
                collection(db, 'adGroups', docSnap.id, 'assets')
              );
              adsCount = countSnap.data().count || 0;
            } catch (err) {
              console.error('Failed to count ads for ad group', docSnap.id, err);
            }

            return {
              id: docSnap.id,
              name: data.name || data.projectName || docSnap.id,
              adsCount,
              dueDate,
            };
          })
        );

        if (cancelled) return;

        const mapped = {};
        groups
          .filter(Boolean)
          .forEach((group) => {
            const key = dayKey(group.dueDate);
            if (!mapped[key]) mapped[key] = [];
            mapped[key].push(group);
          });

        Object.values(mapped).forEach((list) =>
          list.sort((a, b) => a.name.localeCompare(b.name))
        );

        setGroupsByDay(mapped);
      } catch (err) {
        console.error('Failed to load capacity planner data', err);
        if (!cancelled) setGroupsByDay({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchGroups();

    return () => {
      cancelled = true;
    };
  }, [startWeekMs]);

  const handleShiftWeek = (delta) => {
    setStartWeekMs((prev) => startOfWeek(addDays(prev, delta * DAYS_PER_WEEK)).getTime());
  };

  const handleReset = () => {
    setStartWeekMs(startOfWeek(new Date()).getTime());
  };

  return (
    <PageWrapper title="Capacity Planner">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary px-3 py-1"
            onClick={() => handleShiftWeek(-1)}
          >
            Previous Week
          </button>
          <button
            type="button"
            className="btn-secondary px-3 py-1"
            onClick={() => handleShiftWeek(1)}
          >
            Next Week
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>
            {weeks.length > 0 && `${formatWeekTitle(weeks[0])} – ${formatWeekTitle(weeks[weeks.length - 1])}`}
          </span>
          <button
            type="button"
            className="btn-secondary px-3 py-1"
            onClick={handleReset}
          >
            Jump to Current Week
          </button>
        </div>
      </div>
      {loading && (
        <div className="mb-4 text-sm text-gray-500">Loading capacity data…</div>
      )}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-4 scroll-smooth snap-x snap-mandatory"
      >
        {weeks.map((weekStart) => {
          const weekDays = Array.from({ length: DAYS_PER_WEEK }, (_, index) =>
            addDays(weekStart, index)
          );
          const weekKey = dayKey(weekStart);
          return (
            <div
              key={weekKey}
              className="flex min-w-[840px] flex-col rounded-lg border border-gray-200 bg-white shadow-sm snap-start"
            >
              <div className="border-b px-4 py-2">
                <h2 className="text-sm font-semibold text-gray-700">
                  {formatWeekTitle(weekStart)}
                </h2>
              </div>
              <div className="grid grid-cols-7 gap-2 border-b bg-gray-50 px-4 py-3">
                {weekDays.map((day) => (
                  <div key={`${weekKey}-${day.getDate()}`} className="text-center">
                    <div className="text-sm font-semibold text-gray-700">
                      {day.toLocaleDateString(undefined, { weekday: 'short' })}
                    </div>
                    <div className="text-xs text-gray-500">
                      {day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-3 px-4 py-4">
                {weekDays.map((day) => {
                  const key = dayKey(day);
                  const dayGroups = groupsByDay[key] || [];
                  const totalAds = dayGroups.reduce((sum, group) => sum + (group.adsCount || 0), 0);
                  return (
                    <div
                      key={`${weekKey}-${key}`}
                      className="flex min-h-[220px] flex-col rounded-lg border border-gray-200 bg-gray-50 p-2"
                    >
                      <div className="flex-1 space-y-2 overflow-auto">
                        {dayGroups.length === 0 ? (
                          <div className="text-xs text-gray-500">No ad groups due</div>
                        ) : (
                          dayGroups.map((group) => (
                            <div
                              key={group.id}
                              className="rounded border border-blue-200 bg-blue-50 p-2 text-xs shadow-sm"
                            >
                              <div className="font-semibold text-gray-800">
                                {group.name}
                              </div>
                              <div className="mt-1 text-[0.7rem] uppercase tracking-wide text-blue-700">
                                {group.adsCount} {group.adsCount === 1 ? 'ad' : 'ads'}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="pt-2 text-right text-xs font-semibold text-gray-700">
                        {totalAds} total {totalAds === 1 ? 'ad' : 'ads'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {Object.keys(groupsByDay).length === 0 && !loading && (
        <div className="mt-4 text-sm text-gray-500">
          No ad groups found for the selected weeks.
        </div>
      )}
    </PageWrapper>
  );
};

export default AdminCapacityPlanner;
