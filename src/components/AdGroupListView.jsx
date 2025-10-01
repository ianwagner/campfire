import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiGrid,
  FiType,
  FiDownload,
  FiList,
  FiColumns,
  FiArchive,
  FiCalendar,
} from 'react-icons/fi';
import { doc, updateDoc } from 'firebase/firestore';
import Table from './common/Table';
import AdGroupCard from './AdGroupCard.jsx';
import TabButton from './TabButton.jsx';
import IconButton from './IconButton.jsx';
import PageToolbar from './PageToolbar.jsx';
import StatusBadge from './StatusBadge.jsx';
import computeKanbanStatus from '../utils/computeKanbanStatus';
import MonthTag from './MonthTag.jsx';
import AdGroupGantt from './AdGroupGantt.jsx';
import { db } from '../firebase/config';
import { normalizeReviewVersion } from '../utils/reviewVersion';

const statusOrder = {
  blocked: 0,
  new: 1,
  briefed: 2,
  designed: 3,
  reviewed: 4,
  done: 5,
  archived: 6,
};

const DEFAULT_VIEWS = ['cards', 'table', 'kanban', 'gantt'];

const REVIEW_FILTER_OPTIONS = [
  { key: 'briefs', label: 'Briefs' },
  { key: 'ads', label: 'Ads' },
  { key: 'all', label: 'All' },
];

