// © 2025 Studio Tak. All rights reserved.
// This file is part of a proprietary software project. Do not distribute.
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { FiEye, FiClock, FiTrash } from 'react-icons/fi';
import { useParams } from 'react-router-dom';
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  deleteDoc,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { auth, db, storage } from './firebase/config';
import useUserRole from './useUserRole';
import { uploadFile } from './uploadFile';
import parseAdFilename from './utils/parseAdFilename';
import StatusBadge from './components/StatusBadge.jsx';
import OptimizedImage from './components/OptimizedImage.jsx';
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
  const [historyRecipe, setHistoryRecipe] = useState(null);
  const [viewRecipe, setViewRecipe] = useState(null);
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

  const getRecipeStatus = (list) => {
    const unique = Array.from(new Set(list.map((a) => a.status)));
    return unique.length === 1 ? unique[0] : 'mixed';
  };

  const toggleRecipe = (code) => {
    setExpanded((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  const openHistory = async (recipeCode) => {
    const list = assets.filter((a) => {
      const info = parseAdFilename(a.filename || '');
      return (info.recipeCode || 'unknown') === recipeCode;
    });
    const uids = Array.from(
      new Set(list.map((a) => a.lastUpdatedBy).filter(Boolean))
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
    const hist = list.map((a) => ({
      ...a,
      email: a.lastUpdatedBy ? emails[a.lastUpdatedBy] : 'N/A',
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

  const closeModals = () => {
    setHistoryRecipe(null);
    setViewRecipe(null);
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

  if (!group) {
    return <div className="text-center mt-10">Loading...</div>;
  }

  return (
    <div className="min-h-screen p-4 ">
        <h1 className="text-2xl mb-2">{group.name}</h1>
      <p className="text-sm text-gray-500">Brand: {group.brandCode}</p>
      <p className="text-sm text-gray-500 mb-4 flex items-center gap-2">
        Status: <StatusBadge status={group.status} />
        {(userRole === 'admin' || userRole === 'agency') && (
          <button onClick={toggleLock} className="btn-secondary px-2 py-0.5">
            {group.status === 'locked' ? 'Unlock' : 'Lock'}
          </button>
        )}
      </p>

      <div className="mb-4">
        <input
          type="file"
          multiple
          onChange={(e) => {
            const sel = e.target.files;
            handleUpload(sel);
            e.target.value = null;
          }}
        />
        {uploading && (
          <span className="ml-2 text-sm text-gray-600">Uploading...</span>
        )}
      </div>


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
          {recipeGroups.map((g) => (
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
                            <td></td>
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
                <td>
                    {userRole === 'designer' || userRole === 'client' ? (
                      getRecipeStatus(g.assets) === 'pending' ? (
                        <select
                          className="p-1 border rounded"
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
                        className="p-1 border rounded"
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
                        <option value="mixed" disabled>mixed</option>
                      </select>
                    )}
                  </td>
                  <td className="text-center">
                    <div className="flex items-center justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openView(g.recipeCode);
                        }}
                        className="flex items-center text-blue-500 underline mr-2"
                        aria-label="View"
                      >
                        <FiEye />
                        <span className="ml-1 text-[12px]">View</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openHistory(g.recipeCode);
                        }}
                        className="flex items-center text-blue-500 underline mr-2"
                        aria-label="History"
                      >
                        <FiClock />
                        <span className="ml-1 text-[12px]">History</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteRecipe(g.recipeCode);
                        }}
                        className="btn-delete"
                        aria-label="Delete"
                      >
                        <FiTrash />
                      </button>
                    </div>
                  </td>
                </tr>
            </tbody>
              ))}
        </table>
      </div>

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

      <div className="mt-6">
        <button
          onClick={markReady}
          disabled={
            readyLoading ||
            assets.length === 0 ||
            group.status === 'ready' ||
            group.status === 'locked'
          }
          className="btn-approve"
        >
          {readyLoading ? 'Processing...' : 'Mark as Ready for Review'}
        </button>
        <button onClick={shareLink} className="ml-2 btn-primary px-3 py-1">
          Share Link
        </button>
      </div>
    </div>
  );
};

export default AdGroupDetail;
