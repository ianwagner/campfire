import React, { useEffect, useState } from 'react';
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase/config';
import useNotificationTemplate from './useNotificationTemplate';
import AdminNotificationRules from './AdminNotificationRules';

const AdminNotifications = () => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('');
  const [triggerTime, setTriggerTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState('log');

  const { template, loading: templateLoading, saveTemplate } =
    useNotificationTemplate();
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateBody, setTemplateBody] = useState('');

  useEffect(() => {
    if (!templateLoading) {
      setTemplateTitle(template.title || '');
      setTemplateBody(template.body || '');
    }
  }, [template, templateLoading]);

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

  useEffect(() => {
    fetchHistory();
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

  const handleTemplateSave = async (e) => {
    e.preventDefault();
    await saveTemplate({ title: templateTitle, body: templateBody });
  };

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Notifications</h1>
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setTab('log')}
          className={tab === 'log' ? 'btn-primary' : 'btn-secondary'}
        >
          Log
        </button>
        <button
          type="button"
          onClick={() => setTab('rules')}
          className={tab === 'rules' ? 'btn-primary' : 'btn-secondary'}
        >
          Rules
        </button>
      </div>
      {tab === 'log' && (
        <>
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

      <h2 className="text-xl mt-8 mb-2">Status Update Template</h2>
      <form onSubmit={handleTemplateSave} className="space-y-4 max-w-md">
        <div>
          <label className="block mb-1 text-sm font-medium">Title Template</label>
          <input
            type="text"
            value={templateTitle}
            onChange={(e) => setTemplateTitle(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Body Template</label>
          <textarea
            value={templateBody}
            onChange={(e) => setTemplateBody(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div className="border p-2 rounded text-sm">
          <strong>
            {templateTitle
              .replace('{{adGroup.brandCode}}', 'BR123')
              .replace('{{adGroup.status}}', 'approved')}
          </strong>
          <p>
            {templateBody
              .replace('{{adGroup.brandCode}}', 'BR123')
              .replace('{{adGroup.status}}', 'approved')}
          </p>
        </div>
        <button type="submit" className="btn-primary" disabled={templateLoading}>
          {templateLoading ? 'Saving...' : 'Save Template'}
        </button>
      </form>
      </>
      )}
      {tab === 'rules' && <AdminNotificationRules />}
    </div>
  );
};

export default AdminNotifications;
