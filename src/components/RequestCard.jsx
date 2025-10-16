import React, { useState, useRef } from 'react';
import {
  FiEdit2,
  FiTrash,
  FiArchive,
  FiFilePlus,
  FiPackage,
  FiAlertOctagon,
  FiZap,
  FiImage,
  FiMoreHorizontal,
  FiCalendar,
  FiMessageSquare,
} from 'react-icons/fi';
import IconButton from './IconButton.jsx';
import formatDetails from "../utils/formatDetails";

const typeIcons = {
  newAds: FiFilePlus,
  newBrand: FiPackage,
  bug: FiAlertOctagon,
  feature: FiZap,
  newAIAssets: FiImage,
  helpdesk: FiMessageSquare,
};

const typeColors = {
  newAds: 'text-blue-500',
  newBrand: 'text-green-600',
  bug: 'text-red-500',
  feature: 'text-purple-500',
  newAIAssets: 'text-orange-500',
  helpdesk: 'text-cyan-600',
};

const typeLabels = {
  newAds: 'New Ads',
  newBrand: 'New Brand',
  bug: 'Bug',
  feature: 'Feature',
  newAIAssets: 'New AI Assets',
  helpdesk: 'Helpdesk',
};

const RequestCard = ({
  request,
  agencyName,
  onEdit,
  onDelete,
  onArchive,
  onCreateGroup,
  onDragStart,
  onView,
  onChat,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const [isDraggable, setIsDraggable] = useState(!isTouch);
  const longPressRef = useRef(null);
  const menuRef = useRef(null);
  const menuBtnRef = useRef(null);
  const Icon = typeIcons[request.type];
  const color = typeColors[request.type] || 'text-gray-600 dark:text-gray-300';
  const typeLabel = typeLabels[request.type];
  const productRequests = Array.isArray(request.productRequests)
    ? request.productRequests.filter((p) => p && (p.productName || p.name))
    : [];
  const fallbackAds = productRequests.reduce((sum, item) => {
    const qty = Number(item.quantity);
    if (Number.isNaN(qty) || qty <= 0) return sum;
    return sum + qty;
  }, 0);
  const normalizedNumAds = Number(request.numAds);
  const totalAds =
    Number.isNaN(normalizedNumAds) || normalizedNumAds <= 0
      ? fallbackAds || request.numAds || 0
      : normalizedNumAds;
  const displayAgency = agencyName || request.agencyName || request.agencyId;

  const handleClick = (e) => {
    if (
      menuRef.current?.contains(e.target) ||
      menuBtnRef.current?.contains(e.target) ||
      dragging
    ) {
      return;
    }
    if (onView) {
      onView(request);
      return;
    }
    setExpanded((exp) => !exp);
  };

  return (
    <div
      data-testid="request-card"
      className={`bg-white dark:bg-[var(--dark-sidebar-bg)] border border-gray-300 dark:border-gray-600 rounded-lg shadow-md p-3 space-y-1 w-[220px] sm:w-[300px] ${request.status === 'done' ? 'opacity-50' : ''}`}
      draggable={isDraggable}
      onDragStart={() => {
        setDragging(true);
        onDragStart(request.id);
      }}
      onDragEnd={() => {
        setDragging(false);
        if (isTouch) setIsDraggable(false);
      }}
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
      onClick={handleClick}
    >
      <div className="relative space-y-1">
        <div className="flex items-start justify-between">
          {(Icon || typeLabel) && (
            <div className="flex items-center gap-2">
              {Icon && (
                <div className={`text-lg ${color}`}>{React.createElement(Icon)}</div>
              )}
              {typeLabel && (
                <span className={`text-xs font-semibold ${color}`}>{typeLabel}</span>
              )}
            </div>
          )}
          <IconButton
            ref={menuBtnRef}
            onClick={() => setMenuOpen((o) => !o)}
            className="ml-auto bg-transparent hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)]"
            aria-label="Menu"
          >
            <FiMoreHorizontal />
          </IconButton>
          {menuOpen && (
            <div
              ref={menuRef}
              className="absolute right-0 top-6 z-10 bg-white dark:bg-[var(--dark-sidebar-bg)] border border-gray-300 dark:border-gray-600 rounded shadow text-sm"
            >
              {request.type === 'helpdesk' && onChat && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onChat(request);
                  }}
                  className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1"
                >
                  <FiMessageSquare /> Open chat
                </button>
              )}
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
        {displayAgency && (
          <p className="text-[12px] text-black dark:text-[var(--dark-text)] mb-0">
            Agency: {displayAgency}
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
      {expanded && request.details && (
        <div
          className="text-sm text-black dark:text-[var(--dark-text)]"
          dangerouslySetInnerHTML={{ __html: formatDetails(request.details) }}
        />
      )}
      {(expanded || request.status === 'ready' || request.status === 'done') && (
        <>
          <div className="text-sm">
            {expanded && request.type === 'newAds' && (
              productRequests.length ? (
                <div className="text-left text-black dark:text-[var(--dark-text)]">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Products</p>
                  <ul className="list-disc ml-4 space-y-1">
                    {productRequests.map((item, idx) => {
                      const name = item.productName || item.name;
                      const qty = Number(item.quantity);
                      const displayQty = Number.isNaN(qty) || qty <= 0 ? null : qty;
                      return (
                        <li key={`${name || 'product'}-${idx}`} className="text-xs">
                          {name}
                          {displayQty ? ` (${displayQty})` : ''}
                          {item.isNew ? ' — new' : ''}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Total Ads: {totalAds}</p>
                </div>
              ) : (
                <span># Ads: {totalAds}</span>
              )
            )}
            {expanded && request.type === 'newAIAssets' && <span># Assets: {request.numAssets}</span>}
            {expanded && request.type === 'newBrand' && (
              <div className="text-left text-black dark:text-[var(--dark-text)] text-xs space-y-1 mt-2">
                {request.brandAssetsLink && (
                  <p className="mb-0">
                    Assets:{' '}
                    <a
                      href={request.brandAssetsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-blue-600"
                    >
                      {request.brandAssetsLink}
                    </a>
                  </p>
                )}
                {request.contractType && (
                  <p className="mb-0">
                    Contract: {request.contractType === 'briefs' ? 'Briefs' : 'Production'}
                  </p>
                )}
                {typeof request.contractDeliverables === 'number' && request.contractDeliverables > 0 && (
                  <p className="mb-0">Deliverables: {request.contractDeliverables}</p>
                )}
              </div>
            )}
          </div>
          <div className="text-right">
            {request.type === 'newAds' || request.type === 'newBrand' ? (
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
            ) : null}
          </div>
        </>
      )}
      <p
        className="text-xs text-gray-500 text-right mt-1 cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          if (onView) {
            onView(request);
          } else {
            setExpanded((exp) => !exp);
          }
        }}
      >
        {expanded ? 'Show less' : 'Show more'}
      </p>
    </div>
  );
};

export default RequestCard;
