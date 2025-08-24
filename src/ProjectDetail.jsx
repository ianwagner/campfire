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
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  addDoc,
  updateDoc,
  setDoc,
  Timestamp,
  deleteField,
} from 'firebase/firestore';
import { db } from './firebase/config';
import OptimizedImage from './components/OptimizedImage.jsx';
import RecipeTypeCard from './components/RecipeTypeCard.jsx';
import RecipePreview from './RecipePreview.jsx';
import StatusBadge from './components/StatusBadge.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import PageWrapper from './components/PageWrapper.jsx';
import PageToolbar from './components/PageToolbar.jsx';
import LoadingOverlay from './LoadingOverlay.jsx';
import Button from './components/Button.jsx';
import IconButton from './components/IconButton.jsx';
import TabButton from './components/TabButton.jsx';
import Table from './components/common/Table.jsx';
import ShareLinkModal from './components/ShareLinkModal.jsx';
import Modal from './components/Modal.jsx';
import CopyRecipePreview from './CopyRecipePreview.jsx';
import DescribeProjectModal from './DescribeProjectModal.jsx';
import {
  FiLink,
  FiDownload,
  FiArchive,
  FiFile,
  FiPenTool,
  FiFileText,
  FiType,
  FiGrid,
  FiList,
  FiCheck,
  FiEye,
  FiEyeOff,
} from 'react-icons/fi';
import { Bubbles } from 'lucide-react';
import { archiveGroup } from './utils/archiveGroup';
import createArchiveTicket from './utils/createArchiveTicket';
import isVideoUrl from './utils/isVideoUrl';
import stripVersion from './utils/stripVersion';
import { deductRecipeCredits } from './utils/credits.js';
import { uploadFile } from './uploadFile.js';
import DueDateMonthSelector from './components/DueDateMonthSelector.jsx';
import computeGroupStatus from './utils/computeGroupStatus';

const fileExt = (name) => {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
};

const PlaceholderIcon = ({ ext }) => {
  let Icon = FiFile;
  if (ext === 'ai') Icon = FiPenTool;
  else if (ext === 'pdf') Icon = FiFileText;
  else if (['otf', 'ttf', 'woff', 'woff2'].includes(ext)) Icon = FiType;
  return (
    <div className="w-40 h-32 flex items-center justify-center bg-accent-10 text-accent rounded">
      <Icon size={32} />
    </div>
  );
};

const statusColorMap = {
  new: 'var(--pending-color)',
  pending: 'var(--pending-color)',
  processing: 'var(--pending-color)',
  briefed: 'var(--pending-color)',
  ready: 'var(--accent-color)',
  approved: 'var(--approve-color)',
  rejected: 'var(--reject-color)',
  edit_requested: 'var(--edit-color)',
  archived: 'var(--table-row-alt-bg)',
  draft: 'var(--pending-color)',
  in_design: 'var(--accent-color)',
  edit_request: 'var(--edit-color)',
  need_info: 'var(--edit-color)',
  done: 'var(--approve-color)',
  mixed: 'var(--edit-color)',
};

const getStatusColor = (status) => {
  if (!status) return 'var(--pending-color)';
  const sanitized = String(status).replace(/\s+/g, '_').toLowerCase();
  return statusColorMap[sanitized] || 'var(--pending-color)';
};

