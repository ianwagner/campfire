import React, { useState, useRef } from 'react';
import {
  FiEdit2,
  FiTrash,
  FiArchive,
  FiFilePlus,
  FiPackage,
  FiAlertOctagon,
  FiZap,
  FiMoreHorizontal,
  FiCalendar,
} from 'react-icons/fi';
import IconButton from './IconButton.jsx';

const typeIcons = {
  newAds: FiFilePlus,
  newBrand: FiPackage,
  bug: FiAlertOctagon,
  feature: FiZap,
};

const typeColors = {
  newAds: 'text-blue-500',
  newBrand: 'text-green-600',
  bug: 'text-red-500',
  feature: 'text-purple-500',
};

const RequestCard = ({ request, onEdit, onDelete, onArchive, onCreateGroup, onDragStart }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const [isDraggable, setIsDraggable] = useState(!isTouch);
  const longPressRef = useRef(null);
  const Icon = typeIcons[request.type];
  const color = typeColors[request.type] || 'text-gray-600 dark:text-gray-300';

  return (
    <div
      className="bg-white dark:bg-[var(--dark-sidebar-bg)] border border-gray-300 dark:border-gray-600 rounded-lg shadow-md p-3 space-y-1 w-[220px] sm:w-[300px]"
      draggable={isDraggable}
      onDragStart={() => onDragStart(request.id)}
      onDragEnd={() => isTouch && setIsDraggable(false)}
      onTouchStart={() => {
        if (isTouch) {
          longPressRef.current = setTimeout(() => setIsDraggable(true), 300);
        }
      }}
      onTouchEnd={() => {
        if (isTouch) {
          clearTimeout(longPressRef.current);
          setIsDraggable(false);
        }
      }}
      onTouchMove={() => {
        if (isTouch) {
          clearTimeout(longPressRef.current);
        }
      }}
    >
      <div className="relative space-y-1">
        <div className="flex items-start justify-between">
          {Icon && (
            <div className={`text-lg ${color}`}>{React.createElement(Icon)}</div>
          )}
          <IconButton
            onClick={() => setMenuOpen((o) => !o)}
            className="ml-auto"
            aria-label="Menu"
          >
            <FiMoreHorizontal />
          </IconButton>
          {menuOpen && (
            <div className="absolute right-0 top-6 z-10 bg-white dark:bg-[var(--dark-sidebar-bg)] border border-gray-300 dark:border-gray-600 rounded shadow text-sm">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onEdit(request);
                }}
                className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
              >
                <FiEdit2 /> Edit
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onArchive(request.id);
                }}
                className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
              >
                <FiArchive /> Archive
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(request.id);
                }}
                className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1 text-red-600"
              >
                <FiTrash /> Delete
              </button>
            </div>
          )}
        </div>
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
          <p className="text-[12px] text-black dark:text-[var(--dark-text)] mb-0 flex items-center gap-1">
            <FiCalendar className="text-gray-600 dark:text-gray-300" />
            {request.dueDate.toDate().toLocaleDateString()}
          </p>
        )}
        {request.priority && (
          <p className="text-[12px] text-black dark:text-[var(--dark-text)] mb-0">Priority: {request.priority}</p>
        )}
      </div>
      {request.details && (
        <p className="text-sm text-black dark:text-[var(--dark-text)]">
          {request.details}
        </p>
      )}
      <div className="flex items-center justify-between text-sm">
        {request.type === 'newAds' && <span># Ads: {request.numAds}</span>}
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
