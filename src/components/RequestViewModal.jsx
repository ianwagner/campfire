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
  const formatDateValue = (value) => {
    if (!value) return '';
    try {
      if (typeof value.toDate === 'function') {
        return value.toDate().toLocaleDateString();
      }
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return date.toLocaleDateString();
    } catch (err) {
      return '';
    }
  };
  const contractTypeLabel =
    request.contractType === 'briefs'
      ? 'Briefs'
      : request.contractType === 'production'
        ? 'Production'
        : '';
  const contractStart = formatDateValue(request.contractStartDate);
  const contractEnd = formatDateValue(request.contractEndDate);
  const contractDateText =
    contractStart && contractEnd
      ? `${contractStart} – ${contractEnd}`
      : contractStart
        ? `Start: ${contractStart}`
        : contractEnd
          ? `End: ${contractEnd}`
          : '';
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
        {request.priority && request.type !== 'newBrand' && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0">Priority: {request.priority}</p>
        )}
        {request.designerId && role !== 'ops' && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0">Designer: {request.designerId}</p>
        )}
        {request.editorId && role !== 'ops' && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0">Editor: {request.editorId}</p>
        )}
        {request.type === 'newAds' && (
          productRequests.length ? (
            <div className="text-black dark:text-[var(--dark-text)] mb-0">
              <p className="font-bold text-black dark:text-[var(--dark-text)] mb-1">Products</p>
              <ul className="list-disc ml-4">
                {productRequests.map((item, idx) => {
                  const name = item.productName || item.name;
                  const qty = Number(item.quantity);
                  const displayQty = Number.isNaN(qty) || qty <= 0 ? null : qty;
                  return (
                    <li key={`${name || 'product'}-${idx}`}>
                      <span>
                        {name}
                        {displayQty ? ` (${displayQty})` : ''}
                        {item.isNew ? ' — new' : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1 mb-0">Total Ads: {totalAds}</p>
            </div>
          ) : (
            <p className="text-black dark:text-[var(--dark-text)] mb-0"># Ads: {totalAds}</p>
          )
        )}
        {request.type === 'newAIAssets' && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0"># Assets: {request.numAssets}</p>
        )}
        {request.toneOfVoice && request.type !== 'newBrand' && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0">Tone of Voice: {request.toneOfVoice}</p>
        )}
        {request.offering && request.type !== 'newBrand' && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0">Offering: {request.offering}</p>
        )}
        {request.brandAssetsLink && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0">
            Brand Assets:{' '}
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
        {(contractTypeLabel ||
          (typeof request.contractDeliverables === 'number' && request.contractDeliverables > 0) ||
          contractDateText ||
          request.contractLink) && (
          <div className="text-black dark:text-[var(--dark-text)] mb-0 space-y-1">
            {contractTypeLabel && <p className="mb-0">Contract Type: {contractTypeLabel}</p>}
            {typeof request.contractDeliverables === 'number' && request.contractDeliverables > 0 && (
              <p className="mb-0">Contract Deliverables: {request.contractDeliverables}</p>
            )}
            {contractDateText && <p className="mb-0">Contract Dates: {contractDateText}</p>}
            {request.contractLink && (
              <p className="mb-0">
                Contract Link:{' '}
                <a
                  href={request.contractLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-blue-600"
                >
                  {request.contractLink}
                </a>
              </p>
            )}
          </div>
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
