import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiZap,
  FiGrid,
  FiCheckCircle,
  FiThumbsUp,
  FiThumbsDown,
  FiEdit,
  FiLink,
  FiEye,
  FiCheckCircle as FiReview,
  FiTrash,
  FiArchive,
  FiRotateCcw,
  FiMoreHorizontal,
  FiCalendar,
} from 'react-icons/fi';
import IconButton from './IconButton.jsx';

const AdGroupCard = ({
  group,
  onShare,
  onArchive,
  onRestore,
  onDelete,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleClick = (e) => {
    e.preventDefault();
    setMenuOpen((o) => !o);
  };

  const handle = (fn) => (e) => {
    e.preventDefault();
    if (fn) fn();
    setMenuOpen(false);
  };

  return (
    <div className="relative">
      <Link
        to={`/ad-group/${group.id}`}
        className="block bg-white dark:bg-[var(--dark-sidebar-bg)] border border-gray-300 dark:border-gray-600 rounded-lg text-inherit shadow-md w-full"
      >
        <div className="flex items-start px-3 py-2 relative">
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
          <div className="text-right">
            <IconButton
              onClick={handleClick}
              className="bg-transparent hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)]"
              aria-label="Menu"
            >
              <FiMoreHorizontal />
            </IconButton>
            {group.dueDate && (
              <p
                className="text-[12px] text-black dark:text-[var(--dark-text)] flex items-center gap-1 mt-1" data-testid="due-date"
              >
                <FiCalendar className="text-gray-600 dark:text-gray-300" />
                {group.dueDate.toDate ? group.dueDate.toDate().toLocaleDateString() : new Date(group.dueDate).toLocaleDateString()}
              </p>
            )}
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
      {menuOpen && (
        <div className="absolute right-2 top-8 z-10 bg-white dark:bg-[var(--dark-sidebar-bg)] border border-gray-300 dark:border-gray-600 rounded shadow text-sm">
          <Link
            to={`/ad-group/${group.id}`}
            onClick={() => setMenuOpen(false)}
            className="block px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
          >
            <FiEye /> Details
          </Link>
          <Link
            to={`/review/${group.id}`}
            onClick={() => setMenuOpen(false)}
            className="block px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
          >
            <FiReview /> Review
          </Link>
          {onShare && (
            <button
              onClick={handle(onShare)}
              className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
            >
              <FiLink /> Share
            </button>
          )}
          {onArchive && group.status !== 'archived' && (
            <button
              onClick={handle(onArchive)}
              className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
            >
              <FiArchive /> Archive
            </button>
          )}
          {onRestore && group.status === 'archived' && (
            <button
              onClick={handle(onRestore)}
              className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
            >
              <FiRotateCcw /> Restore
            </button>
          )}
          {onDelete && (
            <button
              onClick={handle(onDelete)}
              className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1 text-red-600"
            >
              <FiTrash /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default AdGroupCard;
