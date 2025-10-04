import React, { useEffect, useRef, useState } from 'react';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  increment,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import Button from './Button.jsx';
import CloseButton from './CloseButton.jsx';
import StatusBadge from './StatusBadge.jsx';
import { formatRelativeTime, getFirstName, toDateSafe } from '../utils/helpdesk';

const HelpdeskThreadModal = ({ request, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messageListRef = useRef(null);

  const requestId = request?.id;
  const user = auth.currentUser;
  const userId = user?.uid || 'anonymous';
  const authorName = user?.displayName || user?.email || 'Team member';

  useEffect(() => {
    if (!requestId) {
      setMessages([]);
      return () => {};
    }

    const messagesRef = collection(db, 'requests', requestId, 'messages');
    const messagesQuery = query(messagesRef, orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
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
  }, [requestId]);

  if (!request) return null;

  const handleSendMessage = async () => {
    const trimmed = message.trim();
    if (!trimmed || sending || !requestId) return;
    setSending(true);
    setError('');
    try {
      await addDoc(collection(db, 'requests', requestId, 'messages'), {
        body: trimmed,
        authorId: userId,
        authorName,
        createdAt: serverTimestamp(),
        source: 'requests',
      });
      await updateDoc(doc(db, 'requests', requestId), {
        lastMessageAt: serverTimestamp(),
        lastMessagePreview: trimmed.slice(0, 200),
        lastMessageAuthor: authorName,
        updatedAt: serverTimestamp(),
        messagesCount: increment(1),
        participants: arrayUnion(userId),
      });
      setMessage('');
    } catch (err) {
      console.error('Failed to send helpdesk message', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const lastUpdatedLabel = formatRelativeTime(
    request.lastMessageAt || request.updatedAt || request.createdAt,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-[var(--border-color-default)]">
          <div>
            <h2 className="text-lg font-semibold">Helpdesk ticket</h2>
            {request.brandCode && (
              <p className="text-xs text-gray-500 dark:text-gray-300">Brand: {request.brandCode}</p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-300">Request ID: {request.id}</p>
          </div>
          <CloseButton onClick={onClose} />
        </div>
        <div className="border-b border-gray-200 px-4 py-3 text-sm text-gray-700 dark:border-[var(--border-color-default)] dark:text-[var(--dark-text)]">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-gray-900 dark:text-[var(--dark-text)]">
              {request.title || 'Helpdesk request'}
            </h3>
            <StatusBadge status={request.status || 'new'} />
            {request.priority && <span>Priority: {request.priority}</span>}
            {request.assignee && <span>Assigned to {request.assignee}</span>}
          </div>
          {lastUpdatedLabel && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Updated {lastUpdatedLabel}
            </p>
          )}
          {request.details && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">
              {request.details}
            </p>
          )}
        </div>
        <div
          ref={messageListRef}
          className="flex-1 space-y-3 overflow-y-auto bg-gray-50 px-4 py-3 dark:bg-[var(--dark-sidebar-hover)]"
        >
          {messages.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-300">No messages yet.</p>
          ) : (
            messages.map((msg) => {
              const createdAt = toDateSafe(msg.createdAt);
              const isFromClient = msg.authorId === request?.createdBy;
              const displayName = getFirstName(msg.authorName, isFromClient ? 'You' : 'Reviewer');
              return (
                <div
                  key={msg.id}
                  className={`flex ${isFromClient ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`flex max-w-[85%] flex-col gap-2 ${
                      isFromClient ? 'items-end text-right' : 'items-start text-left'
                    }`}
                  >
                    <div
                      className={`flex items-center gap-2 ${
                        isFromClient ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {!isFromClient && (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/10 dark:bg-[var(--dark-sidebar-bg)] dark:ring-black/40">
                          <img
                            src="/icons/icon-192x192.png"
                            alt="Campfire logo"
                            className="h-6 w-6"
                          />
                        </span>
                      )}
                      <span className="text-sm font-semibold text-gray-900 dark:text-[var(--dark-text)]">
                        {displayName}
                      </span>
                    </div>
                    <div className="w-full rounded-2xl bg-[var(--accent-color-10)] p-3 shadow-sm">
                      <p className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">
                        {msg.body}
                      </p>
                    </div>
                    {createdAt && (
                      <span
                        className={`text-xs text-gray-600 dark:text-gray-400 ${
                          isFromClient ? 'self-end' : 'self-start'
                        }`}
                      >
                        {createdAt.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="border-t border-gray-200 px-4 py-3 dark:border-[var(--border-color-default)]">
          <label htmlFor="requestHelpdeskMessage" className="sr-only">
            Message
          </label>
          <textarea
            id="requestHelpdeskMessage"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Type your message..."
            className="w-full resize-none rounded-lg border border-gray-300 p-3 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={handleSendMessage}
              disabled={sending || !message.trim()}
            >
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpdeskThreadModal;
