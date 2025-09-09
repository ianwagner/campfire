import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiZap,
  FiGrid,
  FiCheckCircle,
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
} from 'react-icons/fi';
import { auth } from '../firebase/config';
import useUserRole from '../useUserRole';
import IconButton from './IconButton.jsx';
import MonthTag from './MonthTag.jsx';


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
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const user = auth.currentUser;
  const { role } = useUserRole(user?.uid);
  const dueField =
    role === 'designer'
      ? group.designDueDate
      : role === 'editor'
      ? group.editorDueDate
      : role === 'project-manager' || role === 'admin'
      ? group.dueDate
      : null;

  const handleClick = (e, cb) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    cb && cb();
  };

  return (
    <div className="relative bg-white dark:bg-[var(--dark-sidebar-bg)] border border-gray-300 dark:border-gray-600 rounded-lg text-inherit shadow-md w-full">
      {!triggerClickMenu && (
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
      {menuOpen && (
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
        onClick={triggerClickMenu ? (e) => { e.preventDefault(); setMenuOpen((o) => !o); } : undefined}
        className="block"
      >
        <div className="flex items-start px-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[14px] text-black dark:text-[var(--dark-text)] mb-0 line-clamp-2">
              {group.name}
            </p>
            <p className="text-[12px] text-black dark:text-[var(--dark-text)] mb-0">
              {group.brandCode}
            </p>
            {group.designerName && role !== 'ops' && (
              <p className="text-[12px] text-black dark:text-[var(--dark-text)] mb-0">
                {group.designerName}
              </p>
            )}
            {group.editorName && role !== 'ops' && (
              <p className="text-[12px] text-black dark:text-[var(--dark-text)] mb-0">
                {group.editorName}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            {dueField && (
              <p
                className="text-[12px] text-black dark:text-[var(--dark-text)] flex items-center gap-1"
                data-testid="due-date"
              >
                <FiCalendar className="text-gray-600 dark:text-gray-300" />
                {dueField.toDate
                  ? dueField.toDate().toLocaleDateString()
                  : new Date(dueField).toLocaleDateString()}
              </p>
            )}
            <MonthTag month={group.month} />
          </div>
        </div>
        <div className="border-t border-gray-300 dark:border-gray-600 px-3 py-2">
          <div className="grid grid-cols-6 text-center text-sm">
            <div className="flex items-center justify-center gap-1 text-gray-600">
              <FiZap />
              <span>{group.recipeCount}</span>
            </div>
            <div className="flex items-center justify-center gap-1 text-gray-600">
              <FiGrid />
              <span>{group.assetCount}</span>
            </div>
            <div className="flex items-center justify-center gap-1 text-accent">
              <FiCheckCircle />
              <span>{group.readyCount}</span>
            </div>
            <div className="flex items-center justify-center gap-1 text-approve">
              <FiThumbsUp />
              <span>{group.counts.approved}</span>
            </div>
            <div className="flex items-center justify-center gap-1 text-reject">
              <FiThumbsDown />
              <span>{group.counts.rejected}</span>
            </div>
            <div className="flex items-center justify-center gap-1 text-edit">
              <FiEdit />
              <span>{group.counts.edit}</span>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
};

export default AdGroupCard;
