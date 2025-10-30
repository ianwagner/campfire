import React, { useEffect, useMemo, useState } from 'react';
import {
  Timestamp,
  collection,
  getCountFromServer,
  getDocs,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import ScrollModal from './ScrollModal.jsx';
import CloseButton from './CloseButton.jsx';
import { db } from '../firebase/config';
import useAgencies from '../useAgencies';

const DAYS_PER_WEEK = 7;
const WEEKS_TO_RENDER = 6;
const WEEKDAY_INDICES = [0, 1, 2, 3, 4];

const normalizeBrandCode = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const normalizeId = (value) => {
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

const formatDayLabel = (date) => {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

const formatRecipesLabel = (count) => {
  if (!Number.isFinite(count) || count <= 0) return 'No recipes scheduled';
  return `${count} ${count === 1 ? 'recipe scheduled' : 'recipes scheduled'}`;
};

const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

const AdGroupScheduleModal = ({
  agencyId,
  currentDate = null,
  currentGroupId = null,
  onClose,
  onSelectDate,
  onClearDate,
}) => {
  const [startWeekMs, setStartWeekMs] = useState(() =>
    startOfWeek(currentDate || new Date()).getTime(),
  );
  const [daysByKey, setDaysByKey] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { agencies } = useAgencies();

  const agencyInfo = useMemo(() => {
    const normalized = normalizeId(agencyId);
    if (!normalized) return null;
    return agencies.find((agency) => normalizeId(agency.id) === normalized) || null;
  }, [agencies, agencyId]);

  const dailyCapacity = useMemo(() => {
    if (!agencyInfo) return null;
    const raw = agencyInfo.dailyAdCapacity;
    if (typeof raw !== 'number') return null;
    if (!Number.isFinite(raw)) return null;
    if (raw < 0) return 0;
    return Math.round(raw);
  }, [agencyInfo]);

  const weeks = useMemo(() => {
    const base = new Date(startWeekMs);
    return Array.from({ length: WEEKS_TO_RENDER }, (_, index) =>
      addDays(base, index * DAYS_PER_WEEK),
    );
  }, [startWeekMs]);

  const selectedDayKey = currentDate ? dayKey(currentDate) : null;

  useEffect(() => {
    setStartWeekMs(startOfWeek(currentDate || new Date()).getTime());
  }, [currentDate]);

  useEffect(() => {
    let cancelled = false;

    const fetchGroups = async () => {
      if (!agencyId) return;
      setLoading(true);
      setError(null);
      try {
        const firstWeekStart = startOfWeek(new Date(startWeekMs));
        const lastWeekStart = addDays(firstWeekStart, (WEEKS_TO_RENDER - 1) * DAYS_PER_WEEK);
        const rangeStart = firstWeekStart;
        const rangeEnd = endOfWeek(lastWeekStart);

        const q = query(
          collection(db, 'adGroups'),
          where('dueDate', '>=', Timestamp.fromDate(rangeStart)),
          where('dueDate', '<=', Timestamp.fromDate(rangeEnd)),
          orderBy('dueDate', 'asc'),
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
                collection(db, 'adGroups', docSnap.id, 'recipes'),
              );
              recipesCount = countSnap.data().count || 0;
            } catch (err) {
              console.error('Failed to count recipes for ad group', docSnap.id, err);
            }

            const rawAgencyId = normalizeId(data.agencyId);
            const rawBrandCode = normalizeBrandCode(data.brandCode);

            return {
              id: docSnap.id,
              name: data.name || data.projectName || docSnap.id,
              recipesCount,
              dueDate,
              agencyId: rawAgencyId || null,
              brandCode: rawBrandCode || null,
            };
          }),
        );

        if (cancelled) return;

        const brandCodesToLookup = new Set();
        groups
          .filter((group) => group && !group.agencyId && group.brandCode)
          .forEach((group) => {
            brandCodesToLookup.add(group.brandCode);
          });

        const brandAgencyMap = new Map();

        if (brandCodesToLookup.size > 0) {
          const brandCollection = collection(db, 'brands');
          for (const chunk of chunkArray(Array.from(brandCodesToLookup), 10)) {
            try {
              const brandQuery = query(brandCollection, where('code', 'in', chunk));
              const brandSnap = await getDocs(brandQuery);
              brandSnap.docs.forEach((brandDoc) => {
                const brandData = brandDoc.data();
                const codeRaw = normalizeBrandCode(brandData.code);
                if (!codeRaw) return;
                const agencyIdRaw = normalizeId(brandData.agencyId);
                if (agencyIdRaw) {
                  brandAgencyMap.set(codeRaw, agencyIdRaw);
                }
              });
            } catch (err) {
              console.error('Failed to load brand agency mapping for schedule modal', err);
            }
            if (cancelled) return;
          }
        }

        if (cancelled) return;

        const filteredGroups = groups
          .filter(Boolean)
          .map((group) => {
            if (group.agencyId) return group;
            if (!group.brandCode) return group;
            const mapped = brandAgencyMap.get(group.brandCode);
            if (mapped) {
              return { ...group, agencyId: mapped };
            }
            return group;
          })
          .filter((group) => normalizeId(group.agencyId) === normalizeId(agencyId));

        const mapped = {};
        filteredGroups.forEach((group) => {
          const key = dayKey(group.dueDate);
          if (!mapped[key]) {
            mapped[key] = {
              groups: [],
              totalRecipes: 0,
            };
          }
          mapped[key].groups.push(group);
          mapped[key].totalRecipes += group.recipesCount || 0;
        });

        Object.values(mapped).forEach((entry) => {
          entry.groups.sort((a, b) => a.name.localeCompare(b.name));
        });

        setDaysByKey(mapped);
      } catch (err) {
        console.error('Failed to load capacity data for schedule modal', err);
        if (!cancelled) {
          setError('Failed to load capacity data.');
          setDaysByKey({});
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchGroups();

    return () => {
      cancelled = true;
    };
  }, [agencyId, startWeekMs]);

  const handleShiftWeek = (delta) => {
    setStartWeekMs((prev) => startOfWeek(addDays(prev, delta * DAYS_PER_WEEK)).getTime());
  };

  const handleSelect = (date) => {
    if (typeof onSelectDate === 'function') {
      const normalized = new Date(date);
      normalized.setHours(0, 0, 0, 0);
      onSelectDate(normalized);
    }
  };

  const canClear = Boolean(currentDate);

  const handleClear = () => {
    if (!canClear) return;
    if (typeof onClearDate === 'function') {
      onClearDate();
    }
  };

  const renderDayCard = (day) => {
    const key = dayKey(day);
    const entry = daysByKey[key] || { groups: [], totalRecipes: 0 };
    const overCapacity =
      dailyCapacity != null && entry.totalRecipes > dailyCapacity;
    const matchesCurrent = selectedDayKey === key;

    const baseClasses =
      'flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500';
    const stateClass = matchesCurrent
      ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/40'
      : overCapacity
        ? 'border-red-300 bg-red-50 dark:border-red-500 dark:bg-red-900/40'
        : 'border-gray-200 bg-white dark:border-[var(--dark-sidebar-hover)] dark:bg-[var(--dark-sidebar-bg)]';

    return (
      <button
        key={key}
        type="button"
        onClick={() => handleSelect(day)}
        className={`${baseClasses} ${stateClass}`}
      >
        <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          {formatDayLabel(day)}
        </div>
        <div className="text-xs text-gray-600 dark:text-gray-300">
          {formatRecipesLabel(entry.totalRecipes)}
        </div>
        {dailyCapacity != null && (
          <div className="text-xs text-gray-600 dark:text-gray-300">
            Capacity: {entry.totalRecipes}/{dailyCapacity}
          </div>
        )}
        <div className="space-y-1">
          {entry.groups.slice(0, 3).map((group) => (
            <div
              key={group.id}
              className={`flex items-center justify-between gap-2 text-xs ${
                group.id === currentGroupId
                  ? 'font-semibold text-gray-900 dark:text-gray-100'
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              <span className="truncate" title={group.name}>
                {group.name}
              </span>
              <span className="whitespace-nowrap">
                {group.recipesCount || 0}
              </span>
            </div>
          ))}
          {entry.groups.length > 3 && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              +{entry.groups.length - 3} more
            </div>
          )}
        </div>
      </button>
    );
  };

  if (!agencyId) {
    return (
      <ScrollModal
        sizeClass="max-w-4xl w-full"
        header={
          <div className="flex items-center justify-between border-b p-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Schedule Due Date
            </h2>
            <CloseButton onClick={onClose} />
          </div>
        }
      >
        <div className="p-4 text-sm text-gray-700 dark:text-gray-300">
          This brand is not associated with an agency, so capacity data is unavailable.
        </div>
      </ScrollModal>
    );
  }

  return (
    <ScrollModal
      sizeClass="max-w-4xl w-full"
      header={
        <div className="flex items-center justify-between border-b p-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Schedule Due Date
          </h2>
          <CloseButton onClick={onClose} />
        </div>
      }
    >
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
          <div className="text-sm text-gray-700 dark:text-gray-200">
            {agencyInfo?.name || agencyId}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            {dailyCapacity != null ? (
              <span>Daily capacity: {dailyCapacity}</span>
            ) : (
              <span>Daily capacity not set</span>
            )}
            <button
              type="button"
              className="btn-tertiary"
              onClick={handleClear}
              disabled={!canClear}
            >
              Clear due date
            </button>
          </div>
        </div>
        {loading && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Loading capacity data…
          </div>
        )}
        {error && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/40 dark:text-red-200">
            {error}
          </div>
        )}
        <div className="space-y-4">
          {weeks.map((weekStart) => {
            const weekDays = WEEKDAY_INDICES.map((offset) => addDays(weekStart, offset));
            const weekKey = dayKey(weekStart);
            return (
              <div
                key={weekKey}
                className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-[var(--dark-sidebar-hover)] dark:bg-[var(--dark-sidebar-bg)]"
              >
                <div className="border-b border-gray-200 pb-2 text-sm font-semibold text-gray-700 dark:border-[var(--dark-sidebar-hover)] dark:text-gray-200">
                  {formatWeekTitle(weekStart)}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {weekDays.map((day) => renderDayCard(day))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ScrollModal>
  );
};

export default AdGroupScheduleModal;