const AdGroupListView = ({
  groups = [],
  loading,
  filter,
  onFilterChange,
  view,
  onViewChange,
  showArchived,
  onToggleArchived,
  onShare,
  onGallery,
  onCopy,
  onDownload,
  linkToDetail = false,
  designers = [],
  editors = [],
  designerFilter,
  onDesignerFilterChange,
  editorFilter,
  onEditorFilterChange,
  monthFilter,
  onMonthFilterChange,
  restrictGanttToDueDate = false,
  allowedViews = DEFAULT_VIEWS,
}) => {
  const term = (filter || '').toLowerCase();
  const months = Array.from(new Set(groups.map((g) => g.month).filter(Boolean))).sort();
  const [sortField, setSortField] = useState('title');
  const [reviewVersions, setReviewVersions] = useState({});
  const [updatingReview, setUpdatingReview] = useState(null);
  const [reviewFilter, setReviewFilter] = useState('all');

  const reviewTypeAvailability = useMemo(() => {
    let hasBriefs = false;
    let hasAds = false;

    groups.forEach((group) => {
      const normalized = normalizeReviewVersion(group.reviewVersion ?? 1);
      if (normalized === '3') {
        hasBriefs = true;
      } else if (normalized === '1' || normalized === '2') {
        hasAds = true;
      }
    });

    return { hasBriefs, hasAds };
  }, [groups]);

  const shouldShowReviewToggle = reviewTypeAvailability.hasBriefs && reviewTypeAvailability.hasAds;

  useEffect(() => {
    if (!shouldShowReviewToggle && reviewFilter !== 'all') {
      setReviewFilter('all');
    }
  }, [shouldShowReviewToggle, reviewFilter]);

  const handleReviewTypeChange = async (groupId, newValue, previousValue, hadOverride) => {
    const normalizedValue = normalizeReviewVersion(newValue);
    const numericValue = Number(normalizedValue);
    setReviewVersions((prev) => ({ ...prev, [groupId]: normalizedValue }));
    setUpdatingReview(groupId);
    try {
      await updateDoc(doc(db, 'adGroups', groupId), { reviewVersion: numericValue });
    } catch (err) {
      console.error('Failed to update review version', err);
      setReviewVersions((prev) => {
        const next = { ...prev };
        if (hadOverride) {
          next[groupId] = previousValue;
        } else {
          delete next[groupId];
        }
        return next;
      });
    } finally {
      setUpdatingReview(null);
    }
  };

  const normalizedViews = useMemo(() => {
    if (!Array.isArray(allowedViews) || allowedViews.length === 0) {
      return DEFAULT_VIEWS;
    }
    return allowedViews.filter(Boolean);
  }, [JSON.stringify(allowedViews)]);

  const viewButtonConfigs = useMemo(
    () => ({
      table: { Icon: FiList, label: 'Table view' },
      kanban: { Icon: FiColumns, label: 'Kanban view' },
      gantt: { Icon: FiCalendar, label: 'Gantt view' },
    }),
    []
  );

  const availableViewButtons = ['table', 'kanban', 'gantt'].filter((v) => normalizedViews.includes(v));

  useEffect(() => {
    if (
      normalizedViews.length > 0 &&
      view &&
      !normalizedViews.includes(view) &&
      typeof onViewChange === 'function'
    ) {
      onViewChange(normalizedViews[0]);
    }
  }, [view, normalizedViews, onViewChange]);

  const displayGroups = groups
    .filter(
      (g) =>
        !term ||
        g.name?.toLowerCase().includes(term) ||
        g.brandCode?.toLowerCase().includes(term)
    )
    .filter((g) => {
      if (!shouldShowReviewToggle || reviewFilter === 'all') {
        return true;
      }
      const normalized = normalizeReviewVersion(g.reviewVersion ?? 1);
      if (reviewFilter === 'briefs') {
        return normalized === '3';
      }
      if (reviewFilter === 'ads') {
        return normalized === '1' || normalized === '2';
      }
      return true;
    })
    .filter((g) => !designerFilter || g.designerId === designerFilter)
    .filter((g) => !editorFilter || g.editorId === editorFilter)
    .filter((g) => !monthFilter || g.month === monthFilter)
    .sort((a, b) => {
      switch (sortField) {
        case 'title':
          return (a.name || '').localeCompare(b.name || '');
        case 'month':
          return (parseInt(a.month, 10) || 0) - (parseInt(b.month, 10) || 0);
        case 'dueDate': {
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
        }
        case 'brand':
          return (a.brandCode || '').localeCompare(b.brandCode || '');
        default:
          return (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
      }
    });

  return (
    <div className="mb-8">
      <PageToolbar
        left={(
          <>
            {shouldShowReviewToggle && (
              <div className="flex items-center gap-1 mr-2" role="group" aria-label="Filter by review type">
                {REVIEW_FILTER_OPTIONS.map(({ key, label }) => (
                  <TabButton
                    key={key}
                    type="button"
                    active={reviewFilter === key}
                    onClick={() => setReviewFilter(key)}
                    aria-pressed={reviewFilter === key}
                  >
                    {label}
                  </TabButton>
                ))}
              </div>
            )}
            <input
              type="text"
              placeholder="Filter"
              value={filter}
              onChange={(e) => onFilterChange(e.target.value)}
              className="p-1 border rounded"
            />
            {view === 'kanban' && onDesignerFilterChange && (
              <select
                value={designerFilter}
                onChange={(e) => onDesignerFilterChange(e.target.value)}
                className="p-1 border rounded"
              >
                <option value="">All designers</option>
                {designers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
            {view === 'kanban' && onEditorFilterChange && (
              <select
                value={editorFilter}
                onChange={(e) => onEditorFilterChange(e.target.value)}
                className="p-1 border rounded"
              >
                <option value="">All editors</option>
                {editors.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            )}
            {onMonthFilterChange && (
              <select
                value={monthFilter}
                onChange={(e) => onMonthFilterChange(e.target.value)}
                className="p-1 border rounded"
              >
                <option value="">All months</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
              className="p-1 border rounded"
              aria-label="Sort by"
            >
              <option value="title">Title</option>
              <option value="month">Month</option>
              <option value="dueDate">Due Date</option>
              <option value="brand">Brand</option>
            </select>
            {typeof showArchived !== 'undefined' && (
              <TabButton
                type="button"
                active={showArchived}
                onClick={onToggleArchived}
                aria-label={showArchived ? 'Hide archived' : 'Show archived'}
              >
                <FiArchive />
              </TabButton>
            )}
            {availableViewButtons.length > 1 && (
              <>
                <div className="border-l h-6 mx-2" />
                {availableViewButtons.map((key) => {
                  const config = viewButtonConfigs[key];
                  if (!config) return null;
                  const { Icon, label } = config;
                  return (
                    <TabButton
                      key={key}
                      active={view === key}
                      onClick={() => onViewChange && onViewChange(key)}
                      aria-label={label}
                    >
                      <Icon />
                    </TabButton>
                  );
                })}
              </>
            )}
          </>
        )}
      />
      {loading ? (
        <p>Loading groups...</p>
      ) : displayGroups.length === 0 ? (
        <p>No ad groups found.</p>
      ) : (
        <>
          <div className="sm:hidden space-y-4">
            {displayGroups.map((g) => (
              <AdGroupCard
                key={g.id}
                group={g}
                onGallery={onGallery ? () => onGallery(g.id) : undefined}
                onCopy={onCopy ? () => onCopy(g.id) : undefined}
                onDownload={onDownload ? () => onDownload(g.id) : undefined}
                triggerClickMenu={!linkToDetail}
              />
            ))}
          </div>
          {view === 'table' ? (
            <div className="hidden sm:block mt-[0.8rem]">
              <Table>
                <thead>
                  <tr>
                    <th>Group Name</th>
                    <th>Brand</th>
                    <th>Month</th>
                    <th className="text-center">Review Type</th>
                    <th className="text-center">Reviewed</th>
                    <th className="text-center">Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayGroups.map((g) => {
                    const normalizedReviewVersion =
                      reviewVersions[g.id] ?? normalizeReviewVersion(g.reviewVersion ?? 1);
                    const hadOverride = reviewVersions[g.id] !== undefined;

                    return (
                      <tr key={g.id}>
                        <td>
                          {linkToDetail ? (
                            <Link to={`/ad-group/${g.id}`}>{g.name}</Link>
                          ) : (
                            g.name
                          )}
                        </td>
                        <td>{g.brandCode}</td>
                        <td>
                          <MonthTag month={g.month} />
                        </td>
                        <td className="text-center">
                          <select
                            className="border rounded p-1 text-sm"
                            aria-label={`Review type for ${g.name || g.id}`}
                            value={normalizedReviewVersion}
                            onChange={(e) =>
                              handleReviewTypeChange(
                                g.id,
                                e.target.value,
                                normalizedReviewVersion,
                                hadOverride,
                              )
                            }
                            disabled={updatingReview === g.id}
                          >
                            <option value="1">Legacy</option>
                            <option value="2">2.0</option>
                            <option value="3">Brief</option>
                          </select>
                        </td>
                        <td className="text-center">{g.reviewedCount ?? 0}</td>
                        <td className="text-center">
                          <StatusBadge status={g.status} />
                        </td>
                        <td className="text-center">
                          {(onGallery || onCopy || onDownload) && (
                            <div className="flex items-center justify-center">
                              {onGallery && (
                                <IconButton onClick={() => onGallery(g.id)} aria-label="See Gallery">
                                  <FiGrid />
                                </IconButton>
                              )}
                              {onCopy && (
                                <IconButton onClick={() => onCopy(g.id)} className="ml-2" aria-label="See Platform Copy">
                                  <FiType />
                                </IconButton>
                              )}
                              {onDownload && (
                                <IconButton
                                  onClick={() => onDownload(g.id)}
                                  className={onGallery || onCopy ? 'ml-2' : 'ml-0'}
                                  aria-label="Download Approved Assets"
                                >
                                  <FiDownload />
                                </IconButton>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          ) : view === 'kanban' ? (
            <div className="hidden sm:block overflow-x-auto mt-[0.8rem]">
              {shouldShowReviewToggle && (
                <div className="flex justify-end mb-3">
                  <label htmlFor="kanban-review-filter" className="mr-2 text-sm font-medium">
                    Review type
                  </label>
                  <select
                    id="kanban-review-filter"
                    className="border rounded p-1 text-sm"
                    value={reviewFilter}
                    onChange={(e) => setReviewFilter(e.target.value)}
                  >
                    {REVIEW_FILTER_OPTIONS.map(({ key, label }) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="min-w-max flex gap-4">
                {[
                  { label: 'New', status: 'new' },
                  { label: 'Blocked', status: 'blocked' },
                  { label: 'Briefed', status: 'briefed' },
                  { label: 'Designed', status: 'designed' },
                  { label: 'Reviewed', status: 'reviewed' },
                  { label: 'Done', status: 'done' },
                ].map((col) => (
                  <div key={col.status} className="flex-shrink-0 w-[240px] sm:w-[320px]">
                    <h2 className="text-xl mb-2 capitalize">{col.label}</h2>
                    <div
                      className="bg-[#F7F7F7] dark:bg-[var(--dark-bg)] border border-gray-300 dark:border-gray-600 rounded-t-[1rem] rounded-b-[1rem] flex flex-col items-center gap-4 p-[0.6rem] overflow-y-auto"
                      style={{ maxHeight: 'calc(100vh - 13rem)' }}
                    >
                      {displayGroups
                        .filter((g) => computeKanbanStatus(g) === col.status)
                        .map((g) => (
                          <AdGroupCard
                            key={g.id}
                            group={g}
                            onGallery={onGallery ? () => onGallery(g.id) : undefined}
                            onCopy={onCopy ? () => onCopy(g.id) : undefined}
                            onDownload={onDownload ? () => onDownload(g.id) : undefined}
                            triggerClickMenu={!linkToDetail}
                          />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="hidden sm:block">
              <AdGroupGantt
                groups={displayGroups}
                designers={designers}
                editors={editors}
                restrictToDueDate={restrictGanttToDueDate}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdGroupListView;
