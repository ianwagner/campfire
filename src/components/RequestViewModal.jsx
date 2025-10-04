import React, { useEffect, useRef, useState } from 'react';
import {
  FiEdit2,
  FiFilePlus,
  FiPackage,
  FiAlertOctagon,
  FiZap,
  FiImage,
  FiCalendar,
  FiMessageSquare,
} from 'react-icons/fi';
import ScrollModal from './ScrollModal.jsx';
import IconButton from './IconButton.jsx';
import CloseButton from './CloseButton.jsx';
import Button from './Button.jsx';
import formatDetails from '../utils/formatDetails';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import useUserRole from '../useUserRole';
import { formatRelativeTime, toDateSafe } from '../utils/helpdeskUtils.js';

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
  const isHelpdesk = request.type === 'helpdesk';
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const messageListRef = useRef(null);
  const authorId = user?.uid || 'anonymous';
  const authorName =
    user?.displayName ||
    user?.email ||
    (role ? `${role.charAt(0).toUpperCase()}${role.slice(1)}` : 'Reviewer');

  useEffect(() => {
    if (!isHelpdesk || !request.id) {
      setMessages([]);
      return () => {};
    }
    const messagesRef = collection(db, 'requests', request.id, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setMessages(list);
        setTimeout(() => {
          if (messageListRef.current) {
            messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
          }
        }, 0);
      },
      (err) => {
        console.error('Failed to load helpdesk messages', err);
        setMessages([]);
      },
    );
    return () => unsubscribe();
  }, [isHelpdesk, request?.id]);

  useEffect(() => {
    if (!isHelpdesk || messages.length === 0) return;
    if (!messageListRef.current) return;
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [isHelpdesk, messages]);

  const handleSendMessage = async () => {
    if (!isHelpdesk || !request.id) return;
    const trimmed = newMessage.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError('');
    try {
      await addDoc(collection(db, 'requests', request.id, 'messages'), {
        body: trimmed,
        authorId,
        authorName,
        createdAt: serverTimestamp(),
        source: 'requests',
      });
      await updateDoc(doc(db, 'requests', request.id), {
        lastMessageAt: serverTimestamp(),
        lastMessagePreview: trimmed.slice(0, 200),
        lastMessageAuthor: authorName,
        updatedAt: serverTimestamp(),
        messagesCount: increment(1),
        participants: arrayUnion(authorId),
      });
      setNewMessage('');
    } catch (err) {
      console.error('Failed to send helpdesk message', err);
      setSendError('Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

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
        {request.assignee && (
          <p className="text-black dark:text-[var(--dark-text)] mb-0">Assignee: {request.assignee}</p>
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
        {isHelpdesk && (
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 shadow-sm dark:border-[var(--border-color-default)]">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-[var(--dark-text)]">Chat</h3>
              {request.updatedAt && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Updated {formatRelativeTime(request.lastMessageAt || request.updatedAt)}
                </p>
              )}
            </div>
            <div
              ref={messageListRef}
              className="max-h-80 space-y-3 overflow-y-auto bg-white px-4 py-3 dark:bg-[var(--dark-sidebar-bg)]"
            >
              {messages.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-300">No messages yet.</p>
              ) : (
                messages.map((msg) => {
                  const createdAt = toDateSafe(msg.createdAt);
                  return (
                    <div
                      key={msg.id}
                      className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-gray-900 dark:text-[var(--dark-text)]">
                          {msg.authorName || 'Reviewer'}
                        </span>
                        {createdAt && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {createdAt.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">{msg.body}</p>
                    </div>
                  );
                })
              )}
            </div>
            <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]">
              <label htmlFor="helpdeskReply" className="sr-only">
                Add a message
              </label>
              <textarea
                id="helpdeskReply"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                rows={3}
                placeholder="Type your reply..."
                className="w-full resize-none rounded-lg border border-gray-300 p-3 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
              />
              {sendError && <p className="mt-2 text-sm text-red-600">{sendError}</p>}
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="secondary" onClick={onClose}>
                  Close
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSendMessage}
                  disabled={sending || !newMessage.trim()}
                >
                  {sending ? 'Sending…' : 'Send'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ScrollModal>
  );
};

export default RequestViewModal;
