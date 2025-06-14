import React, { useEffect, useState } from 'react';
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { db } from './firebase/config';

const FIELD_VALUES = {
  status: ['pending', 'ready', 'approved', 'rejected', 'archived'],
  role: ['client', 'designer', 'admin'],
};

const USER_TYPES = ['client', 'designer', 'admin'];

const AdminNotifications = () => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('');
  const [triggerTime, setTriggerTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [rules, setRules] = useState([]);

  const [trigger, setTrigger] = useState('');
  const [conditions, setConditions] = useState([
    { field: '', op: '==', value: '' },
  ]);
  const [recipientType, setRecipientType] = useState('userType');
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [users, setUsers] = useState([]);

  const fetchHistory = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, 'notifications'), orderBy('createdAt', 'desc'))
      );
      setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Failed to load notifications', err);
      setHistory([]);
    }
  };

  const fetchRules = async () => {
    try {
      const snap = await getDocs(collection(db, 'notificationRules'));
      setRules(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Failed to load rules', err);
      setRules([]);
    }
  };

  const fetchUsers = async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      setUsers(
        snap.docs.map((d) => ({
          id: d.id,
          label: d.data().fullName || d.data().email || d.id,
        }))
      );
    } catch (err) {
      console.error('Failed to load users', err);
      setUsers([]);
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchRules();
    fetchUsers();
  }, []);

  const handleRuleSave = async (e) => {
    e.preventDefault();
    const cleanConditions = conditions.filter((c) => c.field && c.value);
    try {
      await addDoc(collection(db, 'notificationRules'), {
        trigger,
        conditions: cleanConditions,
        action: {
          type: 'sendNotification',
          recipientType,
          recipient,
          message,
        },
        createdAt: serverTimestamp(),
      });
      setTrigger('');
      setConditions([{ field: '', op: '==', value: '' }]);
      setRecipient('');
      setMessage('');
      fetchRules();
    } catch (err) {
      console.error('Failed to save rule', err);
    }
  };

  const handleDeleteRule = async (id) => {
    if (!window.confirm('Delete this rule?')) return;
    try {
      await deleteDoc(doc(db, 'notificationRules', id));
      setRules((r) => r.filter((rule) => rule.id !== id));
    } catch (err) {
      console.error('Failed to delete rule', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        title,
        body,
        audience,
        sendNow: !triggerTime,
        triggerTime: triggerTime ? new Date(triggerTime) : null,
        createdAt: serverTimestamp(),
      });
      setTitle('');
      setBody('');
      setAudience('');
      setTriggerTime('');
      fetchHistory();
    } catch (err) {
      console.error('Failed to save notification', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Notifications</h1>

      <h2 className="text-xl mb-2">Notification Rules</h2>
      {rules.length === 0 ? (
        <p>No rules found.</p>
      ) : (
        <div className="overflow-x-auto table-container mb-4">
          <table className="ad-table min-w-max text-sm">
            <thead>
              <tr>
                <th>Trigger</th>
                <th>Conditions</th>
                <th>Action</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.trigger}</td>
                  <td>
                    {Array.isArray(r.conditions) && r.conditions.length > 0
                      ? r.conditions
                          .map((c) => `${c.field} ${c.op} ${c.value}`)
                          .join(' && ')
                      : '-'}
                  </td>
                  <td>
                    {r.action?.recipientType} {r.action?.recipient} :{' '}
                    {r.action?.message}
                  </td>
                  <td className="text-center">
                    <button
                      onClick={() => handleDeleteRule(r.id)}
                      className="underline btn-delete"
                      type="button"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={handleRuleSave} className="space-y-2 max-w-md mb-8">
        <div>
          <label className="block mb-1 text-sm font-medium">Trigger Event</label>
          <select
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            className="w-full p-2 border rounded"
            required
          >
            <option value="">Select trigger</option>
            <option value="adGroupStatusUpdated">Ad Group Status Updated</option>
            <option value="reviewSubmitted">Review Submitted</option>
            <option value="accountCreated">Account Created</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="block text-sm">Conditions</label>
          {conditions.map((c, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <select
                className="p-2 border rounded flex-1"
                value={c.field}
                onChange={(e) => {
                  const arr = [...conditions];
                  arr[idx].field = e.target.value;
                  arr[idx].value = '';
                  setConditions(arr);
                }}
              >
                <option value="">Field</option>
                {Object.keys(FIELD_VALUES).map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <select
                className="p-2 border rounded"
                value={c.op}
                onChange={(e) => {
                  const arr = [...conditions];
                  arr[idx].op = e.target.value;
                  setConditions(arr);
                }}
              >
                <option value="==">==</option>
                <option value="!=">!=</option>
                <option value="includes">includes</option>
              </select>
              <select
                className="p-2 border rounded flex-1"
                value={c.value}
                onChange={(e) => {
                  const arr = [...conditions];
                  arr[idx].value = e.target.value;
                  setConditions(arr);
                }}
              >
                <option value="">Value</option>
                {(FIELD_VALUES[c.field] || []).map((val) => (
                  <option key={val} value={val}>
                    {val}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setConditions(conditions.filter((_, i) => i !== idx))}
                className="btn-secondary px-2 py-0.5"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setConditions([...conditions, { field: '', op: '==', value: '' }])}
            className="btn-secondary px-2 py-0.5"
          >
            Add Condition
          </button>
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Recipient Type</label>
          <select
            value={recipientType}
            onChange={(e) => {
              setRecipientType(e.target.value);
              setRecipient('');
            }}
            className="w-full p-2 border rounded"
          >
            <option value="userType">User Type</option>
            <option value="userId">User ID</option>
          </select>
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Recipient</label>
          {recipientType === 'userType' ? (
            <select
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full p-2 border rounded"
              required
            >
              <option value="">Select recipient</option>
              {USER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full p-2 border rounded"
              required
            >
              <option value="">Select recipient</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full p-2 border rounded"
            required
          />
        </div>
        <button type="submit" className="btn-primary">Save Rule</button>
      </form>

      <h2 className="text-xl mb-2">Manual Notification</h2>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div>
          <label className="block mb-1 text-sm font-medium">Audience</label>
          <input
            type="text"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            className="w-full p-2 border rounded"
            required
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-2 border rounded"
            required
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full p-2 border rounded"
            required
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Trigger Time</label>
          <input
            type="datetime-local"
            value={triggerTime}
            onChange={(e) => setTriggerTime(e.target.value)}
            className="w-full p-2 border rounded"
          />
          <p className="text-xs text-gray-500">
            Leave blank to send immediately.
          </p>
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Saving...' : 'Save Notification'}
        </button>
      </form>

      <h2 className="text-xl mt-8 mb-2">History</h2>
      {history.length === 0 ? (
        <p>No notifications found.</p>
      ) : (
        <div className="overflow-x-auto table-container">
          <table className="ad-table min-w-max text-sm">
            <thead>
              <tr>
                <th>Title</th>
                <th>Audience</th>
                <th>Trigger</th>
                <th>Sent At</th>
              </tr>
            </thead>
            <tbody>
              {history.map((n) => (
                <tr key={n.id}>
                  <td>{n.title}</td>
                  <td>{n.audience}</td>
                  <td>
                    {n.triggerTime
                      ? new Date(n.triggerTime.seconds * 1000).toLocaleString()
                      : 'Now'}
                  </td>
                  <td>
                    {n.sentAt
                      ? new Date(n.sentAt.seconds * 1000).toLocaleString()
                      : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminNotifications;
