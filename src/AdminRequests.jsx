import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, serverTimestamp, query, where } from 'firebase/firestore';
import { FiPlus, FiList, FiColumns, FiArchive, FiCalendar, FiEdit2, FiTrash } from 'react-icons/fi';
import { db, auth } from './firebase/config';
import { useNavigate } from 'react-router-dom';
import Table from './components/common/Table';
import IconButton from './components/IconButton.jsx';
import Modal from './components/Modal.jsx';
import TabButton from './components/TabButton.jsx';
import RequestCard from './components/RequestCard.jsx';
import Calendar from './components/Calendar.jsx';
import useAgencies from './useAgencies';
import formatDetails from './utils/formatDetails';

const emptyForm = {
  type: 'newAds',
  brandCode: '',
  title: '',
  dueDate: '',
  numAds: 1,
  details: '',
  priority: 'low',
  name: '',
  agencyId: '',
  toneOfVoice: '',
  offering: '',
  designerId: '',
  editorId: '',
};

const AdminRequests = ({ filterEditorId, canAssignEditor = true } = {}) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [brands, setBrands] = useState([]);
  const [designers, setDesigners] = useState([]);
  const [editors, setEditors] = useState([]);
  const [view, setView] = useState('kanban');
  const [dragId, setDragId] = useState(null);
  const navigate = useNavigate();
  const { agencies } = useAgencies();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const base = collection(db, 'requests');
        const q = filterEditorId ? query(base, where('editorId', '==', filterEditorId)) : base;
        const snap = await getDocs(q);
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

    const fetchDesigners = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'designer'));
        const snap = await getDocs(q);
        setDesigners(
          snap.docs.map((d) => ({
            id: d.id,
            name: d.data().fullName || d.data().email || d.id,
          }))
        );
      } catch (err) {
        console.error('Failed to fetch designers', err);
        setDesigners([]);
      }
    };

    const fetchEditors = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'editor'));
        const snap = await getDocs(q);
        setEditors(
          snap.docs.map((d) => ({
            id: d.id,
            name: d.data().fullName || d.data().email || d.id,
          }))
        );
      } catch (err) {
        console.error('Failed to fetch editors', err);
        setEditors([]);
      }
    };

    fetchData();
    fetchBrands();
    fetchDesigners();
    if (canAssignEditor) fetchEditors();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditId(null);
  };

  const openCreate = () => {
    resetForm();
    if (!canAssignEditor) {
      setForm((f) => ({ ...f, editorId: filterEditorId || auth.currentUser?.uid || '' }));
    }
    setShowModal(true);
  };

  const startEdit = (req) => {
    setEditId(req.id);
    setForm({
      type: req.type || 'newAds',
      brandCode: req.brandCode || '',
      title: req.title || '',
      dueDate: req.dueDate ? req.dueDate.toDate().toISOString().slice(0,10) : '',
      numAds: req.numAds || 1,
      details: req.details || '',
      priority: req.priority || 'low',
      name: req.name || '',
      agencyId: req.agencyId || '',
      toneOfVoice: req.toneOfVoice || '',
      offering: req.offering || '',
      designerId: req.designerId || '',
      editorId: req.editorId || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    const data = {
      type: form.type,
      brandCode: form.brandCode,
      title: form.title,
      dueDate: form.dueDate ? Timestamp.fromDate(new Date(form.dueDate)) : null,
      numAds: Number(form.numAds) || 0,
      details: form.details,
      priority: form.priority,
      name: form.name,
      agencyId: form.agencyId,
      toneOfVoice: form.toneOfVoice,
      offering: form.offering,
      designerId: form.designerId,
      editorId: canAssignEditor
        ? form.editorId
        : filterEditorId || auth.currentUser?.uid || form.editorId,
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

  const handleArchive = async (id) => {
    if (!window.confirm('Archive this request?')) return;
    try {
      await updateDoc(doc(db, 'requests', id), {
        status: 'archived',
        archivedAt: serverTimestamp(),
        archivedBy: auth.currentUser?.uid || null,
      });
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to archive request', err);
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

  const handleBulletList = (e) => {
    if (e.key === ' ' && e.target.selectionStart >= 2) {
      const val = e.target.value;
      const pos = e.target.selectionStart;
      if (
        val.slice(pos - 2, pos) === '- ' &&
        (pos === 2 || val[pos - 3] === '\n')
      ) {
        e.preventDefault();
        const before = val.slice(0, pos - 2);
        const after = val.slice(pos);
        const bullet = '\u2022 ';
        const newVal = before + bullet + after;
        setForm((f) => ({ ...f, details: newVal }));
        setTimeout(() => {
          e.target.selectionStart = e.target.selectionEnd = before.length + bullet.length;
        }, 0);
      }
    }
  };

  const handleCreateGroup = async (req) => {
    if (req.type === 'newBrand') {
      try {
        await addDoc(collection(db, 'brands'), {
          code: req.brandCode || '',
          name: req.name || '',
          agencyId: req.agencyId || '',
          toneOfVoice: req.toneOfVoice || '',
          offering: req.offering || '',
          archived: false,
          archivedAt: null,
          archivedBy: null,
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'requests', req.id), { status: 'done' });
        setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: 'done' } : r)));
      } catch (err) {
        console.error('Failed to create brand', err);
      }
    } else {
      const groupName = req.title?.trim() || `Group ${Date.now()}`;
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
          designerId: req.designerId || null,
          editorId: req.editorId || null,
        });
        await updateDoc(doc(db, 'requests', req.id), { status: 'done' });
        setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: 'done' } : r)));
        navigate(`/ad-group/${docRef.id}`);
      } catch (err) {
        console.error('Failed to create group', err);
      }
    }
  };

  const newReq = requests.filter((r) => r.status === 'new');
  const pending = requests.filter((r) => r.status === 'pending');
  const ready = requests.filter((r) => r.status === 'ready');
  const done = requests.filter((r) => r.status === 'done');
  const grouped = { new: newReq, pending, ready, done };

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Tickets</h1>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <button onClick={openCreate} className="btn-primary flex items-center gap-1">
          <FiPlus /> Add Ticket
        </button>
        <div className="flex flex-wrap gap-2 items-center">
          <TabButton active={view === 'table'} onClick={() => setView('table')} aria-label="Table view">
            <FiList />
          </TabButton>
          <TabButton active={view === 'kanban'} onClick={() => setView('kanban')} aria-label="Kanban view">
            <FiColumns />
          </TabButton>
          <TabButton active={view === 'dashboard'} onClick={() => setView('dashboard')} aria-label="Dashboard view">
            <FiCalendar />
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
              <p>No tickets.</p>
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
                      <td className="break-all" dangerouslySetInnerHTML={{ __html: formatDetails(req.details) }}></td>
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
                          <IconButton onClick={() => startEdit(req)} className="mr-2" aria-label="Edit">
                            <FiEdit2 />
                          </IconButton>
                          <IconButton onClick={() => handleDelete(req.id)} aria-label="Delete">
                            <FiTrash />
                          </IconButton>
                          <IconButton onClick={() => handleArchive(req.id)} className="ml-2" aria-label="Archive">
                            <FiArchive />
                          </IconButton>
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
              <p>No tickets.</p>
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
                      <td className="break-all" dangerouslySetInnerHTML={{ __html: formatDetails(req.details) }}></td>
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
                          <IconButton onClick={() => startEdit(req)} className="mr-2" aria-label="Edit">
                            <FiEdit2 />
                          </IconButton>
                          <IconButton onClick={() => handleDelete(req.id)} aria-label="Delete">
                            <FiTrash />
                          </IconButton>
                          <IconButton onClick={() => handleArchive(req.id)} className="ml-2" aria-label="Archive">
                            <FiArchive />
                          </IconButton>
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
              <p>No tickets.</p>
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
                      <td className="break-all" dangerouslySetInnerHTML={{ __html: formatDetails(req.details) }}></td>
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
                          <IconButton onClick={() => startEdit(req)} className="mr-2" aria-label="Edit">
                            <FiEdit2 />
                          </IconButton>
                          <IconButton onClick={() => handleDelete(req.id)} aria-label="Delete">
                            <FiTrash />
                          </IconButton>
                          <IconButton onClick={() => handleArchive(req.id)} className="ml-2" aria-label="Archive">
                            <FiArchive />
                          </IconButton>
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
              <p>No tickets.</p>
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
                      <td className="break-all" dangerouslySetInnerHTML={{ __html: formatDetails(req.details) }}></td>
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
                          <IconButton onClick={() => startEdit(req)} className="mr-2" aria-label="Edit">
                            <FiEdit2 />
                          </IconButton>
                          <IconButton onClick={() => handleDelete(req.id)} aria-label="Delete">
                            <FiTrash />
                          </IconButton>
                          <IconButton onClick={() => handleArchive(req.id)} className="ml-2" aria-label="Archive">
                            <FiArchive />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </>
      ) : view === 'kanban' ? (
        <div className="overflow-x-auto mt-[0.8rem]">
          <div className="min-w-max flex gap-4">
          {['new', 'pending', 'ready', 'done'].map((status) => (
            <div
              key={status}
              className="flex-shrink-0 w-[240px] sm:w-[320px]"
              onDragOver={allowDrop}
              onDrop={() => handleDrop(status)}
            >
              <h2 className="text-xl mb-2 capitalize">{status}</h2>
              <div
                className="bg-[#F7F7F7] dark:bg-[var(--dark-bg)] border border-gray-300 dark:border-gray-600 rounded-t-[1rem] rounded-b-[1rem] flex flex-col items-center gap-4 p-[0.6rem] overflow-y-auto"
                style={{ maxHeight: 'calc(100vh - 13rem)' }}
              >
                {loading ? (
                  <p>Loading...</p>
                ) : grouped[status].length === 0 ? (
                  <p>No tickets.</p>
                ) : (
                  <>
                    {grouped[status].map((req) => (
                        <RequestCard
                          key={req.id}
                          request={req}
                          onEdit={startEdit}
                          onDelete={handleDelete}
                          onArchive={handleArchive}
                          onDragStart={handleDragStart}
                          onCreateGroup={handleCreateGroup}
                        />
                    ))}
                  </>
                )}
              </div>
            </div>
          ))}
          </div>
        </div>
      ) : (
        <Calendar requests={requests} />
      )}

      {showModal && (
        <Modal>
          <h2 className="text-xl mb-4">{editId ? 'Edit Ticket' : 'Add Ticket'}</h2>
          <div className="space-y-4">
          <div>
          <label className="block mb-1 text-sm font-medium">Type</label>
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            className="w-full p-2 border rounded"
          >
            <option value="newAds">New Ads</option>
            <option value="newBrand">New Brand</option>
            <option value="bug">Bug</option>
            <option value="feature">Feature</option>
          </select>
        </div>
        {canAssignEditor && (
          <div>
            <label className="block mb-1 text-sm font-medium">Editor</label>
            <select
              value={form.editorId}
              onChange={(e) => setForm((f) => ({ ...f, editorId: e.target.value }))}
              className="w-full p-2 border rounded"
            >
              <option value="">Select editor</option>
              {editors.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
        )}
        {form.type === 'newAds' && (
            <>
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
                <label className="block mb-1 text-sm font-medium">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full p-2 border rounded"
                />
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
                <label className="block mb-1 text-sm font-medium">Designer</label>
                <select
                  value={form.designerId}
                  onChange={(e) => setForm((f) => ({ ...f, designerId: e.target.value }))}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Select designer</option>
                  {designers.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
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
                  onKeyDown={handleBulletList}
                  className="w-full p-2 border rounded"
                  rows={3}
                />
              </div>
            </>
          )}

          {form.type === 'newBrand' && (
            <>
              <div>
                <label className="block mb-1 text-sm font-medium">Brand Code</label>
                <input
                  type="text"
                  value={form.brandCode}
                  onChange={(e) => setForm((f) => ({ ...f, brandCode: e.target.value }))}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Brand Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Agency ID</label>
                <select
                  value={form.agencyId}
                  onChange={(e) => setForm((f) => ({ ...f, agencyId: e.target.value }))}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Select agency</option>
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Tone of Voice</label>
                <input
                  type="text"
                  value={form.toneOfVoice}
                  onChange={(e) => setForm((f) => ({ ...f, toneOfVoice: e.target.value }))}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Offering</label>
                <input
                  type="text"
                  value={form.offering}
                  onChange={(e) => setForm((f) => ({ ...f, offering: e.target.value }))}
                  className="w-full p-2 border rounded"
                />
              </div>
            </>
          )}

          {(form.type === 'bug' || form.type === 'feature') && (
            <>
              <div>
                <label className="block mb-1 text-sm font-medium">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Description</label>
                <textarea
                  value={form.details}
                  onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                  onKeyDown={handleBulletList}
                  className="w-full p-2 border rounded"
                  rows={3}
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  className="w-full p-2 border rounded"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </>
          )}
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
