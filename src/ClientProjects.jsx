import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from './firebase/config';
import Modal from './components/Modal.jsx';

const CreateProjectModal = ({ onClose, brandCodes = [] }) => {
  const [title, setTitle] = useState('');
  const [types, setTypes] = useState([]);
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const q = query(
          collection(db, 'copyRecipeTypes'),
          where('external', '==', true)
        );
        const snap = await getDocs(q);
        setTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); 
      } catch (err) {
        console.error('Failed to load recipe types', err);
      }
    };
    fetchTypes();
  }, []);

  const toggle = (id) => {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
    );
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    const brandCode = brandCodes[0] || '';
    try {
      const projRef = await addDoc(collection(db, 'projects'), {
        title: title.trim(),
        recipeTypes: selected,
        brandCode,
        status: 'new',
        createdAt: serverTimestamp(),
        userId: auth.currentUser?.uid || null,
      });

      await addDoc(collection(db, 'adGroups'), {
        name: title.trim(),
        brandCode,
        status: 'new',
        uploadedBy: auth.currentUser?.uid || null,
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
        reviewedCount: 0,
        approvedCount: 0,
        editCount: 0,
        rejectedCount: 0,
        archivedCount: 0,
        thumbnailUrl: '',
        visibility: 'private',
        requireAuth: false,
        requirePassword: false,
        password: '',
      });

      onClose({ id: projRef.id, title: title.trim(), status: 'new', recipeTypes: selected, createdAt: new Date() });
    } catch (err) {
      console.error('Failed to create project', err);
    }
  };

  return (
    <Modal>
      <h2 className="text-xl font-semibold mb-4">New Project</h2>
      <div className="space-y-3">
        <div>
          <label className="block mb-1 text-sm font-medium">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Recipe Types</label>
          <div className="max-h-40 overflow-auto border rounded p-2">
            {types.map((t) => (
              <label key={t.id} className="block text-sm">
                <input
                  type="checkbox"
                  className="mr-2"
                  checked={selected.includes(t.id)}
                  onChange={() => toggle(t.id)}
                />
                {t.name || t.id}
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn" onClick={() => onClose(null)}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </Modal>
  );
};

const ClientProjects = ({ brandCodes = [] }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProjects = async () => {
      if (!auth.currentUser?.uid) {
        setProjects([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const q = query(
          collection(db, 'projects'),
          where('userId', '==', auth.currentUser.uid),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        setProjects(
          snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() }))
        );
      } catch (err) {
        console.error('Failed to load projects', err);
        setProjects([]);
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
  }, []);

  const handleCreated = (proj) => {
    setShowModal(false);
    if (proj) {
      setProjects((p) => [proj, ...p]);
    }
  };

  return (
    <div className="min-h-screen p-4 flex flex-col items-center">
      {loading ? (
        <p>Loading projects...</p>
      ) : projects.length === 0 ? (
        <div className="text-center mt-20">
          <p className="mb-4 text-xl">What are we creating next?</p>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            Create new project
          </button>
        </div>
      ) : (
        <div className="w-full max-w-xl space-y-3">
          <div className="flex justify-center mb-4">
            <button className="btn-primary" onClick={() => setShowModal(true)}>
              Create new project
            </button>
          </div>
          {projects.map((p) => (
            <div
              key={p.id}
              className="border rounded p-4 flex justify-between items-center cursor-pointer"
              onClick={() => navigate(`/projects/${p.id}`)}
            >
              <span className="font-medium">{p.title}</span>
              <span className="text-sm text-gray-500">{p.status}</span>
            </div>
          ))}
        </div>
      )}
      {showModal && (
        <CreateProjectModal onClose={handleCreated} brandCodes={brandCodes} />
      )}
    </div>
  );
};

export default ClientProjects;
