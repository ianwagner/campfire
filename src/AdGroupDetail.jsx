// © 2025 Studio Tak. All rights reserved.
// This file is part of a proprietary software project. Do not distribute.
import React, { useEffect, useState, useRef, useMemo } from 'react';
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

const AdGroupDetail = () => {
  const { id } = useParams();
  const [group, setGroup] = useState(null);
  const [brandName, setBrandName] = useState('');
  const [assets, setAssets] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [readyLoading, setReadyLoading] = useState(false);
  const [versionUploading, setVersionUploading] = useState(null);
  const countsRef = useRef(null);
  const { role: userRole } = useUserRole(auth.currentUser?.uid);

  const summarize = (list) => {
    let reviewed = 0;
    let approved = 0;
    let edit = 0;
    let rejected = 0;
    let thumbnail = '';
    list.forEach((a) => {
      if (!thumbnail && a.firebaseUrl) thumbnail = a.firebaseUrl;
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
    return Object.entries(map).map(([recipeCode, list]) => {
      list.sort((a, b) => {
        const diff = (order[a.aspectRatio] ?? 99) - (order[b.aspectRatio] ?? 99);
        if (diff !== 0) return diff;
        return (a.version || 1) - (b.version || 1);
      });
      return { recipeCode, assets: list };
    });
  }, [assets]);

  const getRecipeStatus = (list) => {
    const unique = Array.from(new Set(list.map((a) => a.status)));
    return unique.length === 1 ? unique[0] : 'mixed';
  };


  const handleUpload = async (selectedFiles) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
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
          history: [],
          version: info.version || 1,
          parentAdId: null,
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
      for (const asset of assets) {
        batch.update(doc(db, 'adGroups', id, 'assets', asset.id), {
          status: 'ready',
          lastUpdatedBy: null,
          lastUpdatedAt: serverTimestamp(),
          history: [],
        });
      }
      batch.update(doc(db, 'adGroups', id), { status: 'ready' });
      await batch.commit();
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

  if (!group) {
    return <div className="text-center mt-10">Loading...</div>;
  }

  return (
    <div className="min-h-screen p-4 ">
        <h1 className="text-2xl mb-2">{group.name}</h1>
      <p className="text-sm text-gray-500">Brand: {group.brandCode}</p>
      <p className="text-sm text-gray-500 mb-4">Status: {group.status}</p>

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


      <div>
        <table className="ad-table">
          <thead>
            <tr>
              <th>Filename</th>
              <th>Version</th>
              <th>Status</th>
              <th>Last Updated</th>
              <th>Comment</th>
              <th>Upload</th>
              <th>Delete</th>
            </tr>
          </thead>
          {recipeGroups.map((g) => (
            <tbody key={g.recipeCode} className="table-row-group">
              <tr>
                <td colSpan="2" className="font-semibold">
                  Recipe {g.recipeCode}
                </td>
                <td>
                    {userRole === 'designer' ? (
                      getRecipeStatus(g.assets) === 'pending' ? (
                        <select
                          className="p-1 border rounded"
                          value="pending"
                          onChange={(e) => updateRecipeStatus(g.recipeCode, e.target.value)}
                        >
                          <option value="pending">pending</option>
                          <option value="ready">ready</option>
                        </select>
                      ) : (
                        <span className={`status-badge status-${getRecipeStatus(g.assets)}`}>{getRecipeStatus(g.assets)}</span>
                      )
                    ) : (
                      <select
                        className="p-1 border rounded"
                        value={getRecipeStatus(g.assets)}
                        onChange={(e) => updateRecipeStatus(g.recipeCode, e.target.value)}
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
                  <td colSpan="4" />
                </tr>
                {g.assets.map((a) => (
                  <React.Fragment key={a.id}>
                    <tr>
                      <td className="break-all">{a.filename}</td>
                      <td className="text-center">{a.version || 1}</td>
                      <td>
                        {userRole === 'designer' ? (
                          a.status === 'pending' ? (
                            <select
                              className="p-1 border rounded"
                              value="pending"
                              onChange={(e) => updateAssetStatus(a.id, e.target.value)}
                            >
                              <option value="pending">pending</option>
                              <option value="ready">ready</option>
                            </select>
                          ) : (
                            <span className={`status-badge status-${a.status}`}>{a.status}</span>
                          )
                        ) : (
                          <select
                            className="p-1 border rounded"
                            value={a.status}
                            onChange={(e) => updateAssetStatus(a.id, e.target.value)}
                          >
                            <option value="pending">pending</option>
                            <option value="ready">ready</option>
                            <option value="approved">approved</option>
                            <option value="rejected">rejected</option>
                            <option value="edit_requested">edit_requested</option>
                            <option value="archived">archived</option>
                          </select>
                        )}
                      </td>
                      <td>
                        {a.lastUpdatedAt?.toDate
                          ? a.lastUpdatedAt.toDate().toLocaleString()
                          : '-'}
                      </td>
                      <td>{a.comment || '-'}</td>
                      <td>
                        {!a.firebaseUrl ? (
                          <div className="flex items-center space-x-2">
                            <input
                              type="file"
                              onChange={(e) => {
                                const f = e.target.files[0];
                                if (f) {
                                  uploadVersion(a.id, f);
                                }
                              }}
                            />
                            {versionUploading === a.id ? (
                              <span className="text-sm text-gray-600">Uploading...</span>
                            ) : a.firebaseUrl ? (
                              <span className="text-sm text-green-600">Uploaded</span>
                            ) : null}
                          </div>
                        ) : (
                          <a
                            href={a.firebaseUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            View
                          </a>
                        )}
                      </td>
                      <td className="text-center">
                        <button onClick={() => deleteAsset(a)} className="btn-delete">
                          🗑️
                        </button>
                      </td>
                    </tr>
                    {Array.isArray(a.history) && a.history.length > 0 && (
                      <tr className="history-row text-xs">
                        <td colSpan="7">
                          {a.history.map((h, idx) => (
                            <div key={idx} className="mb-1">
                              {h.timestamp?.toDate
                                ? h.timestamp.toDate().toLocaleString()
                                : ''}{' '}
                              - {h.userName || h.userEmail || h.userId}
                              {userRole === 'admin' && h.userRole ? ` (${h.userRole})` : ''}
                              : {h.action}
                              {h.action === 'edit_requested' && h.comment ? ` - ${h.comment}` : ''}
                            </div>
                          ))}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
            </tbody>
              ))}
        </table>
      </div>

      <div className="mt-6">
        <button
          onClick={markReady}
          disabled={readyLoading || assets.length === 0 || group.status === 'ready'}
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
