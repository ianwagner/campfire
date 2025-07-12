import React from 'react';
import { Link } from 'react-router-dom';
import {
  FiZap,
  FiGrid,
  FiCheckCircle,
  FiThumbsUp,
  FiThumbsDown,
  FiEdit,
  FiCalendar,
} from 'react-icons/fi';


const AdGroupCard = ({ group }) => (
  <Link
    to={`/ad-group/${group.id}`}
    className="block bg-white dark:bg-[var(--dark-sidebar-bg)] border border-gray-300 dark:border-gray-600 rounded-lg text-inherit shadow-md w-full"
  >
    <div className="flex items-start px-3 py-2">
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
      {group.dueDate && (
        <p className="text-[12px] text-black dark:text-[var(--dark-text)] flex items-center gap-1" data-testid="due-date">
          <FiCalendar className="text-gray-600 dark:text-gray-300" />
          {group.dueDate.toDate ? group.dueDate.toDate().toLocaleDateString() : new Date(group.dueDate).toLocaleDateString()}
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
);

export default AdGroupCard;
