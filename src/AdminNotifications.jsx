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
import TabButton from './components/TabButton.jsx';
import { FiPlus, FiEdit2, FiTrash } from 'react-icons/fi';
import IconButton from './components/IconButton.jsx';

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
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(0);
  const PER_PAGE = 25;
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

  useEffect(() => {
    setPage(0);
  }, [filter, sortField, history.length]);

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

  const deleteNotification = async (id) => {
    if (!window.confirm('Delete this notification?')) return;
    try {
      await deleteDoc(doc(db, 'notifications', id));
      setHistory((h) => h.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Failed to delete notification', err);
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

  const pageCount = Math.ceil(displayHistory.length / PER_PAGE) || 1;
  const currentPage = Math.min(page, pageCount - 1);
  const paginatedHistory = displayHistory.slice(
    currentPage * PER_PAGE,
    currentPage * PER_PAGE + PER_PAGE
  );

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Notifications</h1>
      <div className="flex space-x-4 mb-4">
        <TabButton active={tab === 'all'} onClick={() => setTab('all')}>
          All Notifications
        </TabButton>
        <TabButton active={tab === 'automations'} onClick={() => setTab('automations')}>
          Automations
        </TabButton>
      </div>

      {tab === 'all' && (
        <>
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
            <>
              <Table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Audience</th>
                    <th>Trigger</th>
                    <th>Sent At</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedHistory.map((n) => (
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
                      <td>
                        <IconButton onClick={() => deleteNotification(n.id)} className="btn-delete" aria-label="Delete">
                          <FiTrash />
                        </IconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <div className="flex justify-between items-center mt-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  className="btn-secondary px-3 py-1"
                >
                  Previous
                </button>
                <span>
                  Page {currentPage + 1} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => (p + 1 < pageCount ? p + 1 : p))}
                  disabled={currentPage + 1 >= pageCount}
                  className="btn-secondary px-3 py-1"
                >
                  Next
                </button>
              </div>
            </>
          )}

        </>
      )}

      {tab === 'automations' && (
        <>
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
                    <div className="flex items-center gap-2">
                      <IconButton onClick={() => startEditRule(r)} aria-label="Edit">
                        <FiEdit2 />
                      </IconButton>
                      <button onClick={() => toggleRule(r.id, r.active)} className="underline mr-2">
                        {r.active ? 'Disable' : 'Enable'}
                      </button>
                      <IconButton onClick={() => deleteRule(r.id)} className="btn-delete" aria-label="Delete">
                        <FiTrash />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
      )}
      </>
      )}
    </div>
  );
};

export default AdminNotifications;
