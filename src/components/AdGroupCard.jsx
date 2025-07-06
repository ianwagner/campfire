import React from 'react';
import { Link } from 'react-router-dom';
import {
  FiZap,
  FiGrid,
  FiCheckCircle,
  FiThumbsUp,
  FiThumbsDown,
  FiEdit,
} from 'react-icons/fi';
import StatusBadge from './StatusBadge.jsx';

const AdGroupCard = ({ group }) => (
  <Link
    to={`/ad-group/${group.id}`}
    className="block border-2 border-gray-300 dark:border-gray-600 rounded-lg text-inherit shadow"
  >
    <div className="flex items-start px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[14px] text-black dark:text-[var(--dark-text)] mb-0 line-clamp-2">
          {group.name}
        </p>
        <p className="text-[12px] text-black dark:text-[var(--dark-text)] mb-0">
          {group.brandCode}
        </p>
      </div>
      <StatusBadge status={group.status} className="flex-shrink-0" />
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
