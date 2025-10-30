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
import useAgencies from './useAgencies';

const DAYS_PER_WEEK = 7;
const WEEKS_TO_RENDER = 8;
const WEEKDAY_INDICES = [0, 1, 2, 3, 4];
const AGENCY_FILTER_ALL = '__all__';
const AGENCY_FILTER_UNASSIGNED = '__unassigned__';

const normalizeBrandCode = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

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
  const [selectedAgencyId, setSelectedAgencyId] = useState(AGENCY_FILTER_ALL);
  const scrollRef = useRef(null);
  const { agencies } = useAgencies();

  const agenciesById = useMemo(() => {
    const map = new Map();
    agencies.forEach((agency) => {
      if (agency?.id) {
        map.set(agency.id, agency);
      }
    });
    return map;
  }, [agencies]);

  const getAgencyDisplayName = (agencyId) => {
    if (agencyId) {
      const agency = agenciesById.get(agencyId);
      if (agency?.name) return agency.name;
      return agencyId;
    }
    return 'Unassigned agency';
  };

  const sortedAgencies = useMemo(() => {
    return [...agencies]
      .filter((agency) => agency?.id)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [agencies]);

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

            let recipesCount = 0;
            try {
              const countSnap = await getCountFromServer(
                collection(db, 'adGroups', docSnap.id, 'recipes')
              );
              recipesCount = countSnap.data().count || 0;
            } catch (err) {
              console.error('Failed to count recipes for ad group', docSnap.id, err);
            }

            const rawAgencyId = typeof data.agencyId === 'string' ? data.agencyId.trim() : '';
            const rawBrandCode = normalizeBrandCode(data.brandCode);

            return {
              id: docSnap.id,
              name: data.name || data.projectName || docSnap.id,
              recipesCount,
              dueDate,
              agencyId: rawAgencyId || null,
              brandCode: rawBrandCode || null,
            };
          })
        );

        if (cancelled) return;

        const brandAgencyMap = new Map();
        const brandCodesToLookup = new Set();
        groups
          .filter((group) => group && !group.agencyId && group.brandCode)
          .forEach((group) => {
            brandCodesToLookup.add(group.brandCode);
          });

        if (brandCodesToLookup.size > 0) {
          const codes = Array.from(brandCodesToLookup);
          const chunkSize = 10;
          const brandCollection = collection(db, 'brands');
          for (let i = 0; i < codes.length; i += chunkSize) {
            const chunk = codes.slice(i, i + chunkSize);
            try {
              const brandQuery = query(brandCollection, where('code', 'in', chunk));
              const brandSnap = await getDocs(brandQuery);
              brandSnap.docs.forEach((brandDoc) => {
                const brandData = brandDoc.data();
                const codeRaw = normalizeBrandCode(brandData.code);
                if (!codeRaw) return;
                const agencyIdRaw =
                  typeof brandData.agencyId === 'string' ? brandData.agencyId.trim() : '';
                if (agencyIdRaw) {
                  brandAgencyMap.set(codeRaw, agencyIdRaw);
                }
              });
            } catch (err) {
              console.error('Failed to load brand agency mapping for capacity planner', err);
            }
          }
        }

        if (cancelled) return;

        const resolvedGroups = groups
          .filter(Boolean)
          .map((group) => {
            if (group.agencyId || !group.brandCode) return group;
            const mappedAgencyId = brandAgencyMap.get(group.brandCode);
            if (typeof mappedAgencyId === 'string' && mappedAgencyId) {
              return { ...group, agencyId: mappedAgencyId };
            }
            return group;
          });

        const mapped = {};
        resolvedGroups.forEach((group) => {
            const key = dayKey(group.dueDate);
            if (!mapped[key]) mapped[key] = {};
            const agencyKey = group.agencyId || AGENCY_FILTER_UNASSIGNED;
            if (!mapped[key][agencyKey]) {
              mapped[key][agencyKey] = {
                agencyId: group.agencyId,
                groups: [],
                totalRecipes: 0,
              };
            }
            mapped[key][agencyKey].groups.push(group);
            mapped[key][agencyKey].totalRecipes += group.recipesCount || 0;
          });

        Object.values(mapped).forEach((agencyMap) => {
          Object.values(agencyMap).forEach((entry) => {
            entry.groups.sort((a, b) => a.name.localeCompare(b.name));
          });
        });

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
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
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
        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
          <label htmlFor="agency-filter" className="font-medium">
            Agency
          </label>
          <select
            id="agency-filter"
            value={selectedAgencyId}
            onChange={(event) => setSelectedAgencyId(event.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-[var(--dark-sidebar-hover)] dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
          >
            <option value={AGENCY_FILTER_ALL}>All agencies</option>
            {sortedAgencies.map((agency) => (
              <option key={agency.id} value={agency.id}>
                {agency.name || agency.id}
              </option>
            ))}
            <option value={AGENCY_FILTER_UNASSIGNED}>Unassigned</option>
          </select>
        </div>
      </div>
      {loading && (
        <div className="mb-4 text-sm text-gray-500 dark:text-gray-400">Loading capacity data…</div>
      )}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-4 scroll-smooth snap-x snap-mandatory"
      >
        {weeks.map((weekStart) => {
          const weekDays = WEEKDAY_INDICES.map((offset) => addDays(weekStart, offset));
          const weekKey = dayKey(weekStart);
          return (
            <div
              key={weekKey}
              className="flex min-w-full flex-col rounded-lg border border-gray-200 bg-white shadow-sm snap-start dark:border-[var(--dark-sidebar-hover)] dark:bg-[var(--dark-sidebar-bg)] md:min-w-[720px] xl:min-w-[960px]"
            >
              <div className="border-b px-4 py-2">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-[var(--dark-text)]">
                  {formatWeekTitle(weekStart)}
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-3 border-b bg-gray-50 px-4 py-3 dark:border-[var(--dark-sidebar-hover)] dark:bg-[var(--dark-sidebar-hover)] sm:grid-cols-3 lg:grid-cols-5">
                {weekDays.map((day) => (
                  <div key={`${weekKey}-${day.getDate()}`} className="text-center">
                    <div className="text-sm font-semibold text-gray-700 dark:text-[var(--dark-text)]">
                      {day.toLocaleDateString(undefined, { weekday: 'short' })}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-300">
                      {day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-3 lg:grid-cols-5">
                {weekDays.map((day) => {
                  const key = dayKey(day);
                  const dayAgencies = Object.entries(groupsByDay[key] || {}).map(
                    ([agencyKey, entry]) => ({ ...entry, agencyKey })
                  );
                  dayAgencies.sort((a, b) => {
                    const nameA = getAgencyDisplayName(a.agencyId);
                    const nameB = getAgencyDisplayName(b.agencyId);
                    return nameA.localeCompare(nameB);
                  });
                  const filteredAgencies =
                    selectedAgencyId === AGENCY_FILTER_ALL
                      ? dayAgencies
                      : dayAgencies.filter((entry) => {
                          if (selectedAgencyId === AGENCY_FILTER_UNASSIGNED) {
                            return !entry.agencyId;
                          }
                          return entry.agencyId === selectedAgencyId;
                        });
                  return (
                    <div
                      key={`${weekKey}-${key}`}
                      className="flex min-h-[240px] flex-col rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-[var(--dark-sidebar-hover)] dark:bg-[var(--dark-sidebar-bg)]"
                    >
                      <div className="flex-1 space-y-3 overflow-auto">
                        {filteredAgencies.length === 0 ? (
                          <div className="text-xs text-gray-500 dark:text-gray-400">No ad groups due</div>
                        ) : (
                          filteredAgencies.map((entry) => {
                            const agencyInfo = entry.agencyId
                              ? agenciesById.get(entry.agencyId)
                              : null;
                            const rawCapacity = agencyInfo?.dailyAdCapacity;
                            const hasCapacity =
                              typeof rawCapacity === 'number' &&
                              Number.isFinite(rawCapacity) &&
                              rawCapacity >= 0;
                            const capacityValue = hasCapacity
                              ? Math.max(0, Math.round(rawCapacity))
                              : null;
                            const overCapacity =
                              capacityValue != null && entry.totalRecipes > capacityValue;
                            const cardColorClass =
                              capacityValue == null
                                ? 'border-gray-200 bg-white dark:border-[var(--dark-sidebar-hover)] dark:bg-[var(--dark-sidebar-bg)]'
                                : overCapacity
                                ? 'border-red-300 bg-red-50 dark:border-red-600 dark:bg-red-950/40'
                                : 'border-green-300 bg-green-50 dark:border-green-600 dark:bg-green-950/40';

                            return (
                              <div
                                key={`${weekKey}-${key}-${entry.agencyKey}`}
                                className={`rounded border p-3 text-xs shadow-sm transition-colors ${cardColorClass}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                                    {getAgencyDisplayName(entry.agencyId)}
                                  </div>
                                  {capacityValue != null ? (
                                    <div
                                      className={`text-xs font-semibold ${
                                        overCapacity
                                          ? 'text-red-700 dark:text-red-300'
                                          : 'text-green-700 dark:text-green-300'
                                      }`}
                                    >
                                      {entry.totalRecipes} / {capacityValue} recipes
                                    </div>
                                  ) : (
                                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                                      {entry.totalRecipes}{' '}
                                      {entry.totalRecipes === 1 ? 'recipe' : 'recipes'}
                                    </div>
                                  )}
                                </div>
                                {capacityValue != null && (
                                  <div className="mt-1 text-[0.65rem] uppercase tracking-wide text-gray-600 dark:text-gray-300">
                                    Daily capacity {capacityValue}{' '}
                                    {capacityValue === 1 ? 'recipe' : 'recipes'}
                                  </div>
                                )}
                                <div className="mt-3 space-y-2">
                                  {entry.groups.map((group) => (
                                    <div
                                      key={group.id}
                                      className="rounded border border-white/60 bg-white/80 p-2 text-xs shadow-sm dark:border-white/10 dark:bg-slate-900/50"
                                    >
                                      <div className="font-semibold text-gray-800 dark:text-gray-100">
                                        {group.name}
                                      </div>
                                      <div className="mt-1 text-[0.7rem] uppercase tracking-wide text-gray-600 dark:text-gray-300">
                                        {group.recipesCount}{' '}
                                        {group.recipesCount === 1 ? 'recipe' : 'recipes'}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })
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
      {Object.keys(groupsByDay).length === 0 && !loading && (
        <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          No ad groups found for the selected weeks.
        </div>
      )}
    </PageWrapper>
  );
};

export default AdminCapacityPlanner;
