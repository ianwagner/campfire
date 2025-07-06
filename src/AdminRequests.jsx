import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { FiPlus } from 'react-icons/fi';
import { db } from './firebase/config';
import Table from './components/common/Table';
import Modal from './components/Modal.jsx';

const emptyForm = {
  brandCode: '',
  dueDate: '',
  numAds: 1,
  details: '',
  status: 'ready',
};

const AdminRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [brands, setBrands] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'requests'));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRequests(list);
      } catch (err) {
        console.error('Failed to fetch requests', err);
        setRequests([]);
      } finally {
        setLoading(false);
      }
    };

    const fetchBrands = async () => {
      try {
        const snap = await getDocs(collection(db, 'brands'));
        setBrands(snap.docs.map((d) => d.data().code));
      } catch (err) {
        console.error('Failed to fetch brands', err);
        setBrands([]);
      }
    };

    fetchData();
    fetchBrands();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditId(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const startEdit = (req) => {
    setEditId(req.id);
    setForm({
      brandCode: req.brandCode || '',
      dueDate: req.dueDate ? req.dueDate.toDate().toISOString().slice(0,10) : '',
      numAds: req.numAds || 1,
      details: req.details || '',
      status: req.status || 'ready',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    const data = {
      brandCode: form.brandCode,
      dueDate: form.dueDate ? Timestamp.fromDate(new Date(form.dueDate)) : null,
      numAds: Number(form.numAds) || 0,
      details: form.details,
      status: form.status,
    };
    try {
      if (editId) {
        await updateDoc(doc(db, 'requests', editId), data);
        setRequests((prev) => prev.map((r) => (r.id === editId ? { ...r, ...data } : r)));
      } else {
        const docRef = await addDoc(collection(db, 'requests'), data);
        setRequests((prev) => [...prev, { id: docRef.id, ...data }]);
      }
      setShowModal(false);
      resetForm();
    } catch (err) {
      console.error('Failed to save request', err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this request?')) return;
    try {
      await deleteDoc(doc(db, 'requests', id));
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to delete request', err);
    }
  };

  const ready = requests.filter((r) => r.status === 'ready');
  const done = requests.filter((r) => r.status === 'done');

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Requests</h1>
      <button onClick={openCreate} className="btn-primary mb-4 flex items-center gap-1">
        <FiPlus /> Request Ads
      </button>
      <div className="mb-8">
        <h2 className="text-xl mb-2">Ready</h2>
        {loading ? (
          <p>Loading...</p>
        ) : ready.length === 0 ? (
          <p>No requests.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Brand</th>
                <th>Due Date</th>
                <th># Ads</th>
                <th>Details</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ready.map((req) => (
                <tr key={req.id}>
                  <td>{req.brandCode}</td>
                  <td>{req.dueDate ? req.dueDate.toDate().toLocaleDateString() : ''}</td>
                  <td>{req.numAds}</td>
                  <td>{req.details}</td>
                  <td><span className="status-badge status-ready">Ready</span></td>
                  <td className="text-center">
                    <div className="flex items-center justify-center">
                      <button onClick={() => startEdit(req)} className="btn-action mr-2">Edit</button>
                      <button onClick={() => handleDelete(req.id)} className="btn-action btn-delete">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      <div>
        <h2 className="text-xl mb-2">Done</h2>
        {done.length === 0 ? (
          <p>No requests.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Brand</th>
                <th>Due Date</th>
                <th># Ads</th>
                <th>Details</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {done.map((req) => (
                <tr key={req.id}>
                  <td>{req.brandCode}</td>
                  <td>{req.dueDate ? req.dueDate.toDate().toLocaleDateString() : ''}</td>
                  <td>{req.numAds}</td>
                  <td>{req.details}</td>
                  <td><span className="status-badge">Done</span></td>
                  <td className="text-center">
                    <div className="flex items-center justify-center">
                      <button onClick={() => startEdit(req)} className="btn-action mr-2">Edit</button>
                      <button onClick={() => handleDelete(req.id)} className="btn-action btn-delete">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {showModal && (
        <Modal>
          <h2 className="text-xl mb-4">{editId ? 'Edit Request' : 'Request Ads'}</h2>
          <div className="space-y-4">
            <div>
              <label className="block mb-1 text-sm font-medium">Brand</label>
              <select
                value={form.brandCode}
                onChange={(e) => setForm((f) => ({ ...f, brandCode: e.target.value }))}
                className="w-full p-2 border rounded"
              >
                <option value="">Select brand</option>
                {brands.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">Due Date</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">Number of Ads</label>
              <input
                type="number"
                min="1"
                value={form.numAds}
                onChange={(e) => setForm((f) => ({ ...f, numAds: e.target.value }))}
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">Details</label>
              <textarea
                value={form.details}
                onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                className="w-full p-2 border rounded"
                rows={3}
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full p-2 border rounded"
              >
                <option value="ready">Ready</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>
          <div className="text-right mt-4 space-x-2">
            <button onClick={handleSave} className="btn-primary">Save</button>
            <button
              onClick={() => { setShowModal(false); resetForm(); }}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AdminRequests;
