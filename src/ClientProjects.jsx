import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  getDoc,
  getDocs,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db, auth } from './firebase/config';
import Modal from './components/Modal.jsx';
import RecipePreview from './RecipePreview.jsx';
import DescribeProjectModal from './DescribeProjectModal.jsx';
import OptimizedImage from './components/OptimizedImage.jsx';
import useSiteSettings from './useSiteSettings';
import { hexToRgba } from './utils/theme.js';
import { FiFileText } from 'react-icons/fi';
import { FilePlus } from 'lucide-react';
import TabButton from './components/TabButton.jsx';
import SortButton from './components/SortButton.jsx';
import { uploadFile } from './uploadFile.js';
import { deductRecipeCredits } from './utils/credits.js';
import useUserRole from './useUserRole';
import useAgencyTheme from './useAgencyTheme';

const OptionButton = ({ icon: Icon, title, desc, onClick }) => (
  <button
    className="border rounded-xl p-4 text-left hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] bg-white dark:bg-[var(--dark-sidebar-bg)] flex flex-col items-start w-full"
    onClick={onClick}
  >
    <div className="text-2xl mb-2">
      <Icon />
    </div>
    <span className="font-semibold mb-1">{title}</span>
    <p className="text-sm text-gray-600 dark:text-gray-300">{desc}</p>
  </button>
);

