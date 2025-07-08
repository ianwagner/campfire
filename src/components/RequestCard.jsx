import React from 'react';
import {
  FiEdit2,
  FiTrash,
  FiArchive,
  FiVideo,
  FiPackage,
  FiBug,
  FiStar,
} from 'react-icons/fi';
import StatusBadge from './StatusBadge.jsx';

const typeIcons = {
  newAds: FiVideo,
  newBrand: FiPackage,
  bug: FiBug,
  feature: FiStar,
};

const RequestCard = ({ request, onEdit, onDelete, onArchive, onCreateGroup, onDragStart }) => {
  const Icon = typeIcons[request.type];
  return (
    <div
      className="bg-white dark:bg-[var(--dark-sidebar-bg)] border border-gray-300 dark:border-gray-600 rounded-lg shadow-md p-3 space-y-1 w-[220px] sm:w-[300px]"
      draggable
      onDragStart={() => onDragStart(request.id)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          {Icon && <Icon className="mt-0.5 flex-shrink-0" />}
          <div>
            {request.title && (
              <p className="font-bold text-[14px] text-black dark:text-[var(--dark-text)] mb-0">
                {request.title}
              </p>
            )}
            {request.brandCode && (
              <p className="font-bold text-[14px] text-black dark:text-[var(--dark-text)] mb-0">
                {request.brandCode}
              </p>
            )}
            {request.dueDate && (
              <p className="text-[12px] text-black dark:text-[var(--dark-text)] mb-0">
                {request.dueDate.toDate().toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
        <StatusBadge status={request.status} className="flex-shrink-0" />
      </div>
    {request.details && (
      <p className="text-sm text-black dark:text-[var(--dark-text)]">
        {request.details}
      </p>
    )}
    <div className="flex items-center justify-between text-sm">
      {request.type === 'newAds' && <span># Ads: {request.numAds}</span>}
      <div className="flex gap-2">
        <button onClick={() => onEdit(request)} className="btn-action" aria-label="Edit">
          <FiEdit2 />
        </button>
        <button onClick={() => onDelete(request.id)} className="btn-action btn-delete" aria-label="Delete">
          <FiTrash />
        </button>
        <button onClick={() => onArchive(request.id)} className="btn-action" aria-label="Archive">
          <FiArchive />
        </button>
      </div>
    </div>
    <div className="text-right">
      {request.type === 'bug' || request.type === 'feature' ? null : (
        request.status === 'done' ? (
          <span className="text-sm text-gray-500">
            {request.type === 'newBrand' ? 'Brand Created' : 'Ad Group Created'}
          </span>
        ) : (
          <button
            onClick={() => onCreateGroup(request)}
            className={`btn-primary mt-2 text-sm ${request.status !== 'ready' ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={request.status !== 'ready'}
          >
            {request.type === 'newBrand' ? 'Create Brand' : 'Create Ad Group'}
          </button>
        )
      )}
    </div>
  </div>
  );
};

export default RequestCard;
