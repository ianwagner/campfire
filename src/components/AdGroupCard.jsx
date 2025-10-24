import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiZap,
  FiGrid,
  FiThumbsUp,
  FiThumbsDown,
  FiEdit,
  FiCalendar,
  FiMoreHorizontal,
  FiCheckCircle,
  FiLink,
  FiEdit2,
  FiDownload,
  FiType,
  FiArchive,
  FiRotateCcw,
  FiTrash,
  FiClock,
  FiUser,
} from 'react-icons/fi';
import { auth } from '../firebase/config';
import useUserRole from '../useUserRole';
import IconButton from './IconButton.jsx';
import MonthTag from './MonthTag.jsx';
import InfoTooltip from './InfoTooltip.jsx';
import { getReviewTypeLabel } from '../utils/reviewVersion';
import computeKanbanStatus from '../utils/computeKanbanStatus';


const AdGroupCard = ({
  group,
  onReview,
  onShare,
  onRename,
  onArchive,
  onRestore,
  onDelete,
  onGallery,
  onCopy,
  onDownload,
  onChangeMonth,
  onChangeDueDate,
  onChangeDesigner,
  triggerClickMenu,
  hideMenu = false,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const user = auth.currentUser;
  const { role } = useUserRole(user?.uid);
  const isAdmin = role === 'admin';
  const hideStaff = role === 'client';
  const dueField =
    role === 'designer'
      ? group.designDueDate
      : role === 'editor'
      ? group.editorDueDate
      : role === 'project-manager' || isAdmin
      ? group.dueDate
      : null;
  const reviewTypeLabel = isAdmin
    ? getReviewTypeLabel(group.reviewVersion ?? group.reviewType ?? 1)
    : null;
  const unitCount =
    group.unitCount ?? group.recipeCount ?? group.assetCount ?? 0;
  const pendingTotal = group.pendingCount ?? 0;
  const counts = group.counts || {};

  const handleClick = (e, cb) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    cb && cb();
  };

  const statusThemes = {
    new: {
      border: 'border-blue-100 dark:border-blue-500/40',
      indicator: 'bg-blue-500',
      badge: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-200',
    },
    blocked: {
      border: 'border-red-100 dark:border-red-500/40',
      indicator: 'bg-red-500',
      badge: 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-200',
    },
    briefed: {
      border: 'border-amber-100 dark:border-amber-500/40',
      indicator: 'bg-amber-500',
      badge: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-200',
    },
    designed: {
      border: 'border-indigo-100 dark:border-indigo-500/40',
      indicator: 'bg-indigo-500',
      badge: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-200',
    },
    reviewed: {
      border: 'border-sky-100 dark:border-sky-500/40',
      indicator: 'bg-sky-500',
      badge: 'bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-200',
    },
    done: {
      border: 'border-emerald-100 dark:border-emerald-500/40',
      indicator: 'bg-emerald-500',
      badge: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-200',
    },
    default: {
      border: 'border-gray-200 dark:border-gray-600',
      indicator: 'bg-gray-400',
      badge: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200',
    },
  };

  const statusLabels = {
    new: 'New',
    blocked: 'Blocked',
    briefed: 'Briefed',
    designed: 'Designed',
    reviewed: 'Reviewed',
    done: 'Done',
  };

  const statusKey = computeKanbanStatus(group) ?? 'default';
  const theme = statusThemes[statusKey] ?? statusThemes.default;
  const statusLabel = statusLabels[statusKey] ?? 'In Progress';
  const dueDateRaw = dueField
    ? dueField.toDate
      ? dueField.toDate()
      : new Date(dueField)
    : null;
  const dueDateLabel = dueDateRaw
    ? dueDateRaw.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;
  const totalReviewed = (counts.approved ?? 0) + (counts.edit ?? 0) + (counts.rejected ?? 0);
  const totalProduction = totalReviewed + pendingTotal;
  const progress = totalProduction > 0 ? Math.round(((counts.approved ?? 0) / totalProduction) * 100) : 0;

  return (
    <div
      className={`relative bg-white dark:bg-[var(--dark-sidebar-bg)] border ${theme.border} rounded-xl text-inherit shadow-sm w-full transition duration-200 hover:-translate-y-0.5 hover:shadow-lg`}
    >
      <div className={`absolute inset-y-0 left-0 w-1 rounded-l-xl ${theme.indicator}`} aria-hidden="true" />
      {!hideMenu && !triggerClickMenu && (
        <IconButton
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
          className="absolute top-1 right-1 bg-transparent hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)]"
          aria-label="Menu"
        >
          <FiMoreHorizontal />
        </IconButton>
      )}
      {!hideMenu && menuOpen && (
        <div className="absolute right-1 top-7 z-10 bg-white dark:bg-[var(--dark-sidebar-bg)] border border-gray-300 dark:border-gray-600 rounded shadow text-sm">
          {onReview && (
            <button
              onClick={(e) => handleClick(e, onReview)}
              className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
            >
              <FiCheckCircle /> Review
            </button>
          )}
          {onShare && (
            <button
              onClick={(e) => handleClick(e, onShare)}
              className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
            >
              <FiLink /> Share Link
            </button>
          )}
          {onGallery && (
            <button
              onClick={(e) => handleClick(e, onGallery)}
              className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
            >
              <FiGrid /> See Gallery
            </button>
          )}
          {onCopy && (
            <button
              onClick={(e) => handleClick(e, onCopy)}
              className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
            >
              <FiType /> Platform Copy
            </button>
          )}
          {onDownload && (
            <button
              onClick={(e) => handleClick(e, onDownload)}
              className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
            >
              <FiDownload /> Download Approved
            </button>
          )}
          {onChangeMonth && (
            <button
              onClick={(e) => handleClick(e, onChangeMonth)}
              className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
            >
              <FiClock /> Change Month
            </button>
          )}
          {onChangeDueDate && (
            <button
              onClick={(e) => handleClick(e, onChangeDueDate)}
              className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
            >
              <FiCalendar /> Change Due Date
            </button>
          )}
          {onChangeDesigner && (
            <button
              onClick={(e) => handleClick(e, onChangeDesigner)}
              className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
            >
              <FiUser /> Change Designer
            </button>
          )}
          {onRename && (
            <button
              onClick={(e) => handleClick(e, onRename)}
              className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
            >
              <FiEdit2 /> Rename
            </button>
          )}
          {onArchive && (
            <button
              onClick={(e) => handleClick(e, onArchive)}
              className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
            >
              <FiArchive /> Archive
            </button>
          )}
          {onRestore && (
            <button
              onClick={(e) => handleClick(e, onRestore)}
              className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
            >
              <FiRotateCcw /> Restore
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => handleClick(e, onDelete)}
              className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1 text-red-600"
            >
              <FiTrash /> Delete
            </button>
          )}
        </div>
      )}
      <Link
        to={triggerClickMenu ? '#' : `/ad-group/${group.id}`}
        onClick={
          triggerClickMenu
            ? (e) => {
                e.preventDefault();
                setMenuOpen((o) => !o);
              }
            : undefined
        }
        className="block px-4 pb-4 pt-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full ${theme.badge}`}>
                {statusLabel}
              </span>
              {dueDateLabel && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-300" data-testid="due-date">
                  <FiCalendar className="w-3.5 h-3.5" />
                  Due {dueDateLabel}
                </span>
              )}
              <MonthTag month={group.month} />
            </div>
            <p className="font-semibold text-[15px] text-gray-900 dark:text-[var(--dark-text)] leading-tight line-clamp-2">
              {group.name}
            </p>
            <p className="text-[12px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mt-1">{group.brandCode}</p>
            {group.designerName && role !== 'ops' && !hideStaff && (
              <p className="text-[12px] text-gray-600 dark:text-gray-300 mt-1 flex items-center gap-1">
                <FiUser className="w-3.5 h-3.5" /> {group.designerName}
              </p>
            )}
            {group.editorName && role !== 'ops' && !hideStaff && (
              <p className="text-[12px] text-gray-600 dark:text-gray-300 mt-0.5 flex items-center gap-1">
                <FiUser className="w-3.5 h-3.5" /> {group.editorName}
              </p>
            )}
            {isAdmin && (
              <p className="text-[12px] text-gray-600 dark:text-gray-300 mt-0.5">Review Type: {reviewTypeLabel}</p>
            )}
          </div>
        </div>
        {totalProduction > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
              <span>{pendingTotal} pending</span>
              <span className="font-semibold text-gray-700 dark:text-gray-200">{progress}% approved</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div className={`h-full ${theme.indicator}`} style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        <div className="mt-3 rounded-xl border border-dashed border-gray-200 dark:border-gray-600/60 bg-gray-50 dark:bg-[var(--dark-sidebar-hover)]">
          <div className="grid grid-cols-3 divide-x divide-gray-200 dark:divide-gray-600 text-center text-[12px]">
            <InfoTooltip text="Recipes" className="w-full">
              <div className="flex flex-col items-center gap-1 py-2 text-gray-600 dark:text-gray-300">
                <FiZap className="w-4 h-4" />
                <span className="font-semibold">{group.recipeCount ?? 0}</span>
              </div>
            </InfoTooltip>
            <InfoTooltip text="Ad units" className="w-full">
              <div className="flex flex-col items-center gap-1 py-2 text-gray-600 dark:text-gray-300">
                <FiGrid className="w-4 h-4" />
                <span className="font-semibold">{unitCount}</span>
              </div>
            </InfoTooltip>
            <InfoTooltip text="Pending review" className="w-full">
              <div className="flex flex-col items-center gap-1 py-2 text-accent">
                <FiClock className="w-4 h-4" />
                <span className="font-semibold">{pendingTotal}</span>
              </div>
            </InfoTooltip>
          </div>
          <div className="grid grid-cols-3 divide-x divide-gray-200 dark:divide-gray-600 text-center text-[12px] border-t border-gray-200 dark:border-gray-600/60">
            <InfoTooltip text="Approved" className="w-full">
              <div className="flex flex-col items-center gap-1 py-2 text-approve">
                <FiThumbsUp className="w-4 h-4" />
                <span className="font-semibold">{counts.approved ?? 0}</span>
              </div>
            </InfoTooltip>
            <InfoTooltip text="Rejected" className="w-full">
              <div className="flex flex-col items-center gap-1 py-2 text-reject">
                <FiThumbsDown className="w-4 h-4" />
                <span className="font-semibold">{counts.rejected ?? 0}</span>
              </div>
            </InfoTooltip>
            <InfoTooltip text="Needs edits" className="w-full">
              <div className="flex flex-col items-center gap-1 py-2 text-edit">
                <FiEdit className="w-4 h-4" />
                <span className="font-semibold">{counts.edit ?? 0}</span>
              </div>
            </InfoTooltip>
          </div>
        </div>
      </Link>
    </div>
  );
};

export default AdGroupCard;
