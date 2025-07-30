import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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
import useSiteSettings from './useSiteSettings';
import OptimizedImage from './components/OptimizedImage.jsx';
import RecipeTypeCard from './components/RecipeTypeCard.jsx';
import RecipePreview from './RecipePreview.jsx';
import StatusBadge from './components/StatusBadge.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import isVideoUrl from './utils/isVideoUrl';

const ProjectDetail = () => {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [groupId, setGroupId] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [typesMap, setTypesMap] = useState({});
  const [assets, setAssets] = useState([]);
  const [showBrief, setShowBrief] = useState(false);
  const { settings } = useSiteSettings();

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

  return (
    <div className="min-h-screen p-4 w-full">
      {settings.artworkUrl && (
        <div className="w-full mt-4 max-h-40 overflow-hidden rounded mb-6">
          <OptimizedImage
            pngUrl={settings.artworkUrl}
            alt="Artwork"
            loading="eager"
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <div className="border rounded p-4 flex-1">
          <h1 className="text-xl font-semibold mb-1">{project.title}</h1>
          {project.createdAt && (
            <p className="text-sm text-gray-600 mb-2">
              Submitted {project.createdAt.toLocaleString()}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mb-2">
            {(project.recipeTypes || []).map((id) => {
              const type = typesMap[id] || { id, name: id };
              return <RecipeTypeCard key={id} type={type} className="w-24" />;
            })}
          </div>
          <p className="text-sm text-gray-600">
            {recipes.length} recipe{recipes.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="border rounded p-4 flex items-center justify-center">
          <StatusBadge status={project.status} />
        </div>
      </div>
      <div className="space-y-4">
        <div className="border rounded p-4">
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
              />
            </div>
          )}
        </div>
        <div className="border rounded p-4">
          <h2 className="font-medium mb-2">Gallery</h2>
          {assets.length === 0 ? (
            <p>No assets uploaded yet.</p>
          ) : (
            <div className="asset-gallery mt-2">
              {assets.map((a) => (
                <div key={a.id} className="asset-gallery-item">
                  {isVideoUrl(a.firebaseUrl || a.url) ? (
                    <VideoPlayer
                      src={a.firebaseUrl || a.url}
                      poster={a.thumbnailUrl}
                      className="w-full h-auto object-contain"
                    />
                  ) : (
                    <OptimizedImage
                      pngUrl={a.thumbnailUrl || a.url || a.firebaseUrl}
                      alt={a.name || 'asset'}
                      className="w-full h-auto object-contain"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectDetail;
