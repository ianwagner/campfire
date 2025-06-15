import React, { useEffect, useState } from 'react';
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase/config';

const emptyCondition = { field: 'adGroup.status', operator: '==', value: '' };

const AdminNotificationRules = () => {
  const [conditions, setConditions] = useState([ { ...emptyCondition } ]);
  const [recipientType, setRecipientType] = useState('userType');
  const [recipientValue, setRecipientValue] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState([]);

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
    fetchRules();
  }, []);

  const addCondition = () => {
    setConditions((prev) => [...prev, { ...emptyCondition }]);
  };

  const removeCondition = (idx) => {
    setConditions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateCondition = (idx, key, value) => {
    setConditions((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, [key]: value } : c))
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const rule = {
        trigger: 'adGroupStatusUpdated',
        conditions,
        action: {
          type: 'sendNotification',
          recipientType,
          recipientValue,
          title,
          body,
        },
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'notificationRules'), rule);
      // reset
      setConditions([ { ...emptyCondition } ]);
      setRecipientType('userType');
      setRecipientValue('');
      setTitle('');
      setBody('');
      fetchRules();
    } catch (err) {
      console.error('Failed to save rule', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this rule?')) return;
    try {
      await deleteDoc(doc(db, 'notificationRules', id));
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to delete rule', err);
    }
  };

  const previewTitle = title.replace('{status}', 'reviewed');
  const previewBody = body
    .replace('{status}', 'reviewed')
    .replace('{brandName}', 'SampleBrand');

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Notification Rules</h1>
      <form onSubmit={handleSave} className="space-y-4 max-w-lg">
        <div>
          <label className="block mb-1 font-medium">Trigger</label>
          <p>Ad group status is updated</p>
        </div>
        <div>
          <label className="block mb-1 font-medium">Conditions</label>
          {conditions.map((c, idx) => (
            <div key={idx} className="flex gap-2 mb-2">
              <select
                value={c.field}
                onChange={(e) => updateCondition(idx, 'field', e.target.value)}
                className="p-1 border rounded"
              >
                <option value="adGroup.status">adGroup.status</option>
                <option value="user.userType">user.userType</option>
                <option value="adGroup.brandCode">adGroup.brandCode</option>
              </select>
              <select
                value={c.operator}
                onChange={(e) => updateCondition(idx, 'operator', e.target.value)}
                className="p-1 border rounded"
              >
                <option value="==">==</option>
                <option value="!=">!=</option>
                <option value="includes">includes</option>
              </select>
              <input
                type="text"
                value={c.value}
                onChange={(e) => updateCondition(idx, 'value', e.target.value)}
                className="flex-1 p-1 border rounded"
              />
              {conditions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCondition(idx)}
                  className="btn-secondary px-2"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addCondition} className="btn-secondary">
            Add Condition
          </button>
        </div>
        <div>
          <label className="block mb-1 font-medium">Action</label>
          <div className="mb-2">Type: sendNotification</div>
          <div className="mb-2">
            <label className="block mb-1 text-sm">Recipient Type</label>
            <select
              value={recipientType}
              onChange={(e) => setRecipientType(e.target.value)}
              className="p-1 border rounded"
            >
              <option value="userType">userType</option>
              <option value="userId">userId</option>
            </select>
          </div>
          <div className="mb-2">
            <label className="block mb-1 text-sm">Recipient Value</label>
            {recipientType === 'userType' ? (
              <select
                value={recipientValue}
                onChange={(e) => setRecipientValue(e.target.value)}
                className="p-1 border rounded"
              >
                <option value="">Select type</option>
                <option value="admin">admin</option>
                <option value="designer">designer</option>
                <option value="client">client</option>
              </select>
            ) : (
              <input
                type="text"
                value={recipientValue}
                onChange={(e) => setRecipientValue(e.target.value)}
                className="w-full p-1 border rounded"
              />
            )}
          </div>
          <div className="mb-2">
            <label className="block mb-1 text-sm">Notification Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-1 border rounded"
            />
          </div>
          <div className="mb-2">
            <label className="block mb-1 text-sm">Notification Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full p-1 border rounded"
            />
          </div>
        </div>
        <div>
          <label className="block mb-1 font-medium">Preview</label>
          <div className="border p-2 rounded">
            <strong>{previewTitle}</strong>
            <p>{previewBody}</p>
          </div>
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Saving...' : 'Save Rule'}
        </button>
      </form>

      <h2 className="text-xl mt-8 mb-2">Existing Rules</h2>
      {rules.length === 0 ? (
        <p>No rules found.</p>
      ) : (
        <div className="overflow-x-auto table-container">
          <table className="ad-table min-w-max text-sm">
            <thead>
              <tr>
                <th>Conditions</th>
                <th>Recipient</th>
                <th>Title</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>
                    {Array.isArray(r.conditions)
                      ? r.conditions
                          .map((c) => `${c.field} ${c.operator} ${c.value}`)
                          .join('; ')
                      : ''}
                  </td>
                  <td>{r.action?.recipientType}: {r.action?.recipientValue}</td>
                  <td>{r.action?.title}</td>
                  <td className="text-center">
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="btn-secondary px-1.5 py-0.5 text-xs btn-delete"
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
    </div>
  );
};

export default AdminNotificationRules;
