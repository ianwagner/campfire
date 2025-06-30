import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase/config';
import LoadingOverlay from './LoadingOverlay';

const AddFromDriveModal = ({ onClose, addRows }) => {
  const [folderUrl, setFolderUrl] = useState('');
  const [campaign, setCampaign] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!folderUrl.trim()) {
      setError('Drive folder URL is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const callable = httpsCallable(functions, 'listDriveImages', { timeout: 60000 });
      const res = await callable({ folderUrl: folderUrl.trim() });
      const files = res.data?.files || [];
      const rows = files.map((f) => ({ name: f.name, url: f.url, campaign }));
      addRows(rows);
      onClose();
    } catch (err) {
      console.error('Failed to list drive images', err);
      setError('Failed to list images');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-4 rounded shadow max-w-lg w-full relative dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
        {loading && <LoadingOverlay text="Loading..." className="!absolute" />}
        <h3 className="mb-2 font-semibold">Add Rows from Drive</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block mb-1 text-sm">Google Drive Folder Link</label>
            <input
              type="text"
              value={folderUrl}
              onChange={(e) => setFolderUrl(e.target.value)}
              className="w-full p-1 border rounded"
              required
            />
          </div>
          <div>
            <label className="block mb-1 text-sm">Campaign Name</label>
            <input
              type="text"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              className="w-full p-1 border rounded"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="text-right space-x-2">
            <button type="button" onClick={onClose} className="btn-secondary px-3 py-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary px-3 py-1" disabled={loading}>
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddFromDriveModal;
