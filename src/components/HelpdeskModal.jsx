import React, { useEffect, useMemo, useState, useRef } from 'react';
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
import { db } from '../firebase/config';
import Button from './Button.jsx';
import CloseButton from './CloseButton.jsx';
import StatusBadge from './StatusBadge.jsx';
import {
  toDateSafe,
  formatRelativeTime,
  defaultTicketTitle,
  getFirstName,
} from '../utils/helpdesk';

const HelpdeskModal = ({
  brandCode = '',
  groupId = '',
  reviewerName = '',
  user = null,
  tickets = [],
  onClose,
}) => {
  const [activeTicketId, setActiveTicketId] = useState(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const unsubscribeRef = useRef(null);
  const messageListRef = useRef(null);
  const textAreaRef = useRef(null);

  const userId = user?.uid || 'anonymous';
  const authorName = reviewerName || user?.displayName || user?.email || 'Reviewer';

  useEffect(() => {
    if (tickets.length === 0) {
      setCreatingNew(true);
      setActiveTicketId(null);
    } else if (!creatingNew) {
      if (!activeTicketId || !tickets.some((t) => t.id === activeTicketId)) {
        setActiveTicketId(tickets[0]?.id || null);
      }
    }
  }, [tickets, activeTicketId, creatingNew]);

  useEffect(() => {
    if (!activeTicketId) {
      setMessages([]);
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      return () => {};
    }
    const messagesRef = collection(db, 'requests', activeTicketId, 'messages');
    const messagesQuery = query(messagesRef, orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(
      messagesQuery,
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
    unsubscribeRef.current = unsubscribe;
    return () => {
      unsubscribe();
      unsubscribeRef.current = null;
    };
  }, [activeTicketId]);

  useEffect(() => {
    if (creatingNew && textAreaRef.current) {
      textAreaRef.current.focus();
    }
  }, [creatingNew]);

  const activeTicket = useMemo(
    () => tickets.find((t) => t.id === activeTicketId) || null,
    [tickets, activeTicketId],
  );

  const handleSendMessage = async () => {
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError('');
    try {
      if (creatingNew) {
        const createdAt = serverTimestamp();
        const ticketDoc = await addDoc(collection(db, 'requests'), {
          type: 'helpdesk',
          status: 'new',
          priority: 'normal',
          createdAt,
          updatedAt: createdAt,
          createdBy: userId,
          brandCode: brandCode || null,
          title: defaultTicketTitle(trimmed),
          details: trimmed,
          metadata: {
            source: 'review',
            groupId: groupId || null,
            reviewerName: authorName,
          },
          assignee: null,
          messagesCount: 0,
        });
        await addDoc(collection(db, 'requests', ticketDoc.id, 'messages'), {
          body: trimmed,
          authorId: userId,
          authorName,
          createdAt: serverTimestamp(),
          source: 'review',
        });
        await updateDoc(doc(db, 'requests', ticketDoc.id), {
          lastMessageAt: serverTimestamp(),
          lastMessagePreview: trimmed.slice(0, 200),
          lastMessageAuthor: authorName,
          updatedAt: serverTimestamp(),
          messagesCount: increment(1),
          participants: arrayUnion(userId),
        });
        setMessage('');
        setCreatingNew(false);
        setActiveTicketId(ticketDoc.id);
      } else if (activeTicketId) {
        await addDoc(collection(db, 'requests', activeTicketId, 'messages'), {
          body: trimmed,
          authorId: userId,
          authorName,
          createdAt: serverTimestamp(),
          source: 'review',
        });
        await updateDoc(doc(db, 'requests', activeTicketId), {
          lastMessageAt: serverTimestamp(),
          lastMessagePreview: trimmed.slice(0, 200),
          lastMessageAuthor: authorName,
          updatedAt: serverTimestamp(),
          messagesCount: increment(1),
          participants: arrayUnion(userId),
        });
        setMessage('');
      }
    } catch (err) {
      console.error('Failed to send helpdesk message', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const renderMessageList = () => {
    if (!activeTicket) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-gray-500 dark:text-gray-300">
          <p>No open ticket selected.</p>
          <Button
            variant="primary"
            onClick={() => {
              setCreatingNew(true);
              setActiveTicketId(null);
              setMessage('');
            }}
          >
            Start a new chat
          </Button>
        </div>
      );
    }
    return (
      <>
        <div className="border-b border-gray-200 px-4 py-3 dark:border-[var(--border-color-default)]">
          <h3 className="text-base font-semibold text-gray-900 dark:text-[var(--dark-text)]">
            {activeTicket.title || 'Helpdesk request'}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <StatusBadge status={activeTicket.status || 'new'} />
            <span>Priority: {activeTicket.priority || 'normal'}</span>
            {activeTicket.assignee && <span>Assigned to {activeTicket.assignee}</span>}
            {activeTicket.lastMessageAt && (
              <span>Updated {formatRelativeTime(activeTicket.lastMessageAt || activeTicket.updatedAt)}</span>
            )}
          </div>
        </div>
        <div
          ref={messageListRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-4 bg-gray-50 dark:bg-[var(--dark-sidebar-hover)]"
        >
          {messages.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-300">No messages yet.</p>
          ) : (
            messages.map((msg) => {
              const createdAt = toDateSafe(msg.createdAt);
              const isFromClient = msg.authorId === userId;
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
          <label htmlFor="helpdeskMessage" className="sr-only">
            Your message
          </label>
          <textarea
            id="helpdeskMessage"
            ref={textAreaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Type your message..."
            className="w-full resize-none rounded-lg border border-gray-300 p-3 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                onClose();
              }}
            >
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
      </>
    );
  };

  const renderNewTicket = () => (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-[var(--border-color-default)]">
        <h3 className="text-base font-semibold text-gray-900 dark:text-[var(--dark-text)]">
          Start a new chat
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Let us know how we can help. A member of the team will follow up in this thread.
        </p>
      </div>
      <div className="flex-1 space-y-3 bg-gray-50 px-4 py-3 dark:bg-[var(--dark-sidebar-hover)]">
        <label htmlFor="newHelpdeskMessage" className="sr-only">
          Describe your issue
        </label>
        <textarea
          id="newHelpdeskMessage"
          ref={textAreaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          placeholder="Describe what you need help with..."
          className="h-full w-full resize-none rounded-lg border border-gray-300 p-3 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      <div className="border-t border-gray-200 px-4 py-3 dark:border-[var(--border-color-default)]">
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              if (tickets.length) {
                setCreatingNew(false);
                setMessage('');
                setActiveTicketId(tickets[0]?.id || null);
              } else {
                onClose();
              }
            }}
          >
            Cancel
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
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-[var(--border-color-default)]">
          <div>
            <h2 className="text-lg font-semibold">Helpdesk</h2>
            {brandCode && (
              <p className="text-xs text-gray-500 dark:text-gray-300">Brand: {brandCode}</p>
            )}
          </div>
          <CloseButton onClick={onClose} />
        </div>
        <div className="flex flex-1 flex-col md:flex-row">
          <aside className="w-full border-b border-gray-200 bg-gray-50 px-3 py-4 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] md:w-72 md:border-b-0 md:border-r">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-[var(--dark-text)]">Open tickets</h3>
              <Button
                variant="secondary"
                className="px-3 py-1 text-xs"
                onClick={() => {
                  setCreatingNew(true);
                  setActiveTicketId(null);
                  setMessage('');
                  setError('');
                }}
              >
                New chat
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {tickets.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-300">
                  No open tickets yet.
                </p>
              ) : (
                tickets.map((ticket) => {
                  const isActive = ticket.id === activeTicketId && !creatingNew;
                  return (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => {
                        setCreatingNew(false);
                        setActiveTicketId(ticket.id);
                        setError('');
                        setMessage('');
                      }}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm shadow-sm transition ${
                        isActive
                          ? 'border-[var(--accent-color)] bg-white dark:bg-[var(--dark-sidebar-bg)]'
                          : 'border-transparent bg-white/80 hover:bg-white dark:bg-[var(--dark-sidebar-bg)] dark:hover:bg-[var(--dark-sidebar-bg)]/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-gray-800 dark:text-[var(--dark-text)]">
                          {ticket.title || 'Helpdesk request'}
                        </span>
                        <StatusBadge status={ticket.status || 'new'} />
                      </div>
                      {ticket.lastMessagePreview && (
                        <p className="mt-1 line-clamp-2 text-xs text-gray-600 dark:text-gray-300">
                          {ticket.lastMessagePreview}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-400">
                        Updated {formatRelativeTime(ticket.lastMessageAt || ticket.updatedAt || ticket.createdAt)}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
          <div className="flex flex-1 flex-col">
            {creatingNew ? renderNewTicket() : renderMessageList()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpdeskModal;
