import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { FiPlus, FiList, FiColumns } from 'react-icons/fi';
import { db, auth } from './firebase/config';
import { useNavigate } from 'react-router-dom';
import Table from './components/common/Table';
import Modal from './components/Modal.jsx';
import TabButton from './components/TabButton.jsx';
import RequestCard from './components/RequestCard.jsx';

const emptyForm = {
  brandCode: '',
  dueDate: '',
  numAds: 1,
  details: '',
};

const AdminRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [brands, setBrands] = useState([]);
  const [view, setView] = useState('kanban');
  const [dragId, setDragId] = useState(null);
  const navigate = useNavigate();

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
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    const data = {
      brandCode: form.brandCode,
      dueDate: form.dueDate ? Timestamp.fromDate(new Date(form.dueDate)) : null,
      numAds: Number(form.numAds) || 0,
      details: form.details,
      status: editId ? (requests.find((r) => r.id === editId)?.status || 'new') : 'new',
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

  const handleStatusChange = async (id, status) => {
    try {
      await updateDoc(doc(db, 'requests', id), { status });
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    } catch (err) {
      console.error('Failed to update status', err);
    }
  };

  const handleDragStart = (id) => {
    setDragId(id);
  };

  const handleDrop = (status) => {
    if (!dragId) return;
    handleStatusChange(dragId, status);
    setDragId(null);
  };

  const allowDrop = (e) => e.preventDefault();

  const handleCreateGroup = async (req) => {
    const groupName = `Group ${Date.now()}`;
    try {
      const docRef = await addDoc(collection(db, 'adGroups'), {
        name: groupName,
        brandCode: req.brandCode || '',
        notes: req.details || '',
        uploadedBy: auth.currentUser?.uid || null,
        createdAt: serverTimestamp(),
        status: 'pending',
        reviewedCount: 0,
        approvedCount: 0,
        editCount: 0,
        rejectedCount: 0,
        thumbnailUrl: '',
        lastUpdated: serverTimestamp(),
        visibility: 'private',
        requireAuth: false,
        requirePassword: false,
        password: '',
        dueDate: req.dueDate || null,
        clientNote: '',
      });
      navigate(`/ad-group/${docRef.id}`);
    } catch (err) {
      console.error('Failed to create group', err);
    }
  };

  const newReq = requests.filter((r) => r.status === 'new');
  const pending = requests.filter((r) => r.status === 'pending');
  const ready = requests.filter((r) => r.status === 'ready');
  const done = requests.filter((r) => r.status === 'done');
  const grouped = { new: newReq, pending, ready, done };

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Requests</h1>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <button onClick={openCreate} className="btn-primary flex items-center gap-1">
          <FiPlus /> Request Ads
        </button>
        <div className="flex items-center gap-2">
          <TabButton active={view === 'table'} onClick={() => setView('table')} aria-label="Table view">
            <FiList />
          </TabButton>
          <TabButton active={view === 'kanban'} onClick={() => setView('kanban')} aria-label="Kanban view">
            <FiColumns />
          </TabButton>
        </div>
      </div>
      {view === 'table' ? (
        <>
          <div className="mb-8">
            <h2 className="text-xl mb-2">New</h2>
            {loading ? (
              <p>Loading...</p>
            ) : newReq.length === 0 ? (
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
                  {newReq.map((req) => (
                    <tr key={req.id}>
                      <td>{req.brandCode}</td>
                      <td>{req.dueDate ? req.dueDate.toDate().toLocaleDateString() : ''}</td>
                      <td>{req.numAds}</td>
                      <td>{req.details}</td>
                      <td>
                        <select
                          value={req.status}
                          onChange={(e) => handleStatusChange(req.id, e.target.value)}
                          className={`status-select status-${req.status.replace(/\s+/g, '_')}`}
                        >
                          <option value="new">New</option>
                          <option value="pending">Pending</option>
                          <option value="ready">Ready</option>
                          <option value="done">Done</option>
                        </select>
                      </td>
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
          <div className="mb-8">
            <h2 className="text-xl mb-2">Pending</h2>
            {loading ? (
              <p>Loading...</p>
            ) : pending.length === 0 ? (
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
                  {pending.map((req) => (
                    <tr key={req.id}>
                      <td>{req.brandCode}</td>
                      <td>{req.dueDate ? req.dueDate.toDate().toLocaleDateString() : ''}</td>
                      <td>{req.numAds}</td>
                      <td>{req.details}</td>
                      <td>
                        <select
                          value={req.status}
                          onChange={(e) => handleStatusChange(req.id, e.target.value)}
                          className={`status-select status-${req.status.replace(/\s+/g, '_')}`}
                        >
                          <option value="new">New</option>
                          <option value="pending">Pending</option>
                          <option value="ready">Ready</option>
                          <option value="done">Done</option>
                        </select>
                      </td>
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
                      <td>
                        <select
                          value={req.status}
                          onChange={(e) => handleStatusChange(req.id, e.target.value)}
                          className={`status-select status-${req.status.replace(/\s+/g, '_')}`}
                        >
                          <option value="new">New</option>
                          <option value="pending">Pending</option>
                          <option value="ready">Ready</option>
                          <option value="done">Done</option>
                        </select>
                      </td>
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
                      <td>
                        <select
                          value={req.status}
                          onChange={(e) => handleStatusChange(req.id, e.target.value)}
                          className={`status-select status-${req.status.replace(/\s+/g, '_')}`}
                        >
                          <option value="new">New</option>
                          <option value="pending">Pending</option>
                          <option value="ready">Ready</option>
                          <option value="done">Done</option>
                        </select>
                      </td>
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
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {['new', 'pending', 'ready', 'done'].map((status) => (
            <div
              key={status}
              onDragOver={allowDrop}
              onDrop={() => handleDrop(status)}
            >
              <h2 className="text-xl mb-2 capitalize">{status}</h2>
              {loading ? (
                <p>Loading...</p>
              ) : grouped[status].length === 0 ? (
                <p>No requests.</p>
              ) : (
                <div className="space-y-4">
                  {grouped[status].map((req) => (
                    <RequestCard
                      key={req.id}
                      request={req}
                      onEdit={startEdit}
                      onDelete={handleDelete}
                      onDragStart={handleDragStart}
                      onCreateGroup={handleCreateGroup}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

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
