import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase/config';
import OptimizedImage from './components/OptimizedImage.jsx';
import RecipeTypeCard from './components/RecipeTypeCard.jsx';
import RecipePreview from './RecipePreview.jsx';
import StatusBadge from './components/StatusBadge.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import isVideoUrl from './utils/isVideoUrl';
import DescribeProjectModal from './DescribeProjectModal.jsx';

const ProjectDetail = () => {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [groupId, setGroupId] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [typesMap, setTypesMap] = useState({});
  const [assets, setAssets] = useState([]);
  const [showBrief, setShowBrief] = useState(false);
  const [showAllAssets, setShowAllAssets] = useState(false);
  const galleryRef = useRef(null);
  const [columns, setColumns] = useState(0);
  const [request, setRequest] = useState(null);
  const [editRequest, setEditRequest] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'projects', projectId));
        if (!snap.exists()) {
          setProject(null);
          return;
        }
        const data = snap.data();
        const proj = {
          id: snap.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
        };
        setProject(proj);

        // fetch matching ad group
        const gSnap = await getDocs(
          query(
            collection(db, 'adGroups'),
            where('name', '==', proj.title),
            where('brandCode', '==', proj.brandCode),
            where('uploadedBy', '==', proj.userId)
          )
        );
        if (!gSnap.empty) {
          const g = gSnap.docs[0];
          setGroupId(g.id);

          const rSnap = await getDocs(collection(db, 'adGroups', g.id, 'recipes'));
          setRecipes(
            rSnap.docs.map((d, idx) => ({ recipeNo: idx + 1, id: d.id, ...d.data() }))
          );

          const aSnap = await getDocs(collection(db, 'adGroups', g.id, 'assets'));
          setAssets(aSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } else {
          const reqSnap = await getDocs(
            query(collection(db, 'requests'), where('projectId', '==', projectId))
          );
          if (!reqSnap.empty) {
            const r = reqSnap.docs[0];
            setRequest({ id: r.id, ...r.data() });
          }
        }

        if (proj.recipeTypes && proj.recipeTypes.length > 0) {
          const typeSnap = await getDocs(
            query(collection(db, 'recipeTypes'), where('__name__', 'in', proj.recipeTypes.slice(0, 10)))
          );
          const map = {};
          typeSnap.docs.forEach((d) => {
            map[d.id] = { id: d.id, ...d.data() };
          });
          setTypesMap(map);
        }
      } catch (err) {
        console.error('Failed to load project', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId]);

  const updateLayout = () => {
    if (typeof window === 'undefined') return;
    const gallery = galleryRef.current;
    if (!gallery) return;
    const style = window.getComputedStyle(gallery);
    const rowHeight = parseInt(style.getPropertyValue('grid-auto-rows'));
    const rowGap = parseInt(style.getPropertyValue('row-gap'));
    const colCount = style.getPropertyValue('grid-template-columns').split(' ').length;
    setColumns(colCount);
    Array.from(gallery.children).forEach((child) => {
      const img = child.querySelector('img');
      if (img) {
        const h = img.getBoundingClientRect().height;
        const span = Math.ceil((h + rowGap) / (rowHeight + rowGap));
        child.style.gridRowEnd = `span ${span}`;
      }
    });
  };

  useEffect(() => {
    updateLayout();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateLayout);
      return () => window.removeEventListener('resize', updateLayout);
    }
    return undefined;
  }, [assets]);

  const saveRecipes = async (list) => {
    if (!groupId || !Array.isArray(list)) return;
    try {
      const batch = writeBatch(db);
      list.forEach((r) => {
        const ref = doc(db, 'adGroups', groupId, 'recipes', String(r.recipeNo));
        batch.set(
          ref,
          {
            components: r.components,
            copy: r.copy,
            assets: r.assets || [],
            type: r.type || '',
            selected: r.selected || false,
            brandCode: r.brandCode || project.brandCode || '',
          },
          { merge: true }
        );
      });
      await batch.commit();
      setRecipes(list);
    } catch (err) {
      console.error('Failed to save recipes', err);
    }
  };

  if (loading) return <div className="min-h-screen p-4">Loading...</div>;
  if (!project) return <div className="min-h-screen p-4">Project not found.</div>;

  if (!groupId && request) {
    return (
      <div className="min-h-screen p-4 w-full max-w-[60rem] mx-auto">
        <div className="flex items-center mb-4">
          <Link to="/projects" className="btn-arrow mr-2" aria-label="Back">
            &lt;
          </Link>
        </div>
        <div className="border rounded p-4 max-w-[60rem] space-y-1">
          <h1 className="text-xl font-semibold mb-1">{request.title || 'New Ads Ticket'}</h1>
          {request.brandCode && <p className="mb-0">Brand: {request.brandCode}</p>}
          {request.dueDate && (
            <p className="mb-0">
              Due Date:{' '}
              {request.dueDate.toDate
                ? request.dueDate.toDate().toLocaleDateString()
                : new Date(request.dueDate).toLocaleDateString()}
            </p>
          )}
          <p className="mb-0"># Ads: {request.numAds}</p>
          {request.details && (
            <div
              className="text-sm"
              dangerouslySetInnerHTML={{ __html: request.details }}
            />
          )}
          <button className="btn-primary mt-2" onClick={() => setEditRequest(true)}>
            Edit
          </button>
        </div>
        {editRequest && (
          <DescribeProjectModal
            onClose={(updated) => {
              setEditRequest(false);
              if (updated) {
                setRequest((r) => ({ ...r, ...updated }));
                setProject((p) => ({ ...p, title: updated.title, brandCode: updated.brandCode }));
              }
            }}
            brandCodes={[project.brandCode]}
            request={{ ...request, projectId: project.id, id: request.id }}
          />
        )}
      </div>
    );
  }

  const visibleAssets = showAllAssets
    ? assets
    : assets.slice(0, columns || assets.length);

  return (
    <div className="min-h-screen p-4 w-full max-w-[60rem] mx-auto">
      <div className="flex items-center mb-4">
        <Link to="/projects" className="btn-arrow mr-2" aria-label="Back">
          &lt;
        </Link>
      </div>
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <div className="border rounded p-4 flex-1 max-w-[60rem]">
          <h1 className="text-xl font-semibold mb-1">{project.title}</h1>
          {project.createdAt && (
            <p className="text-sm text-gray-600 mb-2">
              Submitted {project.createdAt.toLocaleString()}
            </p>
          )}
          <p className="text-sm text-gray-600">
            {recipes.length} recipe{recipes.length === 1 ? '' : 's'}
          </p>
        </div>
        {project.recipeTypes && project.recipeTypes.length > 0 && (
          <div className="border rounded p-4 flex items-center justify-center max-w-[60rem]">
            <RecipeTypeCard
              className="bg-transparent border-none shadow-none"
              type={
                typesMap[project.recipeTypes[0]] || {
                  id: project.recipeTypes[0],
                  name: project.recipeTypes[0],
                }
              }
              size="small"
            />
          </div>
        )}
        <div className="border rounded p-4 flex items-center justify-center max-w-[60rem]">
          <StatusBadge status={project.status} />
        </div>
      </div>
      <div className="space-y-4">
        <div className="border rounded p-4 max-w-[60rem]">
          <button className="font-medium" onClick={() => setShowBrief((s) => !s)}>
            {showBrief ? 'Hide Brief' : 'View Brief'}
          </button>
          {showBrief && (
            <div className="mt-4">
              <RecipePreview
                onSave={saveRecipes}
                initialResults={recipes}
                showOnlyResults
                brandCode={project.brandCode}
                hideBrandSelect
                showColumnButton={false}
                externalOnly
              />
            </div>
          )}
        </div>
        <div className="border rounded p-4 max-w-[60rem]">
          <h2 className="font-medium mb-2">Gallery</h2>
          {assets.length === 0 ? (
            <p>No assets uploaded yet.</p>
          ) : (
            <>
              <div className="asset-gallery mt-2" ref={galleryRef}>
                {visibleAssets.map((a) => (
                  <div key={a.id} className="asset-gallery-item">
                    {isVideoUrl(a.firebaseUrl || a.url) ? (
                      <VideoPlayer
                        src={a.firebaseUrl || a.url}
                        poster={a.thumbnailUrl}
                        className="w-full h-auto object-contain"
                        onLoadedData={updateLayout}
                      />
                    ) : (
                      <OptimizedImage
                        pngUrl={a.thumbnailUrl || a.url || a.firebaseUrl}
                        alt={a.name || 'asset'}
                        className="w-full h-auto object-contain"
                        onLoad={updateLayout}
                      />
                    )}
                  </div>
                ))}
              </div>
              {!showAllAssets && assets.length > visibleAssets.length && (
                <button
                  type="button"
                  className="text-sm text-accent mt-2"
                  onClick={() => setShowAllAssets(true)}
                >
                  View More
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectDetail;
