// © 2025 Studio Tak. All rights reserved.
// This file is part of a proprietary software project. Do not distribute.
import React, { useEffect, useState, useRef } from 'react';
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
} from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { db, storage } from './firebase/config';
import { uploadFile } from './uploadFile';

const AdGroupDetail = () => {
  const { id } = useParams();
  const [group, setGroup] = useState(null);
  const [assets, setAssets] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [readyLoading, setReadyLoading] = useState(false);
  const [versionUploading, setVersionUploading] = useState(null);
  const countsRef = useRef(null);

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

  const handleUpload = async (selectedFiles) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    setUploading(true);
    for (const file of Array.from(selectedFiles)) {
      try {
        const url = await uploadFile(file, id);
        await addDoc(collection(db, 'adGroups', id, 'assets'), {
          adGroupId: id,
          brandCode: group?.brandCode || '',
          filename: file.name,
          firebaseUrl: url,
          uploadedAt: serverTimestamp(),
          status: 'pending',
          comment: null,
          lastUpdatedBy: null,
          lastUpdatedAt: serverTimestamp(),
          history: [],
          version: 1,
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
      const url = await uploadFile(file, id);
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
    } catch (err) {
      console.error('Failed to update asset status', err);
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
            asset.firebaseUrl || `adGroups/${id}/${asset.filename}`
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
    <div className="p-4 max-w-3xl mx-auto">
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

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-2 py-1 text-left">Filename</th>
              <th className="px-2 py-1 text-left">Version</th>
              <th className="px-2 py-1 text-left">Status</th>
              <th className="px-2 py-1 text-left">Last Updated</th>
              <th className="px-2 py-1 text-left">Comment</th>
              <th className="px-2 py-1 text-left">Upload</th>
              <th className="px-2 py-1 text-left">Delete</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <React.Fragment key={a.id}>
              <tr className="border-b">
                <td className="px-2 py-1 break-all">{a.filename}</td>
                <td className="px-2 py-1 text-center">{a.version || 1}</td>
                <td className="px-2 py-1">
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
                  </select>
                </td>
                <td className="px-2 py-1">
                  {a.lastUpdatedAt?.toDate
                    ? a.lastUpdatedAt.toDate().toLocaleString()
                    : '-'}
                </td>
                <td className="px-2 py-1">{a.comment || '-'}</td>
                <td className="px-2 py-1">
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
                <td className="px-2 py-1 text-center">
                  <button
                    onClick={() => deleteAsset(a)}
                    className="btn-delete"
                  >
                    🗑️
                  </button>
                </td>
              </tr>
              {Array.isArray(a.history) && a.history.length > 0 && (
                <tr className="border-b text-xs bg-gray-50">
                  <td colSpan="7" className="px-2 py-1">
                    {a.history.map((h, idx) => (
                      <div key={idx} className="mb-1">
                        {h.timestamp?.toDate
                          ? h.timestamp.toDate().toLocaleString()
                          : ''}{' '}
                        - {h.userEmail || h.userId}: {h.action}
                        {h.action === 'edit_requested' && h.comment
                          ? ` - ${h.comment}`
                          : ''}
                      </div>
                    ))}
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
          </tbody>
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
      </div>
    </div>
  );
};

export default AdGroupDetail;
