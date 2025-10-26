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
  FiCheck,
  FiX,
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
  integration = null,
  integrationStatus = null,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const user = auth.currentUser;
  const { role } = useUserRole(user?.uid);
  const hideStaff = role === 'client';
  const menuItemClass =
    'block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] flex items-center gap-1 text-gray-800 dark:text-[var(--dark-text)]';
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

  const assignedIntegrationId =
    typeof group?.assignedIntegrationId === 'string'
      ? group.assignedIntegrationId
      : '';
  const hasIntegration = Boolean(assignedIntegrationId);
  const resolvedIntegration = integration || null;
  const integrationSummary = integrationStatus || group?.integrationStatusSummary || null;
  const integrationOutcome = integrationSummary?.outcome || null;
  const integrationLabel =
    (resolvedIntegration && (resolvedIntegration.name || resolvedIntegration.id)) ||
    (typeof group?.assignedIntegrationName === 'string'
      ? group.assignedIntegrationName
      : '') ||
    integrationSummary?.integrationName ||
    assignedIntegrationId ||
    '';
  const integrationLogoUrl =
    typeof resolvedIntegration?.logoUrl === 'string' ? resolvedIntegration.logoUrl : '';
  const integrationInitial = integrationLabel?.trim?.().charAt(0)?.toUpperCase() || 'I';
  const integrationTitle = integrationOutcome
    ? integrationOutcome === 'success'
      ? `${integrationLabel || 'Integration'} succeeded`
      : `${integrationLabel || 'Integration'} failed`
    : integrationLabel
    ? `${integrationLabel} integration assigned`
    : 'Integration assigned';

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
              <div className="mt-1 text-[12px] text-black dark:text-[var(--dark-text)] line-clamp-2">
                {group.brandName}
              </div>
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
                        className={menuItemClass}
                      >
                        <FiCheckCircle /> Review
                      </button>
                    )}
                    {onShare && (
                      <button
                        onClick={(e) => handleClick(e, onShare)}
                        className={menuItemClass}
                      >
                        <FiLink /> Share Link
                      </button>
                    )}
                    {onGallery && (
                      <button
                        onClick={(e) => handleClick(e, onGallery)}
                        className={menuItemClass}
                      >
                        <FiGrid /> See Gallery
                      </button>
                    )}
                    {onCopy && (
                      <button
                        onClick={(e) => handleClick(e, onCopy)}
                        className={menuItemClass}
                      >
                        <FiType /> Platform Copy
                      </button>
                    )}
                    {onDownload && (
                      <button
                        onClick={(e) => handleClick(e, onDownload)}
                        className={menuItemClass}
                      >
                        <FiDownload /> Download Approved
                      </button>
                    )}
                    {onChangeMonth && (
                      <button
                        onClick={(e) => handleClick(e, onChangeMonth)}
                        className={menuItemClass}
                      >
                        <FiClock /> Change Month
                      </button>
                    )}
                    {onChangeDueDate && (
                      <button
                        onClick={(e) => handleClick(e, onChangeDueDate)}
                        className={menuItemClass}
                      >
                        <FiCalendar /> Change Due Date
                      </button>
                    )}
                    {onChangeDesigner && (
                      <button
                        onClick={(e) => handleClick(e, onChangeDesigner)}
                        className={menuItemClass}
                      >
                        <FiUser /> Change Designer
                      </button>
                    )}
                    {onRename && (
                      <button
                        onClick={(e) => handleClick(e, onRename)}
                        className={menuItemClass}
                      >
                        <FiEdit2 /> Rename
                      </button>
                    )}
                    {onArchive && (
                      <button
                        onClick={(e) => handleClick(e, onArchive)}
                        className={menuItemClass}
                      >
                        <FiArchive /> Archive
                      </button>
                    )}
                    {onRestore && (
                      <button
                        onClick={(e) => handleClick(e, onRestore)}
                        className={menuItemClass}
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
            {(group.brandCode || group.month || hasIntegration) && (
              <div className="flex items-center gap-2 self-end">
                {hasIntegration && (
                  <span
                    className="tag-pill inline-flex items-center gap-1 border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-600"
                    title={integrationTitle}
                  >
                    <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-white">
                      {integrationLogoUrl ? (
                        <img
                          src={integrationLogoUrl}
                          alt={`${integrationLabel || 'Integration'} logo`}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span className="text-[10px] font-semibold uppercase text-gray-500">
                          {integrationInitial}
                        </span>
                      )}
                    </span>
                    {integrationOutcome && (
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-full ${
                          integrationOutcome === 'success'
                            ? 'bg-gray-200 text-gray-600'
                            : 'bg-rose-500 text-white'
                        }`}
                      >
                        {integrationOutcome === 'success' ? (
                          <FiCheck className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <FiX className="h-3 w-3" aria-hidden="true" />
                        )}
                        <span className="sr-only">
                          {integrationOutcome === 'success'
                            ? 'Integration succeeded'
                            : 'Integration failed'}
                        </span>
                      </span>
                    )}
                  </span>
                )}
                {group.brandCode && (
                  <span className="tag-pill inline-flex items-center justify-center px-2 py-0.5 text-xs uppercase tracking-wide bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-200 border border-gray-300 dark:border-gray-500">
                    {group.brandCode}
                  </span>
                )}
                <MonthTag month={group.month} className="inline-flex items-center justify-center" />
              </div>
            )}
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
