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
import CloseButton from './CloseButton.jsx';
import NotificationDot from './NotificationDot.jsx';
import {
  toDateSafe,
  formatRelativeTime,
  defaultTicketTitle,
  formatDisplayName,
  helpdeskTicketHasUnread,
  markHelpdeskTicketAsRead,
  getHelpdeskLastSeen,
} from '../utils/helpdesk';

const HelpdeskModal = ({
  brandCode = '',
  groupId = '',
  reviewerName = '',
  user = null,
  tickets = [],
  onClose,
  onTicketViewed,
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
  const [readStateVersion, setReadStateVersion] = useState(0);

  const userId = user?.uid || 'anonymous';
  const authorName = formatDisplayName(
    reviewerName || user?.displayName || user?.email || 'Reviewer',
  );

  const baseButtonClass =
    'inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white font-semibold text-gray-700 shadow-sm transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-gray-200 dark:hover:bg-[var(--dark-sidebar-hover)]';
  const primaryButtonClass =
    'inline-flex items-center justify-center gap-2 rounded-md border border-[var(--accent-color)] bg-[var(--accent-color)] font-semibold text-white shadow-sm transition hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[var(--dark-sidebar-bg)]';

  const decoratedTickets = useMemo(
    () =>
      tickets.map((ticket) => ({
        ...ticket,
        hasUnreadMessages: helpdeskTicketHasUnread(ticket),
      })),
    [tickets, readStateVersion],
  );
  const buildButtonClass = ({
    primary = false,
    small = false,
    fullWidth = false,
    disabled: isDisabled = false,
  } = {}) => {
    const base = primary ? primaryButtonClass : baseButtonClass;
    const sizeClass = small ? 'px-3 py-1.5 text-xs' : 'px-3 py-2 text-sm';
    const widthClass = fullWidth ? 'w-full' : '';
    const disabledClass = isDisabled ? 'cursor-not-allowed opacity-60' : '';
    return [base, sizeClass, widthClass, disabledClass].filter(Boolean).join(' ');
  };

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const { body } = document;
    if (!body) return undefined;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (decoratedTickets.length === 0) {
      setCreatingNew(true);
      setActiveTicketId(null);
    } else if (!creatingNew) {
      if (!activeTicketId || !decoratedTickets.some((t) => t.id === activeTicketId)) {
        setActiveTicketId(decoratedTickets[0]?.id || null);
      }
    }
  }, [decoratedTickets, activeTicketId, creatingNew]);

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
    () => decoratedTickets.find((t) => t.id === activeTicketId) || null,
    [decoratedTickets, activeTicketId],
  );

  useEffect(() => {
    if (!activeTicket) return;
    const lastActivity = toDateSafe(
      activeTicket.lastMessageAt || activeTicket.updatedAt || activeTicket.createdAt,
    );
    const lastActivityTime = lastActivity ? lastActivity.getTime() : Date.now();
    const lastSeen = getHelpdeskLastSeen(activeTicket.id);
    if (lastSeen >= lastActivityTime) {
      return;
    }
    markHelpdeskTicketAsRead(activeTicket.id, lastActivityTime);
    setReadStateVersion((value) => value + 1);
    if (typeof onTicketViewed === 'function') {
      onTicketViewed(activeTicket.id);
    }
  }, [activeTicket, onTicketViewed]);

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
          participants: userId ? [userId] : [],
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
        markHelpdeskTicketAsRead(ticketDoc.id);
        setReadStateVersion((value) => value + 1);
        if (typeof onTicketViewed === 'function') {
          onTicketViewed(ticketDoc.id);
        }
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
        markHelpdeskTicketAsRead(activeTicketId);
        setReadStateVersion((value) => value + 1);
        if (typeof onTicketViewed === 'function') {
          onTicketViewed(activeTicketId);
        }
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
          <button
            type="button"
            className={buildButtonClass({ primary: true })}
            onClick={() => {
              setCreatingNew(true);
              setActiveTicketId(null);
              setMessage('');
            }}
          >
            Start a new chat
          </button>
        </div>
      );
    }
    const updatedTimestamp = formatRelativeTime(
      activeTicket.lastMessageAt || activeTicket.updatedAt,
    );

    return (
      <>
        <div className="border-b border-gray-200 px-4 py-3 dark:border-[var(--border-color-default)]">
          <h3 className="text-base font-semibold text-gray-900 dark:text-[var(--dark-text)]">
            {activeTicket.title || 'Helpdesk request'}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
            {activeTicket.assignee && (
              <span>Assigned to {formatDisplayName(activeTicket.assignee)}</span>
            )}
            {updatedTimestamp && <span>Updated {updatedTimestamp}</span>}
          </div>
        </div>
        <div
          ref={messageListRef}
          className="flex-1 min-h-0 overflow-y-auto bg-gray-50 px-4 py-3 dark:bg-[var(--dark-sidebar-hover)]"
        >
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-300">
              <p>No messages yet.</p>
            </div>
          ) : (
            <div className="flex min-h-full flex-col justify-end">
              <div className="flex flex-col gap-4">
                {messages.map((msg) => {
                  const createdAt = toDateSafe(msg.createdAt);
                  const isFromCurrentUser = msg.authorId === userId;
                  const displayName = isFromCurrentUser
                    ? 'You'
                    : formatDisplayName(msg.authorName) || 'Campfire team';
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isFromCurrentUser ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-full rounded-2xl px-4 py-3 shadow-sm sm:max-w-[75%] ${
                          isFromCurrentUser
                            ? 'bg-white text-gray-800 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]'
                            : 'bg-[var(--accent-color-10)] text-gray-800 dark:bg-[var(--accent-color-10)] dark:text-[var(--dark-text)]'
                        }`}
                      >
                        <div
                          className={`flex flex-wrap items-baseline gap-2 ${
                            isFromCurrentUser ? 'justify-end text-right' : 'justify-start text-left'
                          }`}
                        >
                          <span className="text-xs font-semibold text-gray-900 dark:text-[var(--dark-text)]">
                            {displayName}
                          </span>
                          {createdAt && (
                            <span className="text-[11px] text-gray-500 dark:text-gray-400">
                              {createdAt.toLocaleString()}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
                          {msg.body}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
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
            <button
              type="button"
              className={buildButtonClass()}
              onClick={() => {
                onClose();
              }}
            >
              Close
            </button>
            <button
              type="button"
              className={buildButtonClass({ primary: true, disabled: sending || !message.trim() })}
              onClick={handleSendMessage}
              disabled={sending || !message.trim()}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </>
    );
  };

  const renderNewTicket = () => (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-[var(--border-color-default)]">
        <h3 className="text-base font-semibold text-gray-900 dark:text-[var(--dark-text)]">
          Start a new chat
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Let us know how we can help. A member of the team will follow up in this thread.
        </p>
      </div>
      <div className="flex-1 bg-gray-50 px-4 py-3 dark:bg-[var(--dark-sidebar-hover)]">
        <div className="flex h-full flex-col gap-3">
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
      </div>
      <div className="border-t border-gray-200 px-4 py-3 dark:border-[var(--border-color-default)]">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className={buildButtonClass()}
            onClick={() => {
              if (decoratedTickets.length) {
                setCreatingNew(false);
                setMessage('');
                setActiveTicketId(decoratedTickets[0]?.id || null);
              } else {
                onClose();
              }
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className={buildButtonClass({
              primary: true,
              disabled: sending || !message.trim(),
            })}
            onClick={handleSendMessage}
            disabled={sending || !message.trim()}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="flex h-full w-full max-h-[750px] max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-[var(--border-color-default)]">
          <h2 className="text-lg font-semibold">Helpdesk</h2>
          <CloseButton onClick={onClose} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="w-full border-b border-gray-200 bg-gray-50 px-3 py-4 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] md:w-72 md:border-b-0 md:border-r">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-[var(--dark-text)]">Open tickets</h3>
              <button
                type="button"
                className={buildButtonClass({ small: true })}
                onClick={() => {
                  setCreatingNew(true);
                  setActiveTicketId(null);
                  setMessage('');
                  setError('');
                }}
              >
                New chat
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {decoratedTickets.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-300">
                  No open tickets yet.
                </p>
              ) : (
                decoratedTickets.map((ticket) => {
                  const isActive = ticket.id === activeTicketId && !creatingNew;
                  const lastAuthor = formatDisplayName(ticket.lastMessageAuthor);
                  const updatedLabel = formatRelativeTime(
                    ticket.lastMessageAt || ticket.updatedAt || ticket.createdAt,
                  );
                  const showUnreadDot = ticket.hasUnreadMessages && !isActive;
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
                      <div className="flex flex-col gap-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-gray-800 dark:text-[var(--dark-text)]">
                            {ticket.title || 'Helpdesk request'}
                          </span>
                          {showUnreadDot ? (
                            <NotificationDot
                              size="sm"
                              srText="Unread helpdesk messages"
                            />
                          ) : null}
                        </div>
                        {ticket.lastMessagePreview && (
                          <p className="line-clamp-2 text-xs text-gray-600 dark:text-gray-300">
                            {ticket.lastMessagePreview}
                          </p>
                        )}
                        {updatedLabel && (
                          <p className="text-xs text-gray-400 dark:text-gray-400">
                            {lastAuthor ? `${lastAuthor} • ` : ''}Updated {updatedLabel}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
          <div className="flex min-h-0 flex-1 flex-col">
            {creatingNew ? renderNewTicket() : renderMessageList()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpdeskModal;
