import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase/config';
import PageWrapper from './components/PageWrapper.jsx';
import PageToolbar from './components/PageToolbar.jsx';
import TabButton from './components/TabButton.jsx';
import Table from './components/common/Table.jsx';
import Modal from './components/Modal.jsx';

const AdminDynamicHeadlines = () => {
  const [audience, setAudience] = useState('clients');
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: '', description: '' });
  const navigate = useNavigate();

  const fetchTypes = async (aud) => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'headlineTypes'),
        where('audience', '==', aud)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTypes(list);
    } catch (err) {
      console.error('Failed to fetch headline types', err);
      setTypes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTypes(audience);
  }, [audience]);

  const handleSave = async () => {
    if (!form.title.trim()) return;
    try {
      await addDoc(collection(db, 'headlineTypes'), {
        title: form.title,
        description: form.description,
        audience,
        updatedAt: serverTimestamp(),
      });
      setShowModal(false);
      setForm({ title: '', description: '' });
      fetchTypes(audience);
    } catch (err) {
      console.error('Failed to save headline type', err);
    }
  };

  return (
    <PageWrapper title="Dynamic Headlines">
      <PageToolbar
        left={(
          <>
            <TabButton
              active={audience === 'clients'}
              onClick={() => setAudience('clients')}
            >
              Clients
            </TabButton>
            <TabButton
              active={audience === 'designers'}
              onClick={() => setAudience('designers')}
            >
              Designers
            </TabButton>
          </>
        )}
        right={(
          <>
            <Link
              to="/admin/dynamic-headlines/guardrails"
              className="btn-secondary"
            >
              Guardrails
            </Link>
            <button className="btn-primary" onClick={() => setShowModal(true)}>
              New Type
            </button>
          </>
        )}
      />
      {loading ? (
        <p>Loading...</p>
      ) : types.length === 0 ? (
        <p>No headline types found.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Where</th>
              <th>Templates</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id}>
                <td>{t.title || t.name}</td>
                <td>{t.description || '-'}</td>
                <td>
                  {Array.isArray(t.templates)
                    ? t.templates.length
                    : t.templates || 0}
                </td>
                <td>
                  {t.updatedAt?.toDate
                    ? t.updatedAt.toDate().toLocaleString()
                    : ''}
                </td>
                <td>
                  <button
                    className="btn-edit"
                    onClick={() => navigate(`/admin/dynamic-headlines/${t.id}`)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {showModal && (
        <Modal>
          <h2 className="text-lg mb-2">New Headline Type</h2>
          <div className="mb-2">
            <label className="block text-sm mb-1">Name</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
              className="w-full p-1 border rounded"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              className="w-full p-1 border rounded"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="btn-secondary"
              onClick={() => setShowModal(false)}
            >
              Cancel
            </button>
            <button className="btn-primary" onClick={handleSave}>
              Save
            </button>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
};

export default AdminDynamicHeadlines;
