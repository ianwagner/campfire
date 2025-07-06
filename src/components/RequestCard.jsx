import React from 'react';
import { FiEdit2, FiTrash } from 'react-icons/fi';
import StatusBadge from './StatusBadge.jsx';

const RequestCard = ({ request, onEdit, onDelete, onCreateGroup, onDragStart }) => (
  <div
    className="border-2 border-gray-300 dark:border-gray-600 rounded-lg shadow p-3 space-y-1"
    draggable
    onDragStart={() => onDragStart(request.id)}
  >
    <div className="flex items-start justify-between">
      <div>
        {request.title && (
          <p className="font-bold text-[14px] text-black dark:text-[var(--dark-text)] mb-0">
            {request.title}
          </p>
        )}
        <p className="font-bold text-[14px] text-black dark:text-[var(--dark-text)] mb-0">
          {request.brandCode}
        </p>
        <p className="text-[12px] text-black dark:text-[var(--dark-text)] mb-0">
          {request.dueDate ? request.dueDate.toDate().toLocaleDateString() : ''}
        </p>
      </div>
      <StatusBadge status={request.status} className="flex-shrink-0" />
    </div>
    {request.details && (
      <p className="text-sm text-black dark:text-[var(--dark-text)]">
        {request.details}
      </p>
    )}
    <div className="flex items-center justify-between text-sm">
      <span># Ads: {request.numAds}</span>
      <div className="flex gap-2">
        <button onClick={() => onEdit(request)} className="btn-action" aria-label="Edit">
          <FiEdit2 />
        </button>
        <button onClick={() => onDelete(request.id)} className="btn-action btn-delete" aria-label="Delete">
          <FiTrash />
        </button>
      </div>
    </div>
    <div className="text-right">
      <button onClick={() => onCreateGroup(request)} className="btn-primary mt-2 text-sm">
        Create Ad Group
      </button>
    </div>
  </div>
);

export default RequestCard;
