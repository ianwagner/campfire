import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db, auth } from './firebase/config';
import OptimizedImage from './components/OptimizedImage.jsx';
import TabButton from './components/TabButton.jsx';
import SortButton from './components/SortButton.jsx';
import useSiteSettings from './useSiteSettings';
import useUserRole from './useUserRole';
import useAgencyTheme from './useAgencyTheme';
import { hexToRgba } from './utils/theme.js';

const chunkArray = (values, size) => {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) {
    const chunk = values.slice(i, i + size).filter(Boolean);
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
  }
  return chunks;
};

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const aggregateAdCount = (group) => {
  if (!group) return 0;
  const fields = [
    'reviewedCount',
    'approvedCount',
    'editCount',
    'rejectedCount',
    'archivedCount',
    'readyCount',
    'pendingCount',
  ];
  return fields.reduce((total, key) => {
    const value = Number(group[key]);
    return Number.isFinite(value) ? total + value : total;
  }, 0);
};

const ClientProjects = ({ brandCodes: propBrandCodes = [] }) => {
  const navigate = useNavigate();
  const { agencyId } = useUserRole(auth.currentUser?.uid);
  const brandCodes = useMemo(
    () => propBrandCodes.filter(Boolean),
    [propBrandCodes]
  );
  const { settings, loading: settingsLoading } = useSiteSettings(!agencyId);
  const { agency } = useAgencyTheme(agencyId);
  const artworkUrl = agency?.artworkUrl || settings.artworkUrl;
  const monthColors = settings.monthColors || {};
  const tagStrokeWeight =
    agency?.tagStrokeWeight ?? settings.tagStrokeWeight ?? 1;

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('current');
  const [filter, setFilter] = useState('');
  const [sortField, setSortField] = useState('lastUpdated');

  useEffect(() => {
    let isMounted = true;
    const codes = brandCodes;
    if (!auth.currentUser?.uid || codes.length === 0) {
      setGroups([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const chunks = chunkArray(codes, 10);
    const chunkResults = new Map();

    const updateFromChunks = () => {
      if (!isMounted) return;
      const merged = new Map();
      chunkResults.forEach((list) => {
        list.forEach((item) => {
          merged.set(item.id, item);
        });
      });
      const combined = Array.from(merged.values());
      combined.sort((a, b) => {
        const aTime = a.lastUpdatedDate?.getTime?.() ?? 0;
        const bTime = b.lastUpdatedDate?.getTime?.() ?? 0;
        return bTime - aTime;
      });
      setGroups(combined);
      setLoading(false);
    };

    const unsubscribes = chunks.map((chunk, index) =>
      onSnapshot(
        query(collection(db, 'adGroups'), where('brandCode', 'in', chunk)),
        (snap) => {
          const list = snap.docs.map((doc) => {
            const data = doc.data() || {};
            const createdAtDate = toDate(data.createdAt);
            const lastUpdatedDate = toDate(data.lastUpdated) || createdAtDate;
            return {
              id: doc.id,
              ...data,
              createdAtDate,
              lastUpdatedDate,
            };
          });
          chunkResults.set(index, list);
          updateFromChunks();
        },
        (err) => {
          console.error('Failed to load client ad groups', err);
          chunkResults.delete(index);
          updateFromChunks();
        }
      )
    );

    return () => {
      isMounted = false;
      unsubscribes.forEach((unsub) => {
        if (typeof unsub === 'function') {
          unsub();
        }
      });
    };
  }, [brandCodes]);

  const firstName = auth.currentUser?.displayName?.split(' ')[0];
  const introText = firstName
    ? `Hey ${firstName}, here are your live projects.`
    : 'Here are your live projects.';

  const filterTerm = filter.trim().toLowerCase();
  const displayGroups = useMemo(() => {
    return groups
      .filter((group) => {
        const status = (group.status || '').toLowerCase();
        return view === 'archived'
          ? status === 'archived'
          : status !== 'archived';
      })
      .filter((group) => {
        if (!filterTerm) return true;
        const name = (group.name || '').toLowerCase();
        const brand = (group.brandCode || '').toLowerCase();
        return (
          name.includes(filterTerm) ||
          brand.includes(filterTerm)
        );
      })
      .sort((a, b) => {
        if (sortField === 'name') {
          return (a.name || '').localeCompare(b.name || '');
        }
        if (sortField === 'status') {
          return (a.status || '').localeCompare(b.status || '');
        }
        const aTime = a.lastUpdatedDate?.getTime?.() ?? 0;
        const bTime = b.lastUpdatedDate?.getTime?.() ?? 0;
        return bTime - aTime;
      });
  }, [filterTerm, groups, sortField, view]);

  const showBrandCode = brandCodes.length > 1;

  return (
    <div className="min-h-screen p-4 flex flex-col items-center overflow-y-auto snap-y snap-mandatory scroll-smooth">
      {(loading || settingsLoading) ? (
        <p>Loading projects...</p>
      ) : (
        <div className="w-full flex flex-col items-center">
          {artworkUrl && (
            <section className="snap-start w-full">
              <div className="max-w-[60rem] w-full mx-auto mt-4 h-[25rem] overflow-hidden rounded-lg mb-6 flex items-center justify-center">
                <OptimizedImage
                  pngUrl={artworkUrl}
                  alt="Artwork"
                  loading="eager"
                  className="w-full h-full object-cover object-center"
                />
              </div>
            </section>
          )}
          <section className="snap-start w-full flex flex-col items-center">
            <div className="max-w-xl w-full flex flex-col items-center text-center mb-6">
              <h1 className="text-2xl mb-4">{introText}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 my-4 justify-center">
              <TabButton active={view === 'current'} onClick={() => setView('current')}>
                Current
              </TabButton>
              <TabButton active={view === 'archived'} onClick={() => setView('archived')}>
                Archived
              </TabButton>
              <input
                type="text"
                placeholder="Filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="p-1 border rounded"
              />
              <SortButton
                value={sortField}
                onChange={setSortField}
                options={[
                  { value: 'lastUpdated', label: 'Last Updated' },
                  { value: 'name', label: 'Name' },
                  { value: 'status', label: 'Status' },
                ]}
              />
            </div>
            {displayGroups.length > 0 ? (
              <div className="space-y-3 max-w-xl w-full mx-auto">
                {displayGroups.map((group) => {
                  const status = group.status || 'new';
                  const adCount = aggregateAdCount(group);
                  const rawMonth = group.month;
                  const monthLabel = rawMonth
                    ? new Date(
                        Number(rawMonth.slice(0, 4)),
                        Number(rawMonth.slice(-2)) - 1,
                        1
                      ).toLocaleString('default', { month: 'short' })
                    : null;
                  const monthColorEntry = rawMonth
                    ? monthColors[rawMonth.slice(-2)]
                    : null;
                  const monthColor =
                    typeof monthColorEntry === 'string'
                      ? monthColorEntry
                      : monthColorEntry?.color;
                  const monthOpacity =
                    monthColorEntry && typeof monthColorEntry === 'object'
                      ? monthColorEntry.opacity
                      : 1;
                  const monthTextColor =
                    monthColorEntry && typeof monthColorEntry === 'object'
                      ? monthColorEntry.textColor
                      : '#000000';
                  return (
                    <div
                      key={group.id}
                      className="border rounded-xl p-4 flex justify-between items-center cursor-pointer bg-white hover:bg-gray-50 dark:bg-[var(--dark-sidebar-bg)] dark:hover:bg-[var(--dark-sidebar-hover)]"
                      onClick={() => navigate(`/ad-group/${group.id}`)}
                    >
                      <div className="flex flex-col text-left">
                        <span className="font-medium">{group.name || 'Untitled Project'}</span>
                        {showBrandCode && group.brandCode && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">{group.brandCode}</span>
                        )}
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {status === 'processing' ? (
                            <span className="processing-dots" aria-label="processing" />
                          ) : (
                            status
                          )}
                        </span>
                        {(adCount > 0 || monthLabel) && (
                          <div className="flex gap-2 mt-1">
                            {adCount > 0 && (
                              <span className="tag-pill px-2 py-0.5 text-xs">{adCount}</span>
                            )}
                            {monthLabel && (
                              <span
                                className="tag-pill px-2 py-0.5 text-xs"
                                style={{
                                  backgroundColor:
                                    monthColor &&
                                    monthOpacity < 1 &&
                                    monthColor.startsWith('#')
                                      ? hexToRgba(monthColor, monthOpacity)
                                      : monthColor,
                                  color: monthTextColor,
                                  borderColor: monthTextColor,
                                  borderWidth: tagStrokeWeight,
                                  borderStyle: 'solid',
                                }}
                              >
                                {monthLabel}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="max-w-xl w-full mx-auto text-center text-gray-500">
                No projects to display yet.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default ClientProjects;
