import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
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
import TabButton from './components/TabButton.jsx';

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
  const [step, setStep] = useState(1);
  const [brandCode, setBrandCode] = useState(brandCodes[0] || '');

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
        projectId: projRef.id,
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
      {step === 1 && <h2 className="text-xl font-semibold mb-4">New Project</h2>}
      <RecipePreview
        onSave={handleSave}
        brandCode={brandCode}
        allowedBrandCodes={brandCodes}
        hideBrandSelect={brandCodes.length <= 1}
        externalOnly
        title={title}
        onTitleChange={setTitle}
        onStepChange={setStep}
        onBrandCodeChange={setBrandCode}
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
  const [projDocs, setProjDocs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalStep, setModalStep] = useState(null); // null | 'brief' | 'describe'
  const [view, setView] = useState('current');
  const navigate = useNavigate();
  const { settings } = useSiteSettings();

  useEffect(() => {
    if (!auth.currentUser?.uid) {
      setProjects([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const projQ = query(
      collection(db, 'projects'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );
    const groupQ = query(
      collection(db, 'adGroups'),
      where('uploadedBy', '==', auth.currentUser.uid)
    );

    const unsubProj = onSnapshot(
      projQ,
      (snap) => {
        const all = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: d.data().createdAt?.toDate(),
        }));
        setProjDocs(all);
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsubGroup = onSnapshot(groupQ, (snap) => {
      setGroups(snap.docs.map((g) => ({ id: g.id, ...g.data() })));
    });

    return () => {
      unsubProj();
      unsubGroup();
    };
  }, []);

  useEffect(() => {
    const groupMap = {};
    groups.forEach((g) => {
      groupMap[`${g.brandCode}|${g.name}`] = g;
    });
    const merged = projDocs.map((p) => {
      const key = `${p.brandCode}|${p.title}`;
      return { ...p, group: groupMap[key] };
    });
    setProjects(uniqueById(merged));
  }, [projDocs, groups]);

  const handleCreated = (proj) => {
    setModalStep(null);
    if (proj) {
      navigate(`/projects/${proj.id}/staging`);
    }
  };
  const displayProjects = projects.filter((p) => {
    const status = p.group ? p.group.status : p.status;
    return view === 'archived' ? status === 'archived' : status !== 'archived';
  });

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
                  title="Generate a Brief"
                  desc="Craft your own brief. Choose copy, visuals and layouts"
                  onClick={() => setModalStep('brief')}
                />
              </div>
            <div className="flex gap-2 mt-6">
              <TabButton active={view === 'current'} onClick={() => setView('current')}>
                Current
              </TabButton>
              <TabButton active={view === 'archived'} onClick={() => setView('archived')}>
                Archived
              </TabButton>
            </div>
            </div>
            {displayProjects.length > 0 && (
              <div className="space-y-3 max-w-xl w-full mx-auto">
                {displayProjects.map((p) => (
                  <div
                    key={p.id}
                    className="border rounded p-4 flex justify-between items-center cursor-pointer"
                    onClick={() =>
                      navigate(
                        p.group ? `/projects/${p.id}` : `/projects/${p.id}/staging`
                      )
                    }
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{p.title}</span>
                      {brandCodes.length > 1 && p.brandCode && (
                        <span className="text-xs text-gray-500">{p.brandCode}</span>
                      )}
                    </div>
                    <span className="text-sm text-gray-500">
                      {p.group ? p.group.status : p.status}
                    </span>
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
