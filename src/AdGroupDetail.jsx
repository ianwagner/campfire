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
} from 'firebase/firestore';
import { db } from './firebase/config';
import { uploadFile } from './uploadFile';

const AdGroupDetail = () => {
  const { id } = useParams();
  const [group, setGroup] = useState(null);
  const [files, setFiles] = useState([]);
  const [assets, setAssets] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [readyLoading, setReadyLoading] = useState(false);

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
          status: 'draft',
          reviewedBy: null,
          comment: null,
        });
      } catch (err) {
        console.error('Upload failed', err);
      }
    }
    setFiles([]);
    setUploading(false);
  };

  const markReady = async () => {
    setReadyLoading(true);
    try {
      await updateDoc(doc(db, 'adGroups', id), { status: 'ready' });
      for (const asset of assets) {
        await updateDoc(doc(db, 'adGroups', id, 'assets', asset.id), {
          status: 'pending',
        });
      }
    } catch (err) {
      console.error('Failed to mark ready', err);
    } finally {
      setReadyLoading(false);
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
              <th className="px-2 py-1 text-left">Status</th>
              <th className="px-2 py-1 text-left">Comment</th>
              <th className="px-2 py-1 text-left">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id} className="border-b">
                <td className="px-2 py-1 break-all">{a.filename}</td>
                <td className="px-2 py-1">{a.status}</td>
                <td className="px-2 py-1">{a.comment || '-'}</td>
                <td className="px-2 py-1">
                  <a
                    href={a.firebaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    View
                  </a>
                </td>
              </tr>
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
