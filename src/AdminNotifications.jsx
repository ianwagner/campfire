import React, { useEffect, useState } from 'react';
import TagInput from './components/TagInput.jsx';
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

const AdminNotifications = () => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('');
  const [triggerTime, setTriggerTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [rules, setRules] = useState([]);
  const [brandCodes, setBrandCodes] = useState([]);
  const [brands, setBrands] = useState([]);
  const [ruleForm, setRuleForm] = useState({
    trigger: 'adGroupCreated',
    audience: '',
    title: '',
    body: '',
  });

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
    const fetchBrands = async () => {
      try {
        const snap = await getDocs(collection(db, 'brands'));
        setBrands(snap.docs.map((d) => d.data().code));
      } catch (err) {
        console.error('Failed to load brands', err);
        setBrands([]);
      }
    };
    fetchBrands();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        title,
        body,
        audience,
        brandCodes: brandCodes.filter(Boolean),
        sendNow: !triggerTime,
        triggerTime: triggerTime ? new Date(triggerTime) : null,
        createdAt: serverTimestamp(),
      });
      setTitle('');
      setBody('');
      setAudience('');
      setBrandCodes([]);
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
      const ref = await addDoc(collection(db, 'notificationRules'), {
        trigger: ruleForm.trigger,
        audience: ruleForm.audience,
        titleTemplate: ruleForm.title,
        bodyTemplate: ruleForm.body,
        active: true,
        createdAt: serverTimestamp(),
      });
      setRules((r) => [...r, { id: ref.id, ...ruleForm, active: true }]);
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

  const deleteRule = async (id) => {
    if (!window.confirm('Delete this rule?')) return;
    try {
      await deleteDoc(doc(db, 'notificationRules', id));
      setRules((r) => r.filter((rule) => rule.id !== id));
    } catch (err) {
      console.error('Failed to delete rule', err);
    }
  };

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Notifications</h1>
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
          <label className="block mb-1 text-sm font-medium">Brand Codes</label>
          <TagInput
            value={brandCodes}
            onChange={setBrandCodes}
            suggestions={brands}
            id="note-brand-code"
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
        <button type="submit" className="btn-primary">Save Rule</button>
      </form>

      {rules.length === 0 ? (
        <p>No rules configured.</p>
      ) : (
        <div className="overflow-x-auto table-container">
          <table className="ad-table min-w-max text-sm">
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
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminNotifications;
