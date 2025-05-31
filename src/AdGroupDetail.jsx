// © 2025 Studio Tak. All rights reserved.
// This file is part of a proprietary software project. Do not distribute.
import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  FiEye,
  FiClock,
  FiTrash,
  FiLock,
  FiUnlock,
  FiRefreshCw,
  FiCheckCircle,
  FiShare2,
  FiUpload,
  FiBookOpen,
  FiArchive,
  FiRotateCcw,
} from 'react-icons/fi';
import { Link, useParams } from 'react-router-dom';
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  deleteDoc,
  query,
  where,
  getDocs,
  orderBy,
} from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { auth, db, storage } from './firebase/config';
import useUserRole from './useUserRole';
import { uploadFile } from './uploadFile';
import parseAdFilename from './utils/parseAdFilename';
import StatusBadge from './components/StatusBadge.jsx';
import LoadingOverlay from "./LoadingOverlay";
import OptimizedImage from './components/OptimizedImage.jsx';
import pickHeroAsset from './utils/pickHeroAsset';
import computeGroupStatus from './utils/computeGroupStatus';

const AdGroupDetail = () => {
  const { id } = useParams();
  const [group, setGroup] = useState(null);
  const [brandName, setBrandName] = useState('');
  const [assets, setAssets] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [readyLoading, setReadyLoading] = useState(false);
  const [versionUploading, setVersionUploading] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [showTable, setShowTable] = useState(false);
  const [historyRecipe, setHistoryRecipe] = useState(null);
  const [viewRecipe, setViewRecipe] = useState(null);
  const [recipesMeta, setRecipesMeta] = useState({});
  const [metadataRecipe, setMetadataRecipe] = useState(null);
  const [metadataForm, setMetadataForm] = useState({
    offer: '',
    angle: '',
    audience: '',
  });
  const countsRef = useRef(null);
  const { role: userRole } = useUserRole(auth.currentUser?.uid);

  const summarize = (list) => {
    let reviewed = 0;
    let approved = 0;
    let edit = 0;
    let rejected = 0;
    let thumbnail = '';
    list.forEach((a) => {
      if (!thumbnail && (a.thumbnailUrl || a.firebaseUrl)) {
        thumbnail = a.thumbnailUrl || a.firebaseUrl;
      }
      if (a.status !== 'ready') reviewed += 1;
      if (a.status === 'approved') approved += 1;
      if (a.status === 'edit_requested') edit += 1;
      if (a.status === 'rejected') rejected += 1;
    });
    return { reviewed, approved, edit, rejected, thumbnail };
  };

  useEffect(() => {
    const load = async () => {
      const snap = await getDoc(doc(db, 'adGroups', id));
      if (snap.exists()) {
        setGroup({ id: snap.id, ...snap.data() });
      }
    };
    load();
    const unsub = onSnapshot(collection(db, 'adGroups', id, 'assets'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAssets(list);
    });
    return () => unsub();
  }, [id]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'adGroups', id, 'recipes'), (snap) => {
      const data = {};
      snap.docs.forEach((d) => {
        const meta = d.data().metadata || {};
        data[d.id] = { id: d.id, ...meta };
      });
      setRecipesMeta(data);
    });
    return () => unsub();
  }, [id]);

  useEffect(() => {
    const loadBrand = async () => {
      if (!group?.brandCode) return;
      try {
        const q = query(collection(db, 'brands'), where('code', '==', group.brandCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
          setBrandName(snap.docs[0].data().name || group.brandCode);
        } else {
          setBrandName(group.brandCode);
        }
      } catch (err) {
        console.error('Failed to fetch brand name', err);
        setBrandName(group.brandCode);
      }
    };
    loadBrand();
  }, [group?.brandCode]);

  useEffect(() => {
    if (group) {
      countsRef.current = {
        reviewed: group.reviewedCount || 0,
        approved: group.approvedCount || 0,
        edit: group.editCount || 0,
        rejected: group.rejectedCount || 0,
      };
    }
  }, [group]);

  useEffect(() => {
    if (!group) return;
    const summary = summarize(assets);
    const prev = countsRef.current || {};
    const changed =
      summary.reviewed !== prev.reviewed ||
      summary.approved !== prev.approved ||
      summary.edit !== prev.edit ||
      summary.rejected !== prev.rejected ||
      (!group.thumbnailUrl && summary.thumbnail);
    if (changed) {
      const update = {
        reviewedCount: summary.reviewed,
        approvedCount: summary.approved,
        editCount: summary.edit,
        rejectedCount: summary.rejected,
        lastUpdated: serverTimestamp(),
        ...(group.thumbnailUrl ? {} : summary.thumbnail ? { thumbnailUrl: summary.thumbnail } : {}),
      };
      const newStatus = computeGroupStatus(assets, group.status);
      if (newStatus !== group.status) {
        update.status = newStatus;
      }
      updateDoc(doc(db, 'adGroups', id), update).catch((err) =>
        console.error('Failed to update summary', err)
      );
      countsRef.current = summary;
      setGroup((p) => ({ ...p, ...update }));
    }
  }, [assets, group, id]);

  const recipeGroups = useMemo(() => {
    const map = {};
    assets.forEach((a) => {
      const info = parseAdFilename(a.filename || '');
      const recipe = info.recipeCode || 'unknown';
      const aspect = info.aspectRatio || '';
      const item = { ...a, recipeCode: recipe, aspectRatio: aspect };
      if (!map[recipe]) map[recipe] = [];
      map[recipe].push(item);
    });
    const order = { '3x5': 0, '9x16': 1, '1x1': 2 };
    const groups = Object.entries(map).map(([recipeCode, list]) => {
      list.sort((a, b) => {
        const diff = (order[a.aspectRatio] ?? 99) - (order[b.aspectRatio] ?? 99);
        if (diff !== 0) return diff;
        return (a.version || 1) - (b.version || 1);
      });
      return { recipeCode, assets: list };
    });
    groups.sort((a, b) => Number(a.recipeCode) - Number(b.recipeCode));
    return groups;
  }, [assets]);

  const recipeCount = useMemo(() => {
    const set = new Set();
    assets.forEach((a) => {
      const info = parseAdFilename(a.filename || '');
      set.add(info.recipeCode || 'unknown');
    });
    return set.size;
  }, [assets]);

  const statusCounts = useMemo(() => {
    const counts = {
      pending: 0,
      ready: 0,
      approved: 0,
      rejected: 0,
      edit_requested: 0,
    };
    assets.forEach((a) => {
      if (counts[a.status] !== undefined) counts[a.status] += 1;
    });
    return counts;
  }, [assets]);

  function getRecipeStatus(list) {
    const unique = Array.from(new Set(list.map((a) => a.status)));
    return unique.length === 1 ? unique[0] : 'mixed';
  }

  const specialGroups = useMemo(
    () =>
      recipeGroups.filter((g) =>
        ['rejected', 'edit_requested'].includes(getRecipeStatus(g.assets))
      ),
    [recipeGroups]
  );

  const normalGroups = useMemo(
    () =>
      recipeGroups.filter(
        (g) => !['rejected', 'edit_requested'].includes(getRecipeStatus(g.assets))
      ),
    [recipeGroups]
  );

  const toggleRecipe = (code) => {
    setExpanded((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  const openHistory = async (recipeCode) => {
    const list = assets.filter((a) => {
      const info = parseAdFilename(a.filename || '');
      return (info.recipeCode || 'unknown') === recipeCode;
    });
    if (list.length === 0) return;

    const historyDocs = [];
    await Promise.all(
      list.map(async (asset) => {
        const snap = await getDocs(
          query(
            collection(db, 'adGroups', id, 'assets', asset.id, 'history'),
            orderBy('updatedAt', 'asc')
          )
        );
        historyDocs.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
    );
    historyDocs.sort((a, b) =>
      (a.updatedAt?.toMillis?.() || 0) - (b.updatedAt?.toMillis?.() || 0)
    );
    const uids = Array.from(
      new Set(historyDocs.map((h) => h.updatedBy).filter(Boolean))
    );
    const emails = {};
    await Promise.all(
      uids.map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          emails[uid] = snap.exists() ? snap.data().email || uid : uid;
        } catch (_) {
          emails[uid] = uid;
        }
      })
    );
    const hist = historyDocs.map((h) => ({
      ...h,
      lastUpdatedAt: h.updatedAt,
      email: h.updatedBy ? emails[h.updatedBy] : 'N/A',
    }));
    setHistoryRecipe({ recipeCode, assets: hist });
  };

  const openView = (recipeCode) => {
    const list = assets.filter((a) => {
      const info = parseAdFilename(a.filename || '');
      return (info.recipeCode || 'unknown') === recipeCode;
    });
    setViewRecipe({ recipeCode, assets: list });
  };

  useEffect(() => {
    if (metadataRecipe) {
      const meta =
        recipesMeta[metadataRecipe.id] ||
        recipesMeta[metadataRecipe.id.toLowerCase()] ||
        metadataRecipe;
      setMetadataForm({
        offer: meta.offer || '',
        angle: meta.angle || '',
        audience: meta.audience || '',
      });
    }
  }, [metadataRecipe, recipesMeta]);

  const closeModals = () => {
    setHistoryRecipe(null);
    setViewRecipe(null);
    setMetadataRecipe(null);
  };

  const toggleLock = async () => {
    if (!group) return;
    const newStatus =
      group.status === 'locked'
        ? computeGroupStatus(assets, 'pending')
        : 'locked';
    try {
      await updateDoc(doc(db, 'adGroups', id), { status: newStatus });
      setGroup((p) => ({ ...p, status: newStatus }));
    } catch (err) {
      console.error('Failed to toggle lock', err);
    }
  };

  const resetGroup = async () => {
    if (!group) return;
    const confirmReset = window.confirm('Reset this group to pending?');
    if (!confirmReset) return;
    try {
      const batch = writeBatch(db);
      assets.forEach((a) => {
        batch.update(doc(db, 'adGroups', id, 'assets', a.id), {
          status: 'pending',
          lastUpdatedBy: null,
          lastUpdatedAt: serverTimestamp(),
        });
      });
      batch.update(doc(db, 'adGroups', id), { status: 'pending' });
      await batch.commit();
      setAssets((prev) => prev.map((a) => ({ ...a, status: 'pending' })));
      setGroup((p) => ({ ...p, status: 'pending' }));
    } catch (err) {
      console.error('Failed to reset group', err);
    }
  };

  const archiveGroup = async () => {
    if (!group) return;
    if (!window.confirm('Archive this group?')) return;
    try {
      await updateDoc(doc(db, 'adGroups', id), {
        status: 'archived',
        archivedAt: serverTimestamp(),
        archivedBy: auth.currentUser?.uid || null,
      });
      setGroup((p) => ({ ...p, status: 'archived' }));
    } catch (err) {
      console.error('Failed to archive group', err);
    }
  };

  const restoreGroup = async () => {
    if (!group) return;
    try {
      await updateDoc(doc(db, 'adGroups', id), {
        status: 'pending',
        archivedAt: null,
        archivedBy: null,
      });
      setGroup((p) => ({ ...p, status: 'pending' }));
    } catch (err) {
      console.error('Failed to restore group', err);
    }
  };


  const handleUpload = async (selectedFiles) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    if (group?.status !== 'locked' && group?.status !== 'pending') {
      try {
        await updateDoc(doc(db, 'adGroups', id), { status: 'pending' });
        setGroup((p) => ({ ...p, status: 'pending' }));
      } catch (err) {
        console.error('Failed to update group status', err);
      }
    }
    const existing = new Set(assets.map((a) => a.filename));
    const used = new Set();
    const files = [];
    const dupes = [];
    for (const f of Array.from(selectedFiles)) {
      if (existing.has(f.name) || used.has(f.name)) {
        dupes.push(f.name);
      } else {
        used.add(f.name);
        files.push(f);
      }
    }
    if (dupes.length > 0) {
      window.alert(`Duplicate files skipped: ${dupes.join(', ')}`);
    }
    if (files.length === 0) return;
    setUploading(true);
    for (const file of files) {
      try {
        const url = await uploadFile(
          file,
          id,
          brandName || group?.brandCode,
          group?.name || id
        );
        const info = parseAdFilename(file.name);
        let parentId = null;
        if (info.version && info.version > 1) {
          const base = file.name.replace(/_V\d+\.[^/.]+$/, '');
          const prev = assets.find((a) =>
            a.filename.replace(/_V\d+\.[^/.]+$/, '') === base
          );
          if (prev) {
            parentId = prev.id;
            try {
              await updateDoc(doc(db, 'adGroups', id, 'assets', prev.id), {
                status: 'archived',
              });
            } catch (err) {
              console.error('Failed to archive previous version', err);
            }
          }
        }
        await addDoc(collection(db, 'adGroups', id, 'assets'), {
          adGroupId: id,
          brandCode: info.brandCode || group?.brandCode || '',
          adGroupCode: info.adGroupCode || '',
          recipeCode: info.recipeCode || '',
          aspectRatio: info.aspectRatio || '',
          filename: file.name,
          firebaseUrl: url,
          uploadedAt: serverTimestamp(),
          status: 'pending',
          comment: null,
          lastUpdatedBy: null,
          lastUpdatedAt: serverTimestamp(),
          version: info.version || 1,
          parentAdId: parentId,
          isResolved: false,
        });
      } catch (err) {
        console.error('Upload failed', err);
      }
    }
    setUploading(false);
  };

  const handleMetadataCsvUpload = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.trim().split(/\r?\n/);
      if (lines.length === 0) return;
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const findCol = (k) => headers.findIndex((h) => h.includes(k));
      const recipeCol = findCol('recipe');
      const offerCol = findCol('offer');
      const angleCol = findCol('angle');
      const audienceCol = findCol('audience');
      if (recipeCol === -1) {
        window.alert('Recipe column not found');
        return;
      }
      const normalize = (val) =>
        val.toString().toLowerCase().replace(/\s+/g, '').replace('recipe', '');
      const updates = [];
      for (let i = 1; i < lines.length; i += 1) {
        const parts = lines[i].split(',').map((p) => p.trim());
        const rawCode = parts[recipeCol];
        const recipeCode = rawCode ? normalize(rawCode) : '';
        if (!recipeCode) continue;
        const data = {
          offer: offerCol >= 0 ? parts[offerCol] || '' : '',
          angle: angleCol >= 0 ? parts[angleCol] || '' : '',
          audience: audienceCol >= 0 ? parts[audienceCol] || '' : '',
        };
        console.log('Matched:', recipeCode, data);
        updates.push({
          id: recipeCode,
          data,
        });
      }
      if (updates.length === 0) {
        window.alert('No metadata rows found in CSV');
        return;
      }
      const batch = writeBatch(db);
      updates.forEach((u) => {
        batch.set(
          doc(db, 'adGroups', id, 'recipes', u.id),
          { metadata: u.data },
          { merge: true }
        );
      });
      await batch.commit();
      setRecipesMeta((prev) => {
        const copy = { ...prev };
        updates.forEach((u) => {
          copy[u.id] = { id: u.id, ...u.data };
        });
        return copy;
      });
      window.alert('Metadata uploaded');
    } catch (err) {
      console.error('Failed to upload metadata', err);
      window.alert('Failed to upload metadata');
    }
  };

  const uploadVersion = async (assetId, file) => {
    if (!file) return;
    setVersionUploading(assetId);
    try {
      const url = await uploadFile(
        file,
        id,
        brandName || group?.brandCode,
        group?.name || id
      );
      await updateDoc(doc(db, 'adGroups', id, 'assets', assetId), {
        filename: file.name,
        firebaseUrl: url,
        uploadedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Failed to upload version', err);
    } finally {
      setVersionUploading(null);
    }
  };

  const saveMetadata = async () => {
    if (!metadataRecipe) return;
    try {
      await setDoc(
        doc(db, 'adGroups', id, 'recipes', metadataRecipe.id),
        { metadata: metadataForm },
        { merge: true }
      );
      setRecipesMeta((prev) => ({
        ...prev,
        [metadataRecipe.id]: { id: metadataRecipe.id, ...metadataForm },
      }));
      setMetadataRecipe(null);
    } catch (err) {
      console.error('Failed to save metadata', err);
    }
  };

  const updateAssetStatus = async (assetId, status) => {
    try {
      await updateDoc(doc(db, 'adGroups', id, 'assets', assetId), {
        status,
      });
      if (status === 'ready') {
        const asset = assets.find((a) => a.id === assetId);
        if (asset?.parentAdId) {
          await updateDoc(doc(db, 'adGroups', id, 'assets', asset.parentAdId), {
            status: 'archived',
          });
        }
      }
    } catch (err) {
      console.error('Failed to update asset status', err);
    }
  };

  const updateRecipeStatus = async (recipeCode, status) => {
    const groupAssets = assets.filter((a) => {
      const info = parseAdFilename(a.filename || '');
      return (info.recipeCode || 'unknown') === recipeCode;
    });
    if (groupAssets.length === 0) return;
    const hero = pickHeroAsset(groupAssets);
    const batch = writeBatch(db);
    groupAssets.forEach((a) => {
      batch.update(doc(db, 'adGroups', id, 'assets', a.id), {
        status,
        lastUpdatedBy: auth.currentUser?.uid || null,
        lastUpdatedAt: serverTimestamp(),
      });
    });
    try {
      await batch.commit();
      if (hero) {
        await addDoc(
          collection(db, 'adGroups', id, 'assets', hero.id, 'history'),
          {
            status,
            updatedBy: auth.currentUser?.uid || null,
            updatedAt: serverTimestamp(),
          }
        );
      }
      setAssets((prev) =>
        prev.map((a) =>
          groupAssets.some((g) => g.id === a.id) ? { ...a, status } : a
        )
      );
    } catch (err) {
      console.error('Failed to update recipe status', err);
    }
  };

  const markReady = async () => {
    setReadyLoading(true);
    try {
      const batch = writeBatch(db);
      const pendingAssets = assets.filter((a) => a.status === 'pending');
      for (const asset of pendingAssets) {
        batch.update(doc(db, 'adGroups', id, 'assets', asset.id), {
          status: 'ready',
          lastUpdatedBy: null,
          lastUpdatedAt: serverTimestamp(),
        });
      }
      batch.update(doc(db, 'adGroups', id), { status: 'ready' });
      await batch.commit();
      if (pendingAssets.length > 0) {
        setAssets((prev) =>
          prev.map((a) =>
            pendingAssets.some((p) => p.id === a.id) ? { ...a, status: 'ready' } : a
          )
        );
      }
    } catch (err) {
      console.error('Failed to mark ready', err);
    } finally {
      setReadyLoading(false);
    }
  };

  const shareLink = () => {
    const url = `${window.location.origin}/review/${id}`;
    navigator.clipboard
      .writeText(url)
      .then(() => window.alert('Link copied to clipboard'))
      .catch((err) => console.error('Failed to copy link', err));
  };

  const deleteAsset = async (asset) => {
    const confirmDelete = window.confirm('Delete this asset?');
    if (!confirmDelete) return;
    try {
      await deleteDoc(doc(db, 'adGroups', id, 'assets', asset.id));
      try {
        await deleteDoc(doc(db, 'adAssets', asset.id));
      } catch (err) {
        // optional root doc may not exist
      }
      if (asset.filename || asset.firebaseUrl) {
        try {
          const fileRef = ref(
            storage,
            asset.firebaseUrl ||
              `Campfire/Brands/${brandName || group?.brandCode}/Adgroups/${
                group?.name || id
              }/${asset.filename}`
          );
          await deleteObject(fileRef);
        } catch (err) {
          console.error('Failed to delete storage file', err);
        }
      }
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    } catch (err) {
      console.error('Failed to delete asset', err);
    }
  };

  const deleteRecipe = async (recipeCode) => {
    const confirmDelete = window.confirm('Delete this recipe and all assets?');
    if (!confirmDelete) return;
    const groupAssets = assets.filter((a) => {
      const info = parseAdFilename(a.filename || '');
      return (info.recipeCode || 'unknown') === recipeCode;
    });
    try {
      await Promise.all(
        groupAssets.map(async (a) => {
          await deleteDoc(doc(db, 'adGroups', id, 'assets', a.id));
          try {
            await deleteDoc(doc(db, 'adAssets', a.id));
          } catch (_) {}
          if (a.filename || a.firebaseUrl) {
            try {
              const fileRef = ref(
                storage,
                a.firebaseUrl ||
                  `Campfire/Brands/${brandName || group?.brandCode}/Adgroups/${
                    group?.name || id
                  }/${a.filename}`
              );
              await deleteObject(fileRef);
            } catch (err) {
              console.error('Failed to delete storage file', err);
            }
          }
        })
      );
      setAssets((prev) =>
        prev.filter((a) => !groupAssets.some((g) => g.id === a.id))
      );
    } catch (err) {
      console.error('Failed to delete recipe assets', err);
    }
  };

  const renderRecipeRow = (g) => (
    <tbody key={g.recipeCode} className="table-row-group">
      <tr
        onClick={() => toggleRecipe(g.recipeCode)}
        className="cursor-pointer recipe-row"
      >
        <td colSpan="2" className="font-semibold relative">
          Recipe {g.recipeCode}
          <div
            className={`asset-panel absolute left-0 w-full ${
              expanded[g.recipeCode] ? 'open' : ''
            }`}
          >
            <div className="overflow-x-auto table-container">
              <table className="ad-table min-w-max w-full">
                <tbody>
                  {g.assets.map((a) => (
                    <tr key={a.id} className="asset-row">
                      <td className="break-all">{a.filename}</td>
                      <td className="text-center">{a.version || 1}</td>
                      <td className="text-center">
                        <div className="flex flex-col items-center">
                          <StatusBadge status={a.status} />
                          {a.status === 'edit_requested' && a.comment && (
                            <span className="italic text-xs">{a.comment}</span>
                          )}
                        </div>
                      </td>
                      <td className="text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteAsset(a);
                          }}
                          className="btn-delete"
                          aria-label="Delete"
                        >
                          <FiTrash />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </td>
        <td className="flex flex-col">
          {userRole === 'designer' || userRole === 'client' ? (
            getRecipeStatus(g.assets) === 'pending' ? (
              <select
                className={`status-select status-pending`}
                value="pending"
                onChange={(e) => {
                  e.stopPropagation();
                  updateRecipeStatus(g.recipeCode, e.target.value);
                }}
              >
                <option value="pending">pending</option>
                <option value="ready">ready</option>
              </select>
            ) : (
              <StatusBadge status={getRecipeStatus(g.assets)} />
            )
          ) : (
            <select
              className={`status-select status-${getRecipeStatus(g.assets)}`}
              value={getRecipeStatus(g.assets)}
              onChange={(e) => {
                e.stopPropagation();
                updateRecipeStatus(g.recipeCode, e.target.value);
              }}
            >
              <option value="pending">pending</option>
              <option value="ready">ready</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
              <option value="edit_requested">edit_requested</option>
              <option value="archived">archived</option>
              <option value="mixed" disabled>
                mixed
              </option>
            </select>
          )}
          {g.assets.find((a) => a.status === 'edit_requested' && a.comment) && (
            <span className="italic text-xs mt-1">
              {
                g.assets.find((a) => a.status === 'edit_requested' && a.comment)
                  ?.comment
              }
            </span>
          )}
        </td>
        <td className="text-center">
          <div className="flex items-center justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                openView(g.recipeCode);
              }}
              className="btn-secondary px-1.5 py-0.5 text-xs flex items-center gap-1 mr-2"
              aria-label="View"
            >
              <FiEye />
              <span className="ml-1">View</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                openHistory(g.recipeCode);
              }}
              className="btn-secondary px-1.5 py-0.5 text-xs flex items-center gap-1 mr-2"
              aria-label="History"
            >
              <FiClock />
              <span className="ml-1">History</span>
            </button>
            {userRole === 'admin' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMetadataRecipe(
                    recipesMeta[g.recipeCode] ||
                      recipesMeta[g.recipeCode.toLowerCase()] ||
                      { id: g.recipeCode }
                  );
                }}
                className="btn-secondary px-1.5 py-0.5 text-xs flex items-center gap-1 mr-2"
                aria-label="Metadata"
              >
                <FiBookOpen />
                <span className="ml-1">Metadata</span>
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteRecipe(g.recipeCode);
              }}
              className="btn-delete text-xs"
              aria-label="Delete"
            >
              <FiTrash />
            </button>
          </div>
        </td>
      </tr>
    </tbody>
  );

  if (!group) {
    return <LoadingOverlay />;
  }

  return (
    <div className="min-h-screen p-4 ">
        <h1 className="text-2xl mb-2">{group.name}</h1>
      <p className="text-sm text-gray-500 flex flex-wrap items-center gap-2">
        Brand: {group.brandCode}
        <span className="hidden sm:inline">|</span>
        Status: <StatusBadge status={group.status} />
      </p>
      {group.status === 'archived' && (
        <p className="text-red-500 text-sm mb-2">This ad group is archived and read-only.</p>
      )}
      <div className="text-sm text-gray-500 mb-4 flex flex-wrap items-center gap-2">
        {(userRole === 'admin' || userRole === 'agency') && (
          <>
            {group.status === 'archived' ? (
              <>
                {userRole === 'admin' && (
                  <button onClick={restoreGroup} className="btn-secondary px-2 py-0.5 flex items-center gap-1">
                    <FiRotateCcw />
                    Restore
                  </button>
                )}
              </>
            ) : (
              <>
            <input
              id="upload-input"
              type="file"
              multiple
              onChange={(e) => {
                const sel = e.target.files;
                handleUpload(sel);
                e.target.value = null;
              }}
              className="hidden"
            />
            <button
              onClick={() => document.getElementById('upload-input').click()}
              className="btn-secondary px-2 py-0.5 flex items-center gap-1"
            >
              <FiUpload />
              Upload
            </button>
            {userRole === 'admin' && (
              <>
                <input
                  id="meta-input"
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    handleMetadataCsvUpload(f);
                    e.target.value = null;
                  }}
                  className="hidden"
                />
                <button
                  onClick={() => document.getElementById('meta-input').click()}
                  className="btn-secondary px-2 py-0.5 flex items-center gap-1"
                >
                  <FiUpload />
                  Upload Metadata CSV
                </button>
              </>
            )}
            <button onClick={toggleLock} className="btn-secondary px-2 py-0.5 flex items-center gap-1">
              {group.status === 'locked' ? <FiUnlock /> : <FiLock />}
              {group.status === 'locked' ? 'Unlock' : 'Lock'}
            </button>
            <button onClick={resetGroup} className="btn-secondary px-2 py-0.5 flex items-center gap-1">
              <FiRefreshCw />
              Reset
            </button>
            <button
              onClick={markReady}
              disabled={
                readyLoading ||
                assets.length === 0 ||
                group.status === 'ready' ||
                group.status === 'locked'
              }
              className="btn-primary px-2 py-0.5 flex items-center gap-1"
            >
              <FiCheckCircle />
              {readyLoading ? 'Processing...' : 'Ready'}
            </button>
            <Link
              to={`/review/${id}`}
              className="btn-secondary px-2 py-0.5 flex items-center gap-1"
            >
              <FiBookOpen />
              Review
            </Link>
            <button onClick={shareLink} className="btn-secondary px-2 py-0.5 flex items-center gap-1">
              <FiShare2 />
              Share
            </button>
            {userRole === 'admin' && (
              <button onClick={archiveGroup} className="btn-secondary px-2 py-0.5 flex items-center gap-1">
                <FiArchive />
                Archive
              </button>
            )}
              </>
            )}
          </>
        )}
      </div>

      {uploading && (
        <span className="ml-2 text-sm text-gray-600">Uploading...</span>
      )}


      {!showTable && (
        <>
          <div className="flex flex-wrap justify-center gap-4 mb-4">
            <div className="stat-card">
              <p className="stat-card-title">Recipes</p>
              <p className="stat-card-value">{recipeCount}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card-title">Total Ads</p>
              <p className="stat-card-value">{assets.length}</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-4 mb-4">
            <div className="stat-card status-pending">
              <p className="stat-card-title">Pending</p>
              <p className="stat-card-value">{statusCounts.pending}</p>
            </div>
            <div className="stat-card status-ready">
              <p className="stat-card-title">Ready</p>
              <p className="stat-card-value">{statusCounts.ready}</p>
            </div>
            <div className="stat-card status-approved">
              <p className="stat-card-title">Approved</p>
              <p className="stat-card-value">{statusCounts.approved}</p>
            </div>
            <div className="stat-card status-rejected">
              <p className="stat-card-title">Rejected</p>
              <p className="stat-card-value">{statusCounts.rejected}</p>
            </div>
            <div className="stat-card status-edit_requested">
              <p className="stat-card-title">Edit</p>
              <p className="stat-card-value">{statusCounts.edit_requested}</p>
            </div>
          </div>
        </>
      )}

      {(showTable || specialGroups.length > 0) && (
        <div className="overflow-x-auto table-container">
          <table className="ad-table min-w-max">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Version</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            {[
              ...specialGroups,
              ...(showTable ? normalGroups : []),
            ].map((g) => renderRecipeRow(g))}
          </table>
        </div>
      )}

      <button
        onClick={() => setShowTable((p) => !p)}
        className="btn-secondary px-2 py-0.5 flex items-center gap-1 my-4"
      >
        {showTable ? 'Hide Table' : 'Show All Ads'}
      </button>

      {viewRecipe && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-4 rounded shadow max-w-md dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
            <h3 className="mb-2 font-semibold">Recipe {viewRecipe.recipeCode}</h3>
            <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-auto">
              {viewRecipe.assets.map((a) => (
                <OptimizedImage
                  key={a.id}
                  pngUrl={a.thumbnailUrl || a.firebaseUrl}
                  alt={a.filename}
                  className="w-full object-contain max-h-40"
                />
              ))}
            </div>
            <button onClick={closeModals} className="mt-2 btn-primary px-3 py-1">
              Close
            </button>
          </div>
        </div>
      )}

      {historyRecipe && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-4 rounded shadow max-w-md dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
            <h3 className="mb-2 font-semibold">Recipe {historyRecipe.recipeCode} History</h3>
            <ul className="mb-2 space-y-2 max-h-[60vh] overflow-auto">
              {historyRecipe.assets.map((a) => (
                <li key={a.id} className="border-b pb-2 last:border-none">
                  <div className="text-sm font-medium">
                    {a.lastUpdatedAt?.toDate
                      ? a.lastUpdatedAt
                          .toDate()
                          .toLocaleString()
                      : ''}{' '}
                    - {a.email}
                  </div>
                  <div className="text-sm">Status: {a.status}</div>
                  {a.comment && (
                    <div className="text-sm italic">Note: {a.comment}</div>
                  )}
                </li>
              ))}
            </ul>
            <button onClick={closeModals} className="btn-primary px-3 py-1">Close</button>
          </div>
        </div>
      )}

      {metadataRecipe && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-4 rounded shadow max-w-sm dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
            <h3 className="mb-2 font-semibold">Metadata for Recipe {metadataRecipe.id}</h3>
            <div className="space-y-2">
              <label className="block text-sm">
                Offer
                <input
                  type="text"
                  className="mt-1 w-full border rounded p-1 text-black dark:text-black"
                  value={metadataForm.offer}
                  onChange={(e) => setMetadataForm({ ...metadataForm, offer: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Angle
                <input
                  type="text"
                  className="mt-1 w-full border rounded p-1 text-black dark:text-black"
                  value={metadataForm.angle}
                  onChange={(e) => setMetadataForm({ ...metadataForm, angle: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Audience
                <input
                  type="text"
                  className="mt-1 w-full border rounded p-1 text-black dark:text-black"
                  value={metadataForm.audience}
                  onChange={(e) => setMetadataForm({ ...metadataForm, audience: e.target.value })}
                />
              </label>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={closeModals} className="btn-secondary px-3 py-1">Cancel</button>
              <button onClick={saveMetadata} className="btn-primary px-3 py-1">Save</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdGroupDetail;
