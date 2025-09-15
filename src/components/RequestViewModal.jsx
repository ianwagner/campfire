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
import ScrollModal from './ScrollModal.jsx';
import IconButton from './IconButton.jsx';
import CloseButton from './CloseButton.jsx';
import formatDetails from '../utils/formatDetails';
import { auth } from '../firebase/config';
import useUserRole from '../useUserRole';

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

const typeLabels = {
  newAds: 'New Ads',
  newBrand: 'New Brand',
  bug: 'Bug',
  feature: 'Feature',
  newAIAssets: 'New AI Assets',
};

const RequestViewModal = ({ request, onClose, onEdit }) => {
  if (!request) return null;
  const user = auth.currentUser;
  const { role } = useUserRole(user?.uid);
  const Icon = typeIcons[request.type];
  const color = typeColors[request.type] || 'text-gray-600 dark:text-gray-300';
  const title = request.title || typeLabels[request.type];
  return (
    <ScrollModal
      sizeClass="max-w-none"
      style={{ minWidth: '700px' }}
      header={
        <div className="flex items-start justify-between p-2">
          <div className={`flex items-center gap-1 text-lg font-bold ${color}`}>
            {Icon && React.createElement(Icon)}
            <span className="text-black dark:text-[var(--dark-text)]">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            <IconButton onClick={() => onEdit(request)} aria-label="Edit">
              <FiEdit2 />
            </IconButton>
            <CloseButton onClick={onClose} />
          </div>
        </div>
      }
    >
      <div className="space-y-2 p-2">
        {request.brandCode && (
          <p className="font-bold text-black dark:text-[var(--dark-text)] mb-0">Brand: {request.brandCode}</p>
        )}
        {request.name && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0">Brand Name: {request.name}</p>
        )}
        {request.agencyId && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0">Agency: {request.agencyId}</p>
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
        {request.designerId && role !== 'ops' && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0">Designer: {request.designerId}</p>
        )}
        {request.editorId && role !== 'ops' && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0">Editor: {request.editorId}</p>
        )}
        {request.type === 'newAds' && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0"># Ads: {request.numAds}</p>
        )}
        {request.type === 'newAds' && request.products && request.products.length > 0 && (
          <div className="text-black dark:text-[var(--dark-text)] mb-0">
            Products:
            <ul className="list-disc ml-4">
              {request.products.map((p, i) => (
                <li key={i}>{p.product}: {p.quantity}</li>
              ))}
            </ul>
          </div>
        )}
        {request.type === 'newAIAssets' && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0"># Assets: {request.numAssets}</p>
        )}
        {request.toneOfVoice && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0">Tone of Voice: {request.toneOfVoice}</p>
        )}
        {request.offering && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0">Offering: {request.offering}</p>
        )}
        {request.inspiration && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0">Inspiration: {request.inspiration}</p>
        )}
        {request.uploadLink && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0">
            Upload Link:{' '}
            <a href={request.uploadLink} target="_blank" rel="noopener noreferrer" className="break-all text-blue-600">
              {request.uploadLink}
            </a>
          </p>
        )}
        {request.assetLinks && request.assetLinks.length > 0 && (
          <div className="text-black dark:text-[var(--dark-text)] mb-0">
            Asset Links:
            <ul className="list-disc ml-4">
              {request.assetLinks.map((l, i) => (
                <li key={i}>
                  <a href={l} target="_blank" rel="noopener noreferrer" className="break-all text-blue-600">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {request.status && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0">Status: {request.status}</p>
        )}
        {request.status === 'need info' && request.infoNote && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0">Info Needed: {request.infoNote}</p>
        )}
        {request.details && (
          <div
            className="text-sm text-black dark:text-[var(--dark-text)]"
            dangerouslySetInnerHTML={{ __html: formatDetails(request.details) }}
          />
        )}
      </div>
    </ScrollModal>
  );
};

export default RequestViewModal;
