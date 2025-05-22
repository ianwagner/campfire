// © 2025 Studio Tak. All rights reserved.
// This file is part of a proprietary software project. Do not distribute.
import React, { useEffect, useState } from 'react';
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
  const [files, setFiles] = useState([]);
  const [assets, setAssets] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [readyLoading, setReadyLoading] = useState(false);
  const [versionUploading, setVersionUploading] = useState(null);

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

  const handleUpload = async () => {
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      try {
        const url = await uploadFile(file, id);
        await addDoc(collection(db, 'adGroups', id, 'assets'), {
          adGroupId: id,
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
    setFiles([]);
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

  const markReady = async () => {
    setReadyLoading(true);
    try {
      const batch = writeBatch(db);
      for (const asset of assets) {
        batch.update(doc(db, 'adGroups', id, 'assets', asset.id), {
          status: 'pending',
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
        <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files))} />
        <button
          onClick={handleUpload}
          disabled={uploading || files.length === 0}
          className="ml-2 px-3 py-1 bg-blue-500 text-white rounded"
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
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
                <td className="px-2 py-1">{a.status}</td>
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
                    className="text-red-600 hover:text-red-800"
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
                        - {h.userId}: {h.action}
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
          className="px-4 py-2 bg-green-600 text-white rounded"
        >
          {readyLoading ? 'Processing...' : 'Mark as Ready for Review'}
        </button>
      </div>
    </div>
  );
};

export default AdGroupDetail;
