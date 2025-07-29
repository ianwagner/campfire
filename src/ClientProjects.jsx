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
  writeBatch,
  doc,
} from 'firebase/firestore';
import { db, auth } from './firebase/config';
import Modal from './components/Modal.jsx';
import RecipePreview from './RecipePreview.jsx';
import SelectProjectTypeModal from './SelectProjectTypeModal.jsx';
import DescribeProjectModal from './DescribeProjectModal.jsx';

const CreateProjectModal = ({ onClose, brandCodes = [] }) => {
  const [title, setTitle] = useState('');
  const brandCode = brandCodes[0] || '';

  const handleSave = async (recipes) => {
    if (!title.trim()) return;
    try {
      const projRef = await addDoc(collection(db, 'projects'), {
        title: title.trim(),
        recipeTypes: Array.isArray(recipes) ? recipes.map((r) => r.type) : [],
        brandCode,
        status: 'new',
        createdAt: serverTimestamp(),
        userId: auth.currentUser?.uid || null,
      });

      const groupRef = await addDoc(collection(db, 'adGroups'), {
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

      if (Array.isArray(recipes) && recipes.length > 0) {
        const batch = writeBatch(db);
        recipes.forEach((r) => {
          const ref = doc(db, 'adGroups', groupRef.id, 'recipes', String(r.recipeNo));
          batch.set(
            ref,
            {
              components: r.components,
              copy: r.copy,
              assets: r.assets || [],
              type: r.type || '',
              selected: r.selected || false,
              brandCode: r.brandCode || brandCode,
            },
            { merge: true }
          );
        });
        await batch.commit();
      }

      onClose({ id: projRef.id, title: title.trim(), status: 'new', recipeTypes: Array.isArray(recipes) ? recipes.map((r) => r.type) : [], createdAt: new Date() });
    } catch (err) {
      console.error('Failed to create project', err);
    }
  };

  return (
    <Modal sizeClass="max-w-[50rem] w-full max-h-[90vh] overflow-auto">
      <h2 className="text-xl font-semibold mb-4">New Project</h2>
      <div className="mb-4">
        <label className="block mb-1 text-sm font-medium">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full p-2 border rounded"
        />
      </div>
      <RecipePreview
        onSave={handleSave}
        brandCode={brandCode}
        hideBrandSelect
        externalOnly
      />
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={() => onClose(null)}>Cancel</button>
      </div>
    </Modal>
  );
};

const ClientProjects = ({ brandCodes = [] }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalStep, setModalStep] = useState(null); // null | 'choose' | 'brief' | 'describe'
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

        const allProjects = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: d.data().createdAt?.toDate(),
        }));

        const groupSnap = await getDocs(
          query(collection(db, 'adGroups'), where('uploadedBy', '==', auth.currentUser.uid))
        );
        const activeKeys = new Set();
        groupSnap.docs.forEach((g) => {
          const data = g.data();
          if (data.status !== 'archived') {
            activeKeys.add(`${data.brandCode}|${data.name}`);
          }
        });

        setProjects(
          allProjects.filter((p) => activeKeys.has(`${p.brandCode}|${p.title}`))
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
    setModalStep(null);
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
          <button className="btn-primary" onClick={() => setModalStep('choose')}>
            Create new project
          </button>
        </div>
      ) : (
        <div className="w-full max-w-xl space-y-3">
          <div className="flex justify-center mb-4">
            <button className="btn-primary" onClick={() => setModalStep('choose')}>
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
      {modalStep === 'choose' && (
        <SelectProjectTypeModal
          onSelect={setModalStep}
          onClose={() => setModalStep(null)}
        />
      )}
      {modalStep === 'brief' && (
        <CreateProjectModal onClose={handleCreated} brandCodes={brandCodes} />
      )}
      {modalStep === 'describe' && (
        <DescribeProjectModal onClose={handleCreated} brandCodes={brandCodes} />
      )}
    </div>
  );
};

export default ClientProjects;