const CreateProjectModal = ({
  onClose,
  brandCodes = [],
  allowedRecipeTypes = [],
}) => {
  const [title, setTitle] = useState('');
  const [step, setStep] = useState(1);
  const [brandCode, setBrandCode] = useState(brandCodes[0] || '');
  const { agencyId } = useUserRole(auth.currentUser?.uid);

  const handleSave = async (
    recipes,
    briefNote,
    briefAssets,
    month,
    dueDate
  ) => {
    if (!brandCode) {
      console.warn('handleSave called without brandCode');
    }
    if (!title.trim()) {
      window.alert('Please enter a title before saving.');
      return;
    }
    try {
      const projRef = await addDoc(collection(db, 'projects'), {
        title: title.trim(),
        recipeTypes: Array.isArray(recipes) ? recipes.map((r) => r.type) : [],
        brandCode,
        status: 'briefed',
        createdAt: serverTimestamp(),
        userId: auth.currentUser?.uid || null,
        agencyId: agencyId || null,
        ...(month ? { month } : {}),
        ...(dueDate
          ? { dueDate: Timestamp.fromDate(new Date(dueDate)) }
          : {}),
      });

      const groupRef = await addDoc(collection(db, 'adGroups'), {
        name: title.trim(),
        brandCode,
        status: 'briefed',
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
        month: month || null,
        dueDate: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
        ...(briefNote ? { notes: briefNote } : {}),
      });

      await updateDoc(projRef, { groupId: groupRef.id });

      if (Array.isArray(briefAssets) && briefAssets.length > 0) {
        for (const file of briefAssets) {
          try {
            const url = await uploadFile(
              file,
              groupRef.id,
              brandCode,
              title.trim(),
            );
            await addDoc(collection(db, 'adGroups', groupRef.id, 'groupAssets'), {
              filename: file.name,
              firebaseUrl: url,
              uploadedAt: serverTimestamp(),
              brandCode,
              note: '',
            });
          } catch (err) {
            console.error('Brief upload failed', err);
          }
        }
      }

      if (Array.isArray(recipes) && recipes.length > 0) {
        const typeIds = [...new Set(recipes.map((r) => r.type).filter(Boolean))];
        const costMap = {};
        for (const t of typeIds) {
          try {
            const snap = await getDoc(doc(db, 'recipeTypes', t));
            costMap[t] =
              snap.exists() && typeof snap.data().creditCost === 'number'
                ? snap.data().creditCost
                : 0;
          } catch {
            costMap[t] = 0;
          }
        }
        const batch = writeBatch(db);
        recipes.forEach((r) => {
          const cost = costMap[r.type] || 0;
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
              creditsCharged: cost > 0,
            },
            { merge: true }
          );
        });
        await batch.commit();
        for (const r of recipes) {
          const cost = costMap[r.type] || 0;
          if (cost > 0) {
            await deductRecipeCredits(
              r.brandCode || brandCode,
              cost,
              `${groupRef.id}_${r.recipeNo}`
            );
          }
        }
      }

      onClose({
        id: projRef.id,
        title: title.trim(),
        status: 'briefed',
        recipeTypes: Array.isArray(recipes) ? recipes.map((r) => r.type) : [],
        createdAt: new Date(),
        groupId: groupRef.id,
      });
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
        allowedTypeIds={allowedRecipeTypes}
        title={title}
        onTitleChange={setTitle}
        onStepChange={setStep}
        onBrandCodeChange={setBrandCode}
        showBriefExtras
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
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalStep, setModalStep] = useState(null); // null | 'brief' | 'describe'
  const [view, setView] = useState('current');
  const [filter, setFilter] = useState('');
  const [sortField, setSortField] = useState('createdAt');
  const navigate = useNavigate();
  const location = useLocation();
  const { settings, loading: settingsLoading } = useSiteSettings();
  const monthColors = settingsLoading ? {} : settings.monthColors || {};
  const tagStrokeWeight = settings.tagStrokeWeight ?? 1;
  const { agencyId } = useUserRole(auth.currentUser?.uid);
  const { agency } = useAgencyTheme(agencyId);

  useEffect(() => {
    if (location.state?.removedProject) {
      const id = location.state.removedProject;
      setProjects((list) => list.filter((p) => p.id !== id));
      setProjDocs((list) => list.filter((p) => p.id !== id));
      navigate('/projects', { replace: true });
    }
  }, [location.state, navigate]);

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
    const reqQ = query(
      collection(db, 'requests'),
      where('createdBy', '==', auth.currentUser.uid)
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
      Promise.all(
        snap.docs.map(async (g) => {
          const data = g.data();
          let recipeCount = data.recipeCount;
          if (recipeCount == null) {
            try {
              const rSnap = await getDocs(
                collection(db, 'adGroups', g.id, 'recipes')
              );
              recipeCount = rSnap.size;
            } catch {
              recipeCount = 0;
            }
          }
          return { id: g.id, ...data, recipeCount };
        })
      ).then(setGroups);
    });
    const unsubReq = onSnapshot(reqQ, (snap) => {
      setRequests(snap.docs.map((r) => ({ id: r.id, ...r.data() })));
    });

    return () => {
      unsubProj();
      unsubGroup();
      unsubReq();
    };
  }, []);

  useEffect(() => {
    const groupMap = {};
    groups.forEach((g) => {
      groupMap[g.id] = g;
    });
    const requestMap = {};
    requests.forEach((r) => {
      requestMap[r.projectId] = r;
    });
    const merged = projDocs.map((p) => {
      return { ...p, group: groupMap[p.groupId], request: requestMap[p.id] };
    });
    setProjects(uniqueById(merged));
  }, [projDocs, groups, requests]);

  const handleCreated = (proj) => {
    setModalStep(null);
    if (proj) {
      navigate(`/projects/${proj.id}/staging`);
    }
  };
  const term = filter.toLowerCase();
  const displayProjects = projects
    .filter((p) => {
      const status = p.group ? p.group.status : p.status;
      return view === 'archived' ? status === 'archived' : status !== 'archived';
    })
    .filter(
      (p) =>
        !term ||
        (p.title || '').toLowerCase().includes(term) ||
        (p.brandCode || '').toLowerCase().includes(term)
    )
    .sort((a, b) => {
      if (sortField === 'title') return (a.title || '').localeCompare(b.title || '');
      if (sortField === 'status') {
        const statusA = (a.group ? a.group.status : a.status) || '';
        const statusB = (b.group ? b.group.status : b.status) || '';
        return statusA.localeCompare(statusB);
      }
      return (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0);
    });

  const firstName = auth.currentUser?.displayName?.split(' ')[0];
  const introText = firstName
    ? `Hey ${firstName}, how would you like to start?`
    : 'How would you like to start?';

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
              <h1 className="text-2xl mb-4">{introText}</h1>
              {(() => {
                const describeEnabled = agency.enableDescribeProject !== false;
                const briefEnabled = agency.enableGenerateBrief !== false;
                const optionCount = (describeEnabled ? 1 : 0) + (briefEnabled ? 1 : 0);
                return (
                  <div
                    className={`grid grid-cols-1 gap-4 w-full justify-items-center ${
                      optionCount > 1 ? 'sm:grid-cols-2' : ''
                    }`}
                  >
                    {describeEnabled && (
                      <OptionButton
                        icon={FiFileText}
                        title="Describe Project"
                        desc="Just tell us what you need. We'll generate a brief"
                        onClick={() => setModalStep('describe')}
                      />
                    )}
                    {briefEnabled && (
                      <OptionButton
                        icon={FilePlus}
                        title="Create Project"
                        desc="Craft your own brief. Choose copy, visuals and layouts"
                        onClick={() => setModalStep('brief')}
                      />
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-6 justify-center">
              <TabButton active={view === 'current'} onClick={() => setView('current')}>
                Current
              </TabButton>
              <TabButton active={view === 'archived'} onClick={() => setView('archived')}>
                Archived
              </TabButton>
              <input
                type="text"
                placeholder="Filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="p-1 border rounded"
              />
              <SortButton
                value={sortField}
                onChange={setSortField}
                options={[
                  { value: 'createdAt', label: 'Date Added' },
                  { value: 'title', label: 'Title' },
                  { value: 'status', label: 'Status' },
                ]}
              />
            </div>
            {displayProjects.length > 0 && (
              <div className="space-y-3 max-w-xl w-full mx-auto">
                {displayProjects.map((p) => {
                  const status = p.group ? p.group.status : p.status;
                  const adCount = p.group ? p.group.recipeCount : p.request?.numAds;
                  const rawMonth = p.group?.month || p.month;
                  const monthLabel = rawMonth
                    ? new Date(
                        Number(rawMonth.slice(0, 4)),
                        Number(rawMonth.slice(-2)) - 1,
                        1
                      ).toLocaleString('default', {
                        month: 'short',
                      })
                    : null;
                  const monthColorEntry = rawMonth
                    ? monthColors[rawMonth.slice(-2)]
                    : null;
                  const monthColor =
                    typeof monthColorEntry === 'string'
                      ? monthColorEntry
                      : monthColorEntry?.color;
                  const monthOpacity =
                    monthColorEntry && typeof monthColorEntry === 'object'
                      ? monthColorEntry.opacity
                      : 1;
                  const monthTextColor =
                    monthColorEntry && typeof monthColorEntry === 'object'
                      ? monthColorEntry.textColor
                      : '#000000';
                  return (
                    <div
                      key={p.id}
                      className="border rounded-xl p-4 flex justify-between items-center cursor-pointer bg-white hover:bg-gray-50 dark:bg-[var(--dark-sidebar-bg)] dark:hover:bg-[var(--dark-sidebar-hover)]"
                      onClick={() =>
                        navigate(
                          p.group ? `/projects/${p.id}` : `/projects/${p.id}/staging`
                        )
                      }
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{p.title}</span>
                        {brandCodes.length > 1 && p.brandCode && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">{p.brandCode}</span>
                        )}
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {status === 'processing' ? (
                            <span
                              className="processing-dots"
                              aria-label="processing"
                            />
                          ) : (
                            status
                          )}
                        </span>
                        {(adCount != null || monthLabel) && (
                          <div className="flex gap-2 mt-1">
                            {adCount != null && (
                              <span className="tag-pill px-2 py-0.5 text-xs">{adCount}</span>
                            )}
                            {monthLabel && (
                              <span
                                className="tag-pill px-2 py-0.5 text-xs"
                                style={{
                                  backgroundColor:
                                    monthColor &&
                                    monthOpacity < 1 &&
                                    monthColor.startsWith('#')
                                      ? hexToRgba(monthColor, monthOpacity)
                                      : monthColor,
                                  color: monthTextColor,
                                  borderColor: monthTextColor,
                                  borderWidth: tagStrokeWeight,
                                  borderStyle: 'solid',
                                }}
                              >
                                {monthLabel}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
      {modalStep === 'brief' && (
        <CreateProjectModal
          onClose={handleCreated}
          brandCodes={brandCodes}
          allowedRecipeTypes={agency.allowedRecipeTypes || []}
        />
      )}
      {modalStep === 'describe' && agency.enableDescribeProject !== false && (
        <DescribeProjectModal onClose={handleCreated} brandCodes={brandCodes} />
      )}
    </div>
  );
};

export default ClientProjects;
