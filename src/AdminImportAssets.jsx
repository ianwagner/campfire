import React, { useState } from 'react';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase/config';
import parseAdFilename from './utils/parseAdFilename';

const AdminImportAssets = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    try {
      const text = await file.text();
      const lines = text.trim().split(/\r?\n/);
      if (lines.length <= 1) {
        window.alert('No asset rows found in CSV');
        return;
      }
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const findCol = (k) => headers.findIndex((h) => h.includes(k));
      const groupCol = findCol('group');
      const fileCol = findCol('file');
      let urlCol = findCol('url');
      if (urlCol === -1) urlCol = findCol('link');
      if (groupCol === -1 || fileCol === -1) {
        window.alert('Required columns not found');
        return;
      }
      const batch = writeBatch(db);
      for (let i = 1; i < lines.length; i += 1) {
        const parts = lines[i].split(',').map((p) => p.trim());
        const groupId = parts[groupCol];
        const filename = parts[fileCol];
        if (!groupId || !filename) continue;
        const fileUrl = urlCol >= 0 ? parts[urlCol] : '';
        const info = parseAdFilename(filename);
        batch.set(doc(collection(db, 'adGroups', groupId, 'assets')), {
          adGroupId: groupId,
          brandCode: info.brandCode || '',
          adGroupCode: info.adGroupCode || '',
          recipeCode: info.recipeCode || '',
          aspectRatio: info.aspectRatio || '',
          filename,
          firebaseUrl: fileUrl,
          uploadedAt: serverTimestamp(),
          status: 'pending',
          comment: null,
          lastUpdatedBy: null,
          lastUpdatedAt: serverTimestamp(),
          version: info.version || 1,
          parentAdId: null,
          isResolved: false,
        });
      }
      await batch.commit();
      window.alert('Assets imported');
    } catch (err) {
      console.error('Failed to import assets', err);
      window.alert('Failed to import assets');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Import Assets</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block"
        />
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Uploading...' : 'Upload CSV'}
        </button>
      </form>
    </div>
  );
};

export default AdminImportAssets;
