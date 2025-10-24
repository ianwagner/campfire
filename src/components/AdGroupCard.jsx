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
  FiLink,
  FiEdit2,
  FiDownload,
  FiType,
  FiArchive,
  FiRotateCcw,
  FiTrash,
  FiClock,
  FiUser,
  FiCheckCircle,
} from 'react-icons/fi';
import { auth } from '../firebase/config';
import useUserRole from '../useUserRole';
import IconButton from './IconButton.jsx';
import MonthTag from './MonthTag.jsx';
import InfoTooltip from './InfoTooltip.jsx';


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
  const hideStaff = role === 'client';
  const formatDate = (value) => {
    if (!value) return null;
    const date = value.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString();
  };

  const dueDates = [];
  const overallDueDate = formatDate(group.dueDate);

  if (role === 'designer' && group.designDueDate) {
    dueDates.push({
      key: 'design',
      label: 'Design Due',
      value: formatDate(group.designDueDate),
    });
  } else if (role === 'editor' && group.editorDueDate) {
    dueDates.push({
      key: 'edit',
      label: 'Edit Due',
      value: formatDate(group.editorDueDate),
    });
  }

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

  return (
    <div className="relative bg-white dark:bg-[var(--dark-sidebar-bg)] border border-gray-300 dark:border-gray-600 rounded-lg text-inherit shadow-md w-full">
      <Link
        to={triggerClickMenu ? '#' : `/ad-group/${group.id}`}
        onClick={triggerClickMenu ? (e) => { e.preventDefault(); setMenuOpen((o) => !o); } : undefined}
        className="block"
      >
        <div className="flex items-start justify-between gap-4 px-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[14px] text-black dark:text-[var(--dark-text)] mb-0 line-clamp-2">
              {group.name}
            </p>
            {group.brandName && (
              <p className="text-[12px] text-black dark:text-[var(--dark-text)] mb-1 line-clamp-2">
                {group.brandName}
              </p>
            )}
            {group.brandCode && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-[10px] uppercase tracking-wide text-gray-600 dark:text-gray-200">
                {group.brandCode}
              </span>
            )}
            {overallDueDate && (
              <div
                className="mt-1 flex items-center gap-1 text-[12px] text-gray-600 dark:text-gray-300"
                data-testid="due-date"
              >
                <FiCalendar className="text-gray-500 dark:text-gray-400" />
                <span>{overallDueDate}</span>
              </div>
            )}
            {group.designerName && role !== 'ops' && !hideStaff && (
              <p className="text-[12px] text-black dark:text-[var(--dark-text)] mb-0">
                {group.designerName}
              </p>
            )}
            {group.editorName && role !== 'ops' && !hideStaff && (
              <p className="text-[12px] text-black dark:text-[var(--dark-text)] mb-0">
                {group.editorName}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            {!hideMenu && (
              <div className="relative self-end">
                {!triggerClickMenu && (
                  <IconButton
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuOpen((o) => !o);
                    }}
                    className="bg-transparent hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)]"
                    aria-label="Menu"
                  >
                    <FiMoreHorizontal />
                  </IconButton>
                )}
                {menuOpen && (
                  <div className="absolute right-0 mt-1 z-10 w-max bg-white dark:bg-[var(--dark-sidebar-bg)] border border-gray-300 dark:border-gray-600 rounded shadow text-sm">
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
              </div>
            )}
            {dueDates.map((due) => (
              <p
                key={due.key}
                className="text-[12px] text-black dark:text-[var(--dark-text)] flex flex-col items-end text-right"
              >
                <span className="flex items-center gap-1 text-gray-500 dark:text-gray-300 uppercase tracking-wide text-[10px]">
                  <FiCalendar className="text-gray-600 dark:text-gray-300" />
                  {due.label}
                </span>
                <span>{due.value}</span>
              </p>
            ))}
            <MonthTag month={group.month} />
          </div>
        </div>
        <div className="border-t border-gray-300 dark:border-gray-600 px-3 py-2">
          <div className="grid grid-cols-6 text-center text-sm">
            <InfoTooltip text="Recipes" className="w-full">
              <div className="flex items-center justify-center gap-1 text-gray-600">
                <FiZap />
                <span>{group.recipeCount}</span>
              </div>
            </InfoTooltip>
            <InfoTooltip text="Ad units" className="w-full">
              <div className="flex items-center justify-center gap-1 text-gray-600">
                <FiGrid />
                <span>{unitCount}</span>
              </div>
            </InfoTooltip>
            <InfoTooltip text="Pending review" className="w-full">
              <div className="flex items-center justify-center gap-1 text-accent">
                <FiClock />
                <span>{pendingTotal}</span>
              </div>
            </InfoTooltip>
            <InfoTooltip text="Approved" className="w-full">
              <div className="flex items-center justify-center gap-1 text-approve">
                <FiThumbsUp />
                <span>{counts.approved ?? 0}</span>
              </div>
            </InfoTooltip>
            <InfoTooltip text="Rejected" className="w-full">
              <div className="flex items-center justify-center gap-1 text-reject">
                <FiThumbsDown />
                <span>{counts.rejected ?? 0}</span>
              </div>
            </InfoTooltip>
            <InfoTooltip text="Needs edits" className="w-full">
              <div className="flex items-center justify-center gap-1 text-edit">
                <FiEdit />
                <span>{counts.edit ?? 0}</span>
              </div>
            </InfoTooltip>
          </div>
        </div>
      </Link>
    </div>
  );
};

export default AdGroupCard;
