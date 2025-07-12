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
  FiEye,
  FiLink,
  FiEdit2,
  FiArchive,
  FiRotateCcw,
  FiTrash,
} from 'react-icons/fi';
import IconButton from './IconButton.jsx';


const AdGroupCard = ({
  group,
  onReview,
  onShare,
  onRename,
  onArchive,
  onRestore,
  onDelete,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleClick = (e, cb) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    cb && cb();
  };

  return (
    <div className="relative bg-white dark:bg-[var(--dark-sidebar-bg)] border border-gray-300 dark:border-gray-600 rounded-lg text-inherit shadow-md w-full">
      <div className="absolute top-1 right-1 flex flex-col items-end">
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
        {menuOpen && (
          <div className="absolute right-0 top-7 z-10 bg-white dark:bg-[var(--dark-sidebar-bg)] border border-gray-300 dark:border-gray-600 rounded shadow text-sm text-black dark:text-[var(--dark-text)]">
            <Link
              to={`/ad-group/${group.id}`}
              onClick={() => setMenuOpen(false)}
              className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
            >
            <FiEye /> View Details
          </Link>
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
      <Link to={`/ad-group/${group.id}`} className="block">
        <div className="px-3 py-2">
          <div className="flex items-start">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[14px] text-black dark:text-[var(--dark-text)] mb-0 line-clamp-2">
                {group.name}
              </p>
              <p className="text-[12px] text-black dark:text-[var(--dark-text)] mb-0">
                {group.brandCode}
              </p>
              {group.designerName && (
                <p className="text-[12px] text-black dark:text-[var(--dark-text)] mb-0">
                  {group.designerName}
                </p>
              )}
            </div>
          </div>
          {group.dueDate && (
            <p
              className="mt-1 text-[12px] text-black dark:text-[var(--dark-text)] flex items-center gap-1"
              data-testid="due-date"
            >
              <FiCalendar className="text-gray-600 dark:text-gray-300" />
              {group.dueDate.toDate
                ? group.dueDate.toDate().toLocaleDateString()
                : new Date(group.dueDate).toLocaleDateString()}
            </p>
          )}
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
