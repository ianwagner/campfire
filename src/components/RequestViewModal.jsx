import React from 'react';
import {
  FiEdit2,
  FiFilePlus,
  FiPackage,
  FiAlertOctagon,
  FiZap,
  FiImage,
  FiCalendar,
} from 'react-icons/fi';
import Modal from './Modal.jsx';
import IconButton from './IconButton.jsx';
import formatDetails from '../utils/formatDetails';

const typeIcons = {
  newAds: FiFilePlus,
  newBrand: FiPackage,
  bug: FiAlertOctagon,
  feature: FiZap,
  newAIAssets: FiImage,
};

const typeColors = {
  newAds: 'text-blue-500',
  newBrand: 'text-green-600',
  bug: 'text-red-500',
  feature: 'text-purple-500',
  newAIAssets: 'text-orange-500',
};

const RequestViewModal = ({ request, onClose, onEdit }) => {
  if (!request) return null;
  const Icon = typeIcons[request.type];
  const color = typeColors[request.type] || 'text-gray-600 dark:text-gray-300';
  return (
    <Modal sizeClass="max-w-lg">
      <div className="space-y-2">
        <div className="flex items-start justify-between">
          <div className={`flex items-center gap-1 text-lg font-bold ${color}`}> 
            {Icon && React.createElement(Icon)}
            <span className="text-black dark:text-[var(--dark-text)]">{request.title || 'Ticket'}</span>
          </div>
          <IconButton onClick={() => onEdit(request)} aria-label="Edit">
            <FiEdit2 />
          </IconButton>
        </div>
        {request.brandCode && (
          <p className="font-bold text-black dark:text-[var(--dark-text)] mb-0">{request.brandCode}</p>
        )}
        {request.dueDate && (
          <p className="flex items-center gap-1 text-black dark:text-[var(--dark-text)] mb-0">
            <FiCalendar className="text-gray-600 dark:text-gray-300" />
            {request.dueDate.toDate().toLocaleDateString()}
          </p>
        )}
        {request.priority && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0">Priority: {request.priority}</p>
        )}
        {request.type === 'newAds' && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0"># Ads: {request.numAds}</p>
        )}
        {request.type === 'newAIAssets' && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0"># Assets: {request.numAssets}</p>
        )}
        {request.details && (
          <div
            className="text-sm text-black dark:text-[var(--dark-text)]"
            dangerouslySetInnerHTML={{ __html: formatDetails(request.details) }}
          />
        )}
        <div className="text-right">
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </Modal>
  );
};

export default RequestViewModal;
