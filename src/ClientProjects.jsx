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
import DescribeProjectModal from './DescribeProjectModal.jsx';
import OptimizedImage from './components/OptimizedImage.jsx';
import useSiteSettings from './useSiteSettings';
import { FiFileText } from 'react-icons/fi';
import { FaMagic } from 'react-icons/fa';

const OptionButton = ({ icon: Icon, title, desc, onClick }) => (
  <button
    className="border rounded p-4 text-left hover:bg-gray-100 flex flex-col items-start w-full"
    onClick={onClick}
  >
    <div className="text-2xl mb-2">
      <Icon />
    </div>
    <span className="font-semibold mb-1">{title}</span>
    <p className="text-sm text-gray-600">{desc}</p>
  </button>
);

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

const uniqueById = (list) => {
  const map = new Map();
  list.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
};

const ClientProjects = ({ brandCodes = [] }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalStep, setModalStep] = useState(null); // null | 'brief' | 'describe'
  const navigate = useNavigate();
  const { settings } = useSiteSettings();

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

        const filtered = allProjects.filter((p) =>
          activeKeys.has(`${p.brandCode}|${p.title}`)
        );
        setProjects(uniqueById(filtered));
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
      setProjects((p) => {
        const next = [proj, ...p];
        return uniqueById(next);
      });
    }
  };

  return (
    <div className="min-h-screen p-4 flex flex-col items-center overflow-y-auto snap-y snap-mandatory scroll-smooth">
      {loading ? (
        <p>Loading projects...</p>
      ) : (
        <div className="w-full flex flex-col items-center">
          {settings.artworkUrl && (
            <section className="snap-start w-full">
              <div className="max-w-[60rem] w-full mx-auto mt-4 h-[25rem] overflow-hidden rounded-lg mb-6 flex items-center justify-center">
                <OptimizedImage
                  pngUrl={settings.artworkUrl}
                  alt="Artwork"
                  loading="eager"
                  className="w-full h-full object-cover object-center"
                />
              </div>
            </section>
          )}
          <section className="snap-start w-full flex flex-col items-center">
            <div className="max-w-xl w-full flex flex-col items-center text-center mb-6">
              <h1 className="text-2xl mb-4">How would you like to start?</h1>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full justify-items-center">
                <OptionButton
                  icon={FiFileText}
                  title="Describe Project"
                  desc="Just tell us what you need. We'll generate a brief"
                  onClick={() => setModalStep('describe')}
                />
                <OptionButton
                  icon={FaMagic}
                  title="Generate Brief"
                  desc="Craft your own brief. Choose copy, visuals and layouts"
                  onClick={() => setModalStep('brief')}
                />
              </div>
            </div>
            {projects.length > 0 && (
              <div className="space-y-3 max-w-xl w-full mx-auto">
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
          </section>
        </div>
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
