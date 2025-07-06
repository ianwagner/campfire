import React, { useEffect, useState } from 'react';
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { db } from './firebase/config';
import Table from './components/common/Table';
import { FiPlus } from 'react-icons/fi';

const AdminNotifications = () => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('');
  const [triggerTime, setTriggerTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [rules, setRules] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('');
  const [sortField, setSortField] = useState('created');
  const [ruleForm, setRuleForm] = useState({
    trigger: 'adGroupCreated',
    audience: '',
    title: '',
    body: '',
  });
  const [editingRuleId, setEditingRuleId] = useState(null);

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
      const snap = await getDocs(
        query(collection(db, 'notificationRules'), orderBy('createdAt', 'desc'))
      );
      setRules(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Failed to load rules', err);
      setRules([]);
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchRules();
  }, []);

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

  const handleRuleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingRuleId) {
        await updateDoc(doc(db, 'notificationRules', editingRuleId), {
          trigger: ruleForm.trigger,
          audience: ruleForm.audience,
          titleTemplate: ruleForm.title,
          bodyTemplate: ruleForm.body,
        });
        setRules((r) =>
          r.map((rule) =>
            rule.id === editingRuleId
              ? {
                  ...rule,
                  trigger: ruleForm.trigger,
                  audience: ruleForm.audience,
                  title: ruleForm.title,
                  body: ruleForm.body,
                  titleTemplate: ruleForm.title,
                  bodyTemplate: ruleForm.body,
                }
              : rule
          )
        );
        setEditingRuleId(null);
      } else {
        const ref = await addDoc(collection(db, 'notificationRules'), {
          trigger: ruleForm.trigger,
          audience: ruleForm.audience,
          titleTemplate: ruleForm.title,
          bodyTemplate: ruleForm.body,
          active: true,
          createdAt: serverTimestamp(),
        });
        setRules((r) => [...r, { id: ref.id, ...ruleForm, active: true }]);
      }
      setRuleForm({ trigger: 'adGroupCreated', audience: '', title: '', body: '' });
    } catch (err) {
      console.error('Failed to save rule', err);
    }
  };

  const toggleRule = async (id, active) => {
    try {
      await updateDoc(doc(db, 'notificationRules', id), { active: !active });
      setRules((r) => r.map((rule) => (rule.id === id ? { ...rule, active: !active } : rule)));
    } catch (err) {
      console.error('Failed to update rule', err);
    }
  };

  const startEditRule = (rule) => {
    setRuleForm({
      trigger: rule.trigger,
      audience: rule.audience,
      title: rule.title || rule.titleTemplate || '',
      body: rule.body || rule.bodyTemplate || '',
    });
    setEditingRuleId(rule.id);
  };

  const cancelEdit = () => {
    setRuleForm({ trigger: 'adGroupCreated', audience: '', title: '', body: '' });
    setEditingRuleId(null);
  };

  const deleteRule = async (id) => {
    if (!window.confirm('Delete this rule?')) return;
    try {
      await deleteDoc(doc(db, 'notificationRules', id));
      setRules((r) => r.filter((rule) => rule.id !== id));
    } catch (err) {
      console.error('Failed to delete rule', err);
    }
  };

  const term = filter.toLowerCase();
  const displayHistory = history
    .filter(
      (h) =>
        !term ||
        h.title?.toLowerCase().includes(term) ||
        h.audience?.toLowerCase().includes(term)
    )
    .sort((a, b) => {
      if (sortField === 'title') return (a.title || '').localeCompare(b.title || '');
      if (sortField === 'audience') return (a.audience || '').localeCompare(b.audience || '');
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Notifications</h1>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-1"
        >
          <FiPlus />
          Create Notification
        </button>
        <div className="flex items-center gap-2">
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value)}
            className="p-1 border rounded"
          >
            <option value="created">Created</option>
            <option value="title">Title</option>
            <option value="audience">Audience</option>
          </select>
          <input
            type="text"
            placeholder="Filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="p-1 border rounded"
          />
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-4 rounded shadow max-w-md w-full dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)] overflow-y-auto max-h-[90vh]">
            <form onSubmit={handleSubmit} className="space-y-4">
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
              <div className="text-right mt-2">
                <button onClick={() => setShowCreate(false)} className="btn-secondary px-3 py-1">
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <h2 className="text-xl mt-8 mb-2">History</h2>
      {history.length === 0 ? (
        <p>No notifications found.</p>
      ) : (
        <Table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Audience</th>
                <th>Trigger</th>
                <th>Sent At</th>
              </tr>
            </thead>
            <tbody>
              {displayHistory.map((n) => (
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
          </Table>
        )}

      <h2 className="text-xl mt-8 mb-2">Automation Rules</h2>
      <form onSubmit={handleRuleSubmit} className="space-y-2 max-w-md mb-4">
        <div>
          <label className="block mb-1 text-sm font-medium">Trigger</label>
          <select
            value={ruleForm.trigger}
            onChange={(e) => setRuleForm((f) => ({ ...f, trigger: e.target.value }))}
            className="w-full p-2 border rounded"
          >
            <option value="adGroupCreated">Ad Group Created</option>
            <option value="adGroupStatusUpdated">Ad Group Status Updated</option>
            <option value="accountCreated">Account Created</option>
          </select>
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Audience</label>
          <input
            type="text"
            value={ruleForm.audience}
            onChange={(e) => setRuleForm((f) => ({ ...f, audience: e.target.value }))}
            className="w-full p-2 border rounded"
            required
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Title Template</label>
          <input
            type="text"
            value={ruleForm.title}
            onChange={(e) => setRuleForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full p-2 border rounded"
            required
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Body Template</label>
          <textarea
            value={ruleForm.body}
            onChange={(e) => setRuleForm((f) => ({ ...f, body: e.target.value }))}
            className="w-full p-2 border rounded"
            required
          />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary">
            {editingRuleId ? 'Update Rule' : 'Save Rule'}
          </button>
          {editingRuleId && (
            <button type="button" onClick={cancelEdit} className="btn-secondary">
              Cancel
            </button>
          )}
        </div>
      </form>

      {rules.length === 0 ? (
        <p>No rules configured.</p>
      ) : (
        <Table>
            <thead>
              <tr>
                <th>Trigger</th>
                <th>Audience</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.trigger}</td>
                  <td>{r.audience}</td>
                  <td>{r.active ? 'yes' : 'no'}</td>
                  <td>
                    <button
                      onClick={() => startEditRule(r)}
                      className="underline mr-2"
                    >
                      Edit
                    </button>
                    <button onClick={() => toggleRule(r.id, r.active)} className="underline mr-2">
                      {r.active ? 'Disable' : 'Enable'}
                    </button>
                    <button onClick={() => deleteRule(r.id)} className="underline btn-delete">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
    </div>
  );
};

export default AdminNotifications;