const ProjectDetail = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [groupId, setGroupId] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [typesMap, setTypesMap] = useState({});
  const [assets, setAssets] = useState([]);
  const [briefAssets, setBriefAssets] = useState([]);
  const [briefNote, setBriefNote] = useState('');
  const [showBrief, setShowBrief] = useState(false);
  const [briefLoading, setBriefLoading] = useState(false);
  const [showAllAssets, setShowAllAssets] = useState(false);
  const galleryRef = useRef(null);
  const [columns, setColumns] = useState(0);
  const [request, setRequest] = useState(null);
  const [group, setGroup] = useState(null);
  const [shareModal, setShareModal] = useState(false);
  const [copyCards, setCopyCards] = useState([]);
  const [copyDraft, setCopyDraft] = useState([]);
  const [editingBrief, setEditingBrief] = useState(false);
  const [editingCopy, setEditingCopy] = useState(false);
  const [newBriefFiles, setNewBriefFiles] = useState([]);
  const [viewMode, setViewMode] = useState('table');
  const [editRequest, setEditRequest] = useState(false);
  const [showCopySection, setShowCopySection] = useState(false);

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

        let typeIds = Array.isArray(proj.recipeTypes) ? [...proj.recipeTypes] : [];

        // fetch ad group for this project
        const gSnap = await getDocs(
          query(collection(db, 'adGroups'), where('projectId', '==', projectId))
        );
        if (!gSnap.empty) {
          const g = gSnap.docs[0];
          const gData = g.data();
          setGroupId(g.id);
          setGroup({ id: g.id, ...gData });
          setProject((prev) =>
            prev ? { ...prev, status: gData.status } : prev
          );

          const rSnap = await getDocs(collection(db, 'adGroups', g.id, 'recipes'));
          const recipeList = rSnap.docs.map((d, idx) => ({
            recipeNo: idx + 1,
            id: d.id,
            ...d.data(),
          }));
          setRecipes(recipeList);

          if (typeIds.length === 0) {
            typeIds = [
              ...new Set(
                recipeList
                  .map((r) => r.type)
                  .filter((t) => typeof t === 'string' && t)
              ),
            ];
            if (typeIds.length > 0) {
              setProject((prev) =>
                prev ? { ...prev, recipeTypes: typeIds } : prev
              );
            }
          }

          const aSnap = await getDocs(collection(db, 'adGroups', g.id, 'assets'));
          setAssets(aSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

          setBriefNote(gData.notes || '');
          const bSnap = await getDocs(
            collection(db, 'adGroups', g.id, 'groupAssets')
          );
          setBriefAssets(bSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } else {
          const reqSnap = await getDocs(
            query(collection(db, 'requests'), where('projectId', '==', projectId))
          );
          if (!reqSnap.empty) {
            const r = reqSnap.docs[0];
            setRequest({ id: r.id, ...r.data() });
          }
        }

        if (typeIds.length > 0) {
          const typeSnap = await getDocs(
            query(
              collection(db, 'recipeTypes'),
              where('__name__', 'in', typeIds.slice(0, 10))
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

  useEffect(() => {
    if (!groupId) return;
    const unsub = onSnapshot(doc(db, 'adGroups', groupId), (snap) => {
      const data = snap.data();
      setProject((prev) =>
        prev ? { ...prev, status: data?.status || prev.status } : prev
      );
      setGroup((prev) => (data ? { ...prev, ...data } : prev));
    });
    return () => unsub();
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    const unsub = onSnapshot(
      collection(db, 'adGroups', groupId, 'assets'),
      (snap) => {
        setAssets(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    );
    return () => unsub();
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    const unsub = onSnapshot(
      collection(db, 'adGroups', groupId, 'copyCards'),
      (snap) => {
        setCopyCards(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); 
      }
    );
    return () => unsub();
  }, [groupId]);

  useEffect(() => {
    setEditingCopy(copyCards.length === 0);
    setCopyDraft(copyCards);
  }, [copyCards]);

  useEffect(() => {
    if (!groupId || assets.length === 0) return;
    const newStatus = computeGroupStatus(assets, false, false);
    if (newStatus !== group?.status) {
      updateDoc(doc(db, 'adGroups', groupId), { status: newStatus }).catch(
        (err) => console.error('Failed to update group status', err)
      );
      setGroup((p) => (p ? { ...p, status: newStatus } : p));
      setProject((p) => (p ? { ...p, status: newStatus } : p));
    }
  }, [assets, groupId, group?.status]);

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

  const handleToggleBrief = async () => {
    if (showBrief) {
      setShowBrief(false);
      setBriefLoading(false);
      setEditingBrief(false);
      setNewBriefFiles([]);
      return;
    }
    setBriefLoading(true);
    setShowBrief(true);
    try {
      if (recipes.length === 0 && groupId) {
        const rSnap = await getDocs(
          collection(db, 'adGroups', groupId, 'recipes')
        );
        setRecipes(
          rSnap.docs.map((d, idx) => ({ recipeNo: idx + 1, id: d.id, ...d.data() }))
        );
      }
      if (briefAssets.length === 0 && groupId) {
         const bSnap = await getDocs(
           collection(db, 'adGroups', groupId, 'groupAssets')
         );
         setBriefAssets(bSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
      if (!briefNote && groupId) {
        try {
          const g = await getDoc(doc(db, 'adGroups', groupId));
          setBriefNote(g.data()?.notes || '');
        } catch {}
      }
    } catch (err) {
      console.error('Failed to load brief', err);
      setShowBrief(false);
    } finally {
      setBriefLoading(false);
    }
  };

  const handleBriefFileChange = (e) => {
    setNewBriefFiles(Array.from(e.target.files || []));
  };

  const handleSaveBrief = async () => {
    if (!groupId) return;
    setBriefLoading(true);
    try {
      await updateDoc(doc(db, 'adGroups', groupId), {
        notes: briefNote,
        lastUpdated: serverTimestamp(),
      });
      if (newBriefFiles.length > 0) {
        for (const file of newBriefFiles) {
          try {
            const url = await uploadFile(
              file,
              groupId,
              group?.brandCode || project?.brandCode || '',
              group?.name || project?.title || ''
            );
            await addDoc(collection(db, 'adGroups', groupId, 'groupAssets'), {
              filename: file.name,
              firebaseUrl: url,
              uploadedAt: serverTimestamp(),
              brandCode: group?.brandCode || project?.brandCode || '',
              note: '',
            });
          } catch (err) {
            console.error('Brief upload failed', err);
          }
        }
        const bSnap = await getDocs(
          collection(db, 'adGroups', groupId, 'groupAssets')
        );
        setBriefAssets(bSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
      setNewBriefFiles([]);
      setEditingBrief(false);
    } catch (err) {
      console.error('Failed to save brief', err);
    } finally {
      setBriefLoading(false);
    }
  };

  const handleDeleteBriefAsset = async (id) => {
    if (!groupId) return;
    try {
      await deleteDoc(doc(db, 'adGroups', groupId, 'groupAssets', id));
      setBriefAssets((list) => list.filter((a) => a.id !== id));
    } catch (err) {
      console.error('Failed to delete brief asset', err);
    }
  };

  const saveCopyCards = async (list) => {
    if (!groupId || !Array.isArray(list)) return;
    try {
      const existingIds = copyCards.map((c) => c.id);
      const newIds = list.map((c) => c.id).filter(Boolean);
      const deletions = existingIds.filter((id) => !newIds.includes(id));
      await Promise.all(
        deletions.map((cid) =>
          deleteDoc(doc(db, 'adGroups', groupId, 'copyCards', cid))
        )
      );
      await Promise.all(
        list.map((c) => {
          const data = {
            primary: c.primary || '',
            headline: c.headline || '',
            description: c.description || '',
          };
          if (c.id) {
            return setDoc(
              doc(db, 'adGroups', groupId, 'copyCards', c.id),
              data,
              { merge: true }
            );
          }
          return addDoc(
            collection(db, 'adGroups', groupId, 'copyCards'),
            data
          );
        })
      );
      setEditingCopy(false);
    } catch (err) {
      console.error('Failed to save copy cards', err);
    }
  };

  const saveRecipes = async (list) => {
    if (!groupId || !Array.isArray(list)) return;
    try {
      const existingMap = new Map(recipes.map((r) => [r.recipeNo, r]));
      const typeIds = [...new Set(list.map((r) => r.type).filter(Boolean))];
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
      list.forEach((r) => {
        const cost = costMap[r.type] || 0;
        const already = existingMap.get(r.recipeNo)?.creditsCharged;
        const docId = r.id || String(r.recipeNo);
        const ref = doc(db, 'adGroups', groupId, 'recipes', docId);
        batch.set(
          ref,
          {
            components: r.components,
            copy: r.copy,
            assets: r.assets || [],
            type: r.type || '',
            selected: r.selected || false,
            brandCode: r.brandCode || project.brandCode || '',
            creditsCharged: already || cost > 0,
          },
          { merge: true }
        );
      });
      await batch.commit();
      for (const r of list) {
        const cost = costMap[r.type] || 0;
        const already = existingMap.get(r.recipeNo)?.creditsCharged;
        if (!already && cost > 0) {
          await deductRecipeCredits(
            r.brandCode || project.brandCode || '',
            cost,
            `${groupId}_${r.recipeNo}`
          );
        }
      }
      setRecipes(
        list.map((r) => ({
          ...r,
          id: r.id || String(r.recipeNo),
          creditsCharged:
            existingMap.get(r.recipeNo)?.creditsCharged || (costMap[r.type] || 0) > 0,
        }))
      );
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

  const galleryAssets = assets.filter((a) => a.status !== 'archived');
  const approvedAssets = galleryAssets.filter((a) => a.status === 'approved');

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

  const handleDelete = async () => {
    if (!window.confirm('Delete this project?')) return;
    try {
      await deleteDoc(doc(db, 'projects', projectId));
      navigate('/projects', {
        replace: true,
        state: { removedProject: projectId },
      });
    } catch (err) {
      console.error('Failed to delete project', err);
    }
  };

  const handleMarkReady = async () => {
    if (!groupId) return;
    const pending = assets.filter((a) => a.status === 'pending');
    if (pending.length === 0) return;
    try {
      const batch = writeBatch(db);
      pending.forEach((a) => {
        batch.update(doc(db, 'adGroups', groupId, 'assets', a.id), {
          status: 'ready',
        });
      });
      await batch.commit();
      setAssets((prev) =>
        prev.map((a) => (a.status === 'pending' ? { ...a, status: 'ready' } : a))
      );
    } catch (err) {
      console.error('Failed to mark pending ads ready', err);
    }
  };

  const handleScrub = async () => {
    if (!groupId) return;
    const hasPendingOrEdit = assets.some(
      (a) => a.status === 'pending' || a.status === 'edit_requested'
    );
    const confirmMsg = hasPendingOrEdit
      ? 'One or more ads are pending or have an active edit request. Would you still like to scrub them?'
      : 'Scrub review history? This will remove older revisions.';
    if (!window.confirm(confirmMsg)) return;
    try {
      const chains = {};
      assets.forEach((a) => {
        const root = a.parentAdId || a.id;
        if (!chains[root]) chains[root] = [];
        chains[root].push(a);
      });
      const batch = writeBatch(db);
      Object.entries(chains).forEach(([rootId, list]) => {
        const latest = list.reduce(
          (acc, cur) => (cur.version > acc.version ? cur : acc),
          list[0]
        );
        const update = {};
        if (list.length > 1) {
          list
            .filter((a) => a.id !== latest.id)
            .forEach((a) => {
              const dest = doc(
                db,
                'adGroups',
                groupId,
                'scrubbedHistory',
                rootId,
                'assets',
                a.id
              );
              batch.set(dest, { ...a, scrubbedAt: serverTimestamp() });
              batch.delete(doc(db, 'adGroups', groupId, 'assets', a.id));
            });
          update.version = 1;
          update.parentAdId = null;
          update.scrubbedFrom = rootId;
          if (latest.filename) {
            const idx = latest.filename.lastIndexOf('.');
            const ext = idx >= 0 ? latest.filename.slice(idx) : '';
            update.filename = stripVersion(latest.filename) + ext;
          }
        }
        if (hasPendingOrEdit) {
          if (latest.status === 'rejected' || latest.status === 'archived') {
            update.status = 'archived';
          } else {
            update.status = 'ready';
          }
        } else {
          if (latest.status === 'approved') update.status = 'ready';
          if (latest.status === 'rejected' || latest.status === 'archived')
            update.status = 'archived';
        }
        if (Object.keys(update).length > 0) {
          batch.update(
            doc(db, 'adGroups', groupId, 'assets', latest.id),
            update
          );
        }
      });
      for (const a of assets) {
        const snap = await getDocs(
          collection(db, 'adGroups', groupId, 'assets', a.id, 'history')
        );
        snap.forEach((h) => {
          batch.delete(
            doc(db, 'adGroups', groupId, 'assets', a.id, 'history', h.id)
          );
        });
      }
      await batch.commit();
      const groupsMap = {};
      assets.forEach((a) => {
        const root = a.parentAdId || a.id;
        if (!groupsMap[root]) groupsMap[root] = [];
        groupsMap[root].push(a);
      });
      const updatedAssets = [];
      Object.entries(groupsMap).forEach(([rootId, list]) => {
        const latest = list.reduce(
          (acc, cur) => (cur.version > acc.version ? cur : acc),
          list[0]
        );
        const updated = { ...latest };
        if (list.length > 1) {
          updated.version = 1;
          updated.parentAdId = null;
          updated.scrubbedFrom = rootId;
          if (latest.filename) {
            const idx = latest.filename.lastIndexOf('.');
            const ext = idx >= 0 ? latest.filename.slice(idx) : '';
            updated.filename = stripVersion(latest.filename) + ext;
          }
        }
        if (hasPendingOrEdit) {
          if (latest.status === 'rejected' || latest.status === 'archived') {
            updated.status = 'archived';
          } else {
            updated.status = 'ready';
          }
        } else {
          if (latest.status === 'approved') updated.status = 'ready';
          if (latest.status === 'rejected' || latest.status === 'archived')
            updated.status = 'archived';
        }
        updatedAssets.push(updated);
      });
      setAssets(updatedAssets);
      const newStatus = computeGroupStatus(updatedAssets, false, false);
      await updateDoc(doc(db, 'adGroups', groupId), { status: newStatus });
      setGroup((p) => ({ ...p, status: newStatus }));
    } catch (err) {
      console.error('Failed to scrub review history', err);
    }
  };

  const handleArchive = async () => {
    if (!groupId) return;
    if (!window.confirm('Archive this project?')) return;
    try {
      await archiveGroup(groupId);
      await createArchiveTicket({ target: 'adGroup', groupId, brandCode: project?.brandCode });
      navigate('/projects');
    } catch (err) {
      console.error('Failed to archive group', err);
    }
  };

  const handleDueDateChange = async (value) => {
    if (!groupId) return;
    const date = value ? Timestamp.fromDate(new Date(value)) : null;
    try {
      await updateDoc(doc(db, 'adGroups', groupId), { dueDate: date });
      setGroup((p) => ({ ...p, dueDate: date }));
      if (group?.requestId) {
        try {
          await updateDoc(doc(db, 'requests', group.requestId), { dueDate: date });
        } catch (err) {
          console.error('Failed to sync ticket due date', err);
        }
      }
    } catch (err) {
      console.error('Failed to update due date', err);
    }
  };

  const handleMonthChange = async (value) => {
    if (!groupId) return;
    try {
      if (value) {
        await updateDoc(doc(db, 'adGroups', groupId), { month: value });
        setGroup((p) => ({ ...p, month: value }));
        if (group?.requestId) {
          try {
            await updateDoc(doc(db, 'requests', group.requestId), { month: value });
          } catch (err) {
            console.error('Failed to sync ticket month', err);
          }
        }
      } else {
        await updateDoc(doc(db, 'adGroups', groupId), { month: deleteField() });
        setGroup((p) => {
          const u = { ...p };
          delete u.month;
          return u;
        });
        if (group?.requestId) {
          try {
            await updateDoc(doc(db, 'requests', group.requestId), { month: deleteField() });
          } catch (err) {
            console.error('Failed to sync ticket month', err);
          }
        }
      }
    } catch (err) {
      console.error('Failed to update month', err);
    }
  };

  const reviewDisabled = galleryAssets.length === 0 || !groupId;
  const downloadDisabled = approvedAssets.length === 0;
  const markReadyDisabled = !assets.some((a) => a.status === 'pending');

  if (loading) return <div className="min-h-screen p-4">Loading...</div>;
  if (!project)
    return (
      <div className="min-h-screen p-4">
        <p>Project not found.</p>
        <button className="btn-secondary btn-delete mt-2" onClick={handleDelete}>
          Delete Project
        </button>
      </div>
    );

  if (!groupId && request) {
    return <Navigate to={`/projects/${projectId}/staging`} replace />;
  }

  const isAgency = !!project?.agencyId;

  const visibleAssets = showAllAssets
    ? galleryAssets
    : galleryAssets.slice(0, columns || galleryAssets.length);

  return (
    <>
    <PageWrapper className="w-full max-w-[60rem] mx-auto">
      <PageToolbar
        left={
          <Button as={Link} to="/projects" variant="arrow" aria-label="Back">
            &lt;
          </Button>
        }
        right={
          <>
            <span className="relative group">
              <IconButton
                aria-label="Review Link"
                onClick={() => setShareModal(true)}
                disabled={reviewDisabled}
                className={`text-xl ${reviewDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <FiLink />
              </IconButton>
              <div className="absolute left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap bg-white border rounded text-xs p-1 shadow hidden group-hover:block dark:bg-[var(--dark-sidebar-bg)]">
                Review Link
              </div>
            </span>
            <span className="relative group">
              <IconButton
                aria-label="Archive"
                onClick={handleArchive}
                className="text-xl"
              >
                <FiArchive />
              </IconButton>
              <div className="absolute left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap bg-white border rounded text-xs p-1 shadow hidden group-hover:block dark:bg-[var(--dark-sidebar-bg)]">
                Archive
              </div>
            </span>
          </>
        }
      />
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <div className="border rounded p-4 flex-1 max-w-[60rem]">
          <div className="flex justify-between items-start">
            <div>
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
            <DueDateMonthSelector
              dueDate={
                group?.dueDate
                  ? group.dueDate.toDate
                    ? group.dueDate.toDate().toISOString().slice(0, 10)
                    : new Date(group.dueDate).toISOString().slice(0, 10)
                  : ''
              }
              setDueDate={handleDueDateChange}
              month={group?.month || ''}
              setMonth={handleMonthChange}
              isAgency={isAgency}
            />
          </div>
        </div>
        {project.recipeTypes && project.recipeTypes.length > 0 && (
          <div className="border rounded flex items-center justify-center max-w-[60rem]">
            <RecipeTypeCard
              className="bg-transparent border-none shadow-none p-0 justify-center h-full min-w-[100px]"
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
      {(request?.status === 'need info' || project?.status === 'need info') && (
        <div className="border rounded p-4 mb-4 bg-yellow-50">
          <p className="mb-2 text-black dark:text-[var(--dark-text)]">
            {request?.infoNote || project?.infoNote || 'Additional information required.'}
          </p>
          <button
            className="btn-primary"
            onClick={() => setEditRequest(true)}
          >
            Add Info
          </button>
        </div>
      )}
      <div className="space-y-4">
        <div className="border rounded p-4 max-w-[60rem]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium text-lg">Brief</h2>
            <div className="flex items-center gap-2">
              {showBrief && !editingBrief && (
                <Button
                  variant="secondary"
                  onClick={() => setEditingBrief(true)}
                >
                  Edit
                </Button>
              )}
              <IconButton
                aria-label={showBrief ? 'Hide Brief' : 'View Brief'}
                onClick={handleToggleBrief}
              >
                {showBrief ? <FiEye /> : <FiEyeOff />}
              </IconButton>
            </div>
          </div>
          {showBrief && (
            <div className="mt-4 space-y-4">
              {briefLoading ? (
                <LoadingOverlay />
              ) : editingBrief ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-1">Notes:</h4>
                    <textarea
                      value={briefNote}
                      onChange={(e) => setBriefNote(e.target.value)}
                      className="w-full border rounded p-2"
                    />
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">Assets:</h4>
                    <input type="file" multiple onChange={handleBriefFileChange} />
                    {newBriefFiles.length > 0 && (
                      <ul className="mt-2 text-sm">
                        {newBriefFiles.map((f) => (
                          <li key={f.name}>{f.name}</li>
                        ))}
                      </ul>
                    )}
                    {briefAssets.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {briefAssets.map((a) => (
                          <div key={a.id} className="asset-card">
                            {(() => {
                              const ext = fileExt(a.filename || '');
                              if (a.firebaseUrl && ext === 'svg') {
                                return (
                                  <a href={a.firebaseUrl} download>
                                    <img
                                      src={a.firebaseUrl}
                                      alt={a.filename}
                                      className="object-contain max-w-[10rem] max-h-32"
                                    />
                                  </a>
                                );
                              }
                              if (
                                a.firebaseUrl &&
                                !['ai', 'pdf'].includes(ext) &&
                                !['otf', 'ttf', 'woff', 'woff2'].includes(ext)
                              ) {
                                return (
                                  <a href={a.firebaseUrl} download>
                                    <OptimizedImage
                                      pngUrl={a.firebaseUrl}
                                      alt={a.filename}
                                      className="object-contain max-w-[10rem] max-h-32"
                                    />
                                  </a>
                                );
                              }
                              return (
                                <a href={a.firebaseUrl} download>
                                  <PlaceholderIcon ext={ext} />
                                </a>
                              );
                            })()}
                            <button
                              type="button"
                              className="absolute top-1 right-1 bg-white rounded-full px-1 text-xs"
                              onClick={() => handleDeleteBriefAsset(a.id)}
                            >
                              ×
                            </button>
                            {a.note && (
                              <div className="absolute bottom-1 right-1 bg-accent text-white rounded-full p-1">
                                <FiFileText size={14} />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveBrief}>Save</Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditingBrief(false);
                        setNewBriefFiles([]);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {briefNote && (
                    <div>
                      <h4 className="font-medium mb-1">Notes:</h4>
                      <p>{briefNote}</p>
                    </div>
                  )}
                  {briefAssets.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-1">Assets:</h4>
                      <div className="flex flex-wrap gap-2">
                        {briefAssets.map((a) => (
                          <div key={a.id} className="asset-card">
                            {(() => {
                              const ext = fileExt(a.filename || '');
                              if (a.firebaseUrl && ext === 'svg') {
                                return (
                                  <a href={a.firebaseUrl} download>
                                    <img
                                      src={a.firebaseUrl}
                                      alt={a.filename}
                                      className="object-contain max-w-[10rem] max-h-32"
                                    />
                                  </a>
                                );
                              }
                              if (
                                a.firebaseUrl &&
                                !['ai', 'pdf'].includes(ext) &&
                                !['otf', 'ttf', 'woff', 'woff2'].includes(ext)
                              ) {
                                return (
                                  <a href={a.firebaseUrl} download>
                                    <OptimizedImage
                                      pngUrl={a.firebaseUrl}
                                      alt={a.filename}
                                      className="object-contain max-w-[10rem] max-h-32"
                                    />
                                  </a>
                                );
                              }
                              return (
                                <a href={a.firebaseUrl} download>
                                  <PlaceholderIcon ext={ext} />
                                </a>
                              );
                            })()}
                            {a.note && (
                              <div className="absolute bottom-1 right-1 bg-accent text-white rounded-full p-1">
                                <FiFileText size={14} />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <RecipePreview
                    onSave={saveRecipes}
                    initialResults={recipes}
                    showOnlyResults
                    brandCode={project.brandCode}
                    hideBrandSelect
                    showColumnButton={false}
                    externalOnly
                  />
                </>
              )}
            </div>
          )}
        </div>
        <div className="border rounded p-4 max-w-[60rem]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium text-lg">Platform Copy</h2>
            <div className="flex items-center gap-2">
              {showCopySection && !editingCopy && (
                <Button
                  variant="secondary"
                  onClick={() => setEditingCopy(true)}
                >
                  Edit
                </Button>
              )}
              <IconButton
                aria-label={showCopySection ? 'Hide Platform Copy' : 'View Platform Copy'}
                onClick={() => setShowCopySection((p) => !p)}
              >
                {showCopySection ? <FiEye /> : <FiEyeOff />}
              </IconButton>
            </div>
          </div>
          {showCopySection && (
            <div className="mt-4 space-y-4">
              {editingCopy ? (
                <>
                  <CopyRecipePreview
                    onCopiesChange={setCopyDraft}
                    initialResults={copyDraft}
                    brandCode={group?.brandCode || project?.brandCode}
                    hideBrandSelect
                  />
                  <div className="flex gap-2">
                    <Button onClick={() => saveCopyCards(copyDraft)}>Save</Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditingCopy(false);
                        setCopyDraft(copyCards);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <CopyRecipePreview
                  initialResults={copyCards}
                  brandCode={group?.brandCode || project?.brandCode}
                  hideBrandSelect
                  showOnlyResults
                />
              )}
            </div>
          )}
        </div>
        <div className="border rounded p-4 max-w-[60rem]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h2 className="font-medium">Ads</h2>
              <TabButton
                active={viewMode === 'table'}
                onClick={() => setViewMode('table')}
                aria-label="Table view"
              >
                <FiList />
              </TabButton>
              <TabButton
                active={viewMode === 'gallery'}
                onClick={() => setViewMode('gallery')}
                aria-label="Gallery view"
              >
                <FiGrid />
              </TabButton>
            </div>
            <div className="flex gap-2">
              <span className="relative group">
                <IconButton
                  aria-label="Mark all pending as ready"
                  onClick={handleMarkReady}
                  disabled={markReadyDisabled}
                  className={`text-xl ${markReadyDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <FiCheck />
                </IconButton>
                <div className="absolute left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap bg-white border rounded text-xs p-1 shadow hidden group-hover:block dark:bg-[var(--dark-sidebar-bg)]">
                  Mark All Pending as Ready
                </div>
              </span>
              <span className="relative group">
                <IconButton
                  aria-label="Scrub Review History"
                  onClick={handleScrub}
                  className="text-xl"
                >
                  <Bubbles />
                </IconButton>
                <div className="absolute left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap bg-white border rounded text-xs p-1 shadow hidden group-hover:block dark:bg-[var(--dark-sidebar-bg)]">
                  Scrub Review History
                </div>
              </span>
              <span className="relative group">
                <IconButton
                  aria-label="Download approved assets"
                  onClick={handleDownload}
                  disabled={downloadDisabled}
                  className={`text-xl ${downloadDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <FiDownload />
                </IconButton>
                <div className="absolute left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap bg-white border rounded text-xs p-1 shadow hidden group-hover:block dark:bg-[var(--dark-sidebar-bg)]">
                  Download Approved
                </div>
              </span>
            </div>
          </div>
          {assets.length === 0 ? (
            <p>No assets uploaded yet.</p>
          ) : viewMode === 'table' ? (
            <Table columns={['5rem', '20ch', '8rem']}>
              <thead>
                <tr>
                  <th>Preview</th>
                  <th>Filename</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {galleryAssets.map((a) => (
                  <tr key={a.id}>
                    <td className="text-center">
                      {isVideoUrl(a.firebaseUrl || a.url) ? (
                        <VideoPlayer
                          src={a.firebaseUrl || a.url}
                          poster={a.thumbnailUrl}
                          className="w-16 h-16 object-contain"
                          controls={false}
                        />
                      ) : (
                        <OptimizedImage
                          pngUrl={a.thumbnailUrl || a.url || a.firebaseUrl}
                          alt={a.filename || a.name || 'asset'}
                          className="w-16 h-16 object-contain"
                        />
                      )}
                    </td>
                    <td
                      className="max-w-[20ch] truncate"
                      title={a.filename || a.name}
                    >
                      {a.filename || a.name}
                    </td>
                    <td className="align-top">
                      <StatusBadge status={a.status} />
                      {a.status === 'edit_requested' && (a.comment || a.copyEdit) && (
                        <div className="text-xs italic mt-1">
                          Edit: {a.comment || a.copyEdit}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <>
              <div className="asset-gallery mt-2" ref={galleryRef}>
                {visibleAssets.map((a) => (
                  <div key={a.id} className="asset-gallery-item">
                    <span className="absolute top-1 right-1 z-10 group">
                      <span
                        className="block w-3 h-3 rounded-full border-2 border-white"
                        style={{ backgroundColor: getStatusColor(a.status) }}
                      />
                      <span className="absolute right-0 mt-1 px-1 py-0.5 text-xs bg-black text-white rounded whitespace-nowrap opacity-0 group-hover:opacity-100">
                        {a.status}
                      </span>
                    </span>
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
              {!showAllAssets && galleryAssets.length > visibleAssets.length && (
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
    </PageWrapper>
    {shareModal && group && (
      <ShareLinkModal
        groupId={groupId}
        visibility={group.visibility}
        requireAuth={group.requireAuth}
        requirePassword={group.requirePassword}
        password={group.password}
        onClose={() => setShareModal(false)}
        onUpdate={(u) => setGroup((p) => ({ ...p, ...u }))}
      />
    )}
    {editRequest && request && (
      <DescribeProjectModal
        onClose={(updated) => {
          setEditRequest(false);
          if (updated) {
            setProject((p) => ({ ...p, ...updated }));
            const { id: _pid, ...rest } = updated;
            setRequest((r) => (r ? { ...r, ...rest, status: 'new' } : r));
          }
        }}
        brandCodes={[project.brandCode]}
        request={{ ...request, projectId: project.id, id: request.id }}
        resetStatus
      />
    )}
    </>
  );
};

export default ProjectDetail;
