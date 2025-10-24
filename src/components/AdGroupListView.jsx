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
  FiSearch,
  FiRefreshCw,
  FiFilter,
  FiLayers,
  FiClock,
  FiUsers,
  FiEye,
  FiCheckCircle,
  FiBarChart2,
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

const SummaryCard = ({ icon: Icon, label, value, accent = '' }) => (
  <div
    className={`flex items-center gap-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 rounded-2xl px-3 py-3 shadow-sm ${accent}`.trim()}
  >
    {Icon && (
      <div className="p-2 rounded-xl bg-[var(--accent-color-10)] text-[var(--accent-color-80)] dark:bg-[var(--accent-color-20)] dark:text-white">
        <Icon className="w-5 h-5" />
      </div>
    )}
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  </div>
);

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
  reviewFilter,
  onReviewFilterChange,
  restrictGanttToDueDate = false,
  allowedViews = DEFAULT_VIEWS,
}) => {
  const term = (filter || '').toLowerCase();
  const months = Array.from(new Set(groups.map((g) => g.month).filter(Boolean))).sort();
  const [sortField, setSortField] = useState('title');
  const [reviewVersions, setReviewVersions] = useState({});
  const [updatingReview, setUpdatingReview] = useState(null);
  const hasDesignerFilter = view === 'kanban' && typeof onDesignerFilterChange === 'function';
  const hasEditorFilter = view === 'kanban' && typeof onEditorFilterChange === 'function';
  const hasMonthFilter = typeof onMonthFilterChange === 'function';
  const hasReviewFilter = typeof onReviewFilterChange === 'function';
  const hasFilterControls = Boolean(
    hasDesignerFilter || hasEditorFilter || hasMonthFilter || hasReviewFilter
  );
  const hasActiveFilters = Boolean(
    (filter && filter.trim()) ||
      (hasDesignerFilter && designerFilter && designerFilter !== '') ||
      (hasEditorFilter && editorFilter && editorFilter !== '') ||
      (hasMonthFilter && monthFilter && monthFilter !== '') ||
      (hasReviewFilter && reviewFilter && reviewFilter !== '')
  );

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

  const normalizedReviewFilter = reviewFilter
    ? normalizeReviewVersion(reviewFilter)
    : '';

  const displayGroups = groups
    .filter(
      (g) =>
        !term ||
        g.name?.toLowerCase().includes(term) ||
        g.brandCode?.toLowerCase().includes(term)
    )
    .filter((g) => !designerFilter || g.designerId === designerFilter)
    .filter((g) => !editorFilter || g.editorId === editorFilter)
    .filter((g) => !monthFilter || g.month === monthFilter)
    .filter((g) => {
      if (!normalizedReviewFilter) return true;
      const value = normalizeReviewVersion(g.reviewVersion ?? g.reviewType ?? 1);
      return value === normalizedReviewFilter;
    })
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

  const summaryMetrics = useMemo(() => {
    const statusCounts = {
      new: 0,
      blocked: 0,
      briefed: 0,
      designed: 0,
      reviewed: 0,
      done: 0,
    };

    let dueSoon = 0;
    let needsAssignee = 0;
    const now = new Date();
    const oneWeekMs = 1000 * 60 * 60 * 24 * 7;

    displayGroups.forEach((group) => {
      const status = computeKanbanStatus(group);
      if (status && statusCounts[status] !== undefined) {
        statusCounts[status] += 1;
      }

      const dueValue = group?.dueDate;
      const dueDate =
        dueValue && typeof dueValue.toDate === 'function'
          ? dueValue.toDate()
          : dueValue
          ? new Date(dueValue)
          : null;

      if (dueDate) {
        const diff = dueDate.getTime() - now.getTime();
        if (diff >= 0 && diff <= oneWeekMs) {
          dueSoon += 1;
        }
      }

      if (!group?.designerId || !group?.editorId) {
        needsAssignee += 1;
      }
    });

    return {
      total: displayGroups.length,
      dueSoon,
      needsAssignee,
      statusCounts,
    };
  }, [displayGroups]);

  const resetFilters = () => {
    if (onFilterChange) onFilterChange('');
    if (onDesignerFilterChange) onDesignerFilterChange('');
    if (onEditorFilterChange) onEditorFilterChange('');
    if (onMonthFilterChange) onMonthFilterChange('');
    if (onReviewFilterChange) onReviewFilterChange('');
  };

  const summaryCards = useMemo(
    () => [
      {
        key: 'total',
        label: 'Total Groups',
        value: summaryMetrics.total,
        icon: FiLayers,
      },
      {
        key: 'dueSoon',
        label: 'Due In 7 Days',
        value: summaryMetrics.dueSoon,
        icon: FiClock,
      },
      {
        key: 'needsAssignee',
        label: 'Needs Assignments',
        value: summaryMetrics.needsAssignee,
        icon: FiUsers,
      },
      {
        key: 'inReview',
        label: 'In Review',
        value: summaryMetrics.statusCounts.reviewed,
        icon: FiEye,
      },
      {
        key: 'completed',
        label: 'Completed',
        value: summaryMetrics.statusCounts.done,
        icon: FiCheckCircle,
      },
    ],
    [summaryMetrics]
  );

  return (
    <div className="mb-8">
      <PageToolbar
        left={(
          <>
            <div className="relative w-full sm:w-auto sm:min-w-[16rem]">
              <FiSearch className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="text"
                placeholder="Search ad groups"
                value={filter}
                onChange={(e) => onFilterChange(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color-30)]"
                aria-label="Search ad groups"
              />
            </div>
            {hasFilterControls && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-800 px-2 py-1.5">
                <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <FiFilter className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Filters</span>
                </div>
                {hasDesignerFilter && (
                  <select
                    value={designerFilter}
                    onChange={(e) => onDesignerFilterChange(e.target.value)}
                    className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-sm"
                  >
                    <option value="">All designers</option>
                    {designers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
                {hasEditorFilter && (
                  <select
                    value={editorFilter}
                    onChange={(e) => onEditorFilterChange(e.target.value)}
                    className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-sm"
                  >
                    <option value="">All editors</option>
                    {editors.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                )}
                {hasMonthFilter && (
                  <select
                    value={monthFilter}
                    onChange={(e) => onMonthFilterChange(e.target.value)}
                    className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-sm"
                  >
                    <option value="">All months</option>
                    {months.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                )}
                {hasReviewFilter && (
                  <select
                    value={reviewFilter}
                    onChange={(e) => onReviewFilterChange(e.target.value)}
                    className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-sm"
                    aria-label="Filter by review type"
                  >
                    <option value="">All review types</option>
                    <option value="2">Review 2.0</option>
                    <option value="3">Brief</option>
                    <option value="1">Legacy</option>
                  </select>
                )}
              </div>
            )}
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
              className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-sm"
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
            {hasActiveFilters && (
              <IconButton
                onClick={resetFilters}
                className="text-sm font-medium border border-transparent hover:border-[var(--accent-color-30)]"
                aria-label="Reset filters"
              >
                <FiRefreshCw className="w-4 h-4" />
                <span>Reset</span>
              </IconButton>
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
      {!loading && summaryMetrics.total > 0 && (
        <div className="mb-4 rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3 uppercase tracking-wide">
            <FiBarChart2 className="w-4 h-4" aria-hidden="true" />
            <span>Ad group health</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {summaryCards.map((card) => (
              <SummaryCard key={card.key} icon={card.icon} label={card.label} value={card.value} />
            ))}
          </div>
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-2">
              <FiColumns className="w-4 h-4" aria-hidden="true" />
              <span>Status breakdown</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[{ label: 'New', key: 'new' },
                { label: 'Blocked', key: 'blocked' },
                { label: 'Briefed', key: 'briefed' },
                { label: 'Designed', key: 'designed' },
                { label: 'Reviewed', key: 'reviewed' },
                { label: 'Done', key: 'done' },
              ].map((status) => (
                <div
                  key={status.key}
                  className="flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-800 px-3 py-1"
                >
                  <StatusBadge status={status.label} className="capitalize" />
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {summaryMetrics.statusCounts[status.key] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
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
