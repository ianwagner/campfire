import React, { useState } from 'react';
import Modal from './components/Modal.jsx';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, auth } from './firebase/config';

const DescribeProjectModal = ({ onClose, brandCodes = [] }) => {
  const [title, setTitle] = useState('');
  const [brandCode, setBrandCode] = useState(brandCodes[0] || '');
  const [dueDate, setDueDate] = useState('');
  const [numAds, setNumAds] = useState(1);
  const [priority, setPriority] = useState('low');
  const [details, setDetails] = useState('');

  const handleSave = async () => {
    if (!title.trim()) return;
    try {
      const projRef = await addDoc(collection(db, 'projects'), {
        title: title.trim(),
        recipeTypes: [],
        brandCode,
        status: 'new',
        createdAt: serverTimestamp(),
        userId: auth.currentUser?.uid || null,
      });

      await addDoc(collection(db, 'requests'), {
        type: 'newAds',
        brandCode,
        title: title.trim(),
        dueDate: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
        numAds: Number(numAds) || 0,
        priority,
        details,
        status: 'new',
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || null,
        projectId: projRef.id,
      });

      onClose({ id: projRef.id, title: title.trim(), status: 'new', recipeTypes: [], createdAt: new Date() });
    } catch (err) {
      console.error('Failed to create project request', err);
    }
  };

  return (
    <Modal sizeClass="max-w-md w-full max-h-[90vh] overflow-auto">
      <h2 className="text-xl font-semibold mb-4">Describe Project</h2>
      <div className="space-y-3 mb-4">
        {brandCodes.length > 1 && (
          <div>
            <label className="block mb-1 text-sm font-medium">Brand</label>
            <select value={brandCode} onChange={(e) => setBrandCode(e.target.value)} className="w-full p-2 border rounded">
              {brandCodes.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block mb-1 text-sm font-medium">Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full p-2 border rounded" />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Due Date</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full p-2 border rounded" />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Number of Ads</label>
          <input type="number" min="1" value={numAds} onChange={(e) => setNumAds(e.target.value)} className="w-full p-2 border rounded" />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full p-2 border rounded">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Details</label>
          <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} className="w-full p-2 border rounded" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={() => onClose(null)}>Cancel</button>
        <button className="btn-primary" onClick={handleSave}>Save</button>
      </div>
    </Modal>
  );
};

export default DescribeProjectModal;
