import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, Link, Navigate, useNavigate } from 'react-router-dom';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  writeBatch,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from './firebase/config';
import OptimizedImage from './components/OptimizedImage.jsx';
import RecipeTypeCard from './components/RecipeTypeCard.jsx';
import RecipePreview from './RecipePreview.jsx';
import StatusBadge from './components/StatusBadge.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import isVideoUrl from './utils/isVideoUrl';

const ProjectDetail = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
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

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'projects', projectId));
        if (!snap.exists()) {
          navigate('/projects', {
            replace: true,
            state: { removedProject: projectId },
          });
          return;
        }
        const data = snap.data();
        const proj = {
          id: snap.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
        };
        setProject(proj);

        // fetch ad group for this project
        const gSnap = await getDocs(
          query(collection(db, 'adGroups'), where('projectId', '==', projectId))
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
            query(
              collection(db, 'recipeTypes'),
              where('__name__', 'in', proj.recipeTypes.slice(0, 10))
            )
          );
          const map = {};
          typeSnap.docs.forEach((d) => {
            map[d.id] = { id: d.id, ...d.data() };
          });
          setTypesMap(map);
        }
      } catch (err) {
        console.error('Failed to load project', err);
      }
      setLoading(false);
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

  const crcTable = useMemo(() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    return table;
  }, []);

  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };

  const sanitize = (str) =>
    (str || '')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim() || 'unknown';

  const makeZip = async (files) => {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    for (const f of files) {
      const nameBuf = encoder.encode(f.path);
      const data = new Uint8Array(f.data);
      const crc = crc32(data);
      const local = new Uint8Array(30 + nameBuf.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBuf.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBuf, 30);
      localParts.push(local, data);

      const central = new Uint8Array(46 + nameBuf.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBuf.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      central.set(nameBuf, 46);
      centralParts.push(central);
      offset += local.length + data.length;
    }
    const centralOffset = offset;
    const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, centralOffset, true);
    ev.setUint16(20, 0, true);
    const size =
      localParts.reduce((s, p) => s + p.length, 0) + centralSize + end.length;
    const zip = new Uint8Array(size);
    let ptr = 0;
    for (const part of localParts) {
      zip.set(part, ptr);
      ptr += part.length;
    }
    for (const part of centralParts) {
      zip.set(part, ptr);
      ptr += part.length;
    }
    zip.set(end, ptr);
    return new Blob([zip], { type: 'application/zip' });
  };

  const approvedAssets = assets.filter((a) => a.status === 'approved');

  const handleDownload = async () => {
    if (approvedAssets.length === 0) return;
    try {
      const files = [];
      const base = `${sanitize(project?.brandCode)}_${sanitize(project?.title)}`;
      for (const a of approvedAssets) {
        const resp = await fetch(a.firebaseUrl || a.url);
        const buf = await resp.arrayBuffer();
        const fname = sanitize(a.filename || a.name || a.id);
        files.push({ path: fname, data: buf });
      }
      const blob = await makeZip(files);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${base}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
    }
  };

  const handleArchive = async () => {
    if (!groupId) return;
    if (!window.confirm('Archive this project?')) return;
    try {
      await updateDoc(doc(db, 'adGroups', groupId), {
        status: 'archived',
        archivedAt: serverTimestamp(),
        archivedBy: auth.currentUser?.uid || null,
      });
      navigate('/projects');
    } catch (err) {
      console.error('Failed to archive group', err);
    }
  };

  const reviewDisabled = assets.length === 0;
  const downloadDisabled = approvedAssets.length === 0;

  if (loading) return <div className="min-h-screen p-4">Loading...</div>;
  if (!project) return <div className="min-h-screen p-4">Project not found.</div>;

  if (!groupId && request) {
    return <Navigate to={`/projects/${projectId}/staging`} replace />;
  }

  const visibleAssets = showAllAssets
    ? assets
    : assets.slice(0, columns || assets.length);

  return (
    <div className="min-h-screen p-4 w-full max-w-[60rem] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Link to="/projects" className="btn-arrow mr-2" aria-label="Back">
          &lt;
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to={`/review/${groupId}`}
            className={`btn-secondary ${reviewDisabled ? 'opacity-50 pointer-events-none' : ''}`}
          >
            Review Link
          </Link>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloadDisabled}
            className={`btn-secondary ${downloadDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Download approved assets
          </button>
          <button type="button" onClick={handleArchive} className="btn-secondary">
            Archive
          </button>
        </div>
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
