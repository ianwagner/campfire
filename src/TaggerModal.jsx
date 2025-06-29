import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot } from 'firebase/firestore';
import { functions, db } from './firebase/config';
import LoadingOverlay from './LoadingOverlay';

const TaggerModal = ({ onClose }) => {
  const [driveFolderUrl, setDriveFolderUrl] = useState('');
  const [campaign, setCampaign] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState('');

  useEffect(() => {
    if (!jobId) return undefined;
    const unsub = onSnapshot(doc(db, 'taggerJobs', jobId), (snap) => {
      const data = snap.data();
      if (!data) return;
      if (data.status === 'complete') {
        setResults(Array.isArray(data.results) ? data.results : []);
        setLoading(false);
      } else if (data.status === 'error') {
        setError(data.error || 'Failed to tag assets');
        setLoading(false);
      }
    });
    return () => unsub();
  }, [jobId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!driveFolderUrl || driveFolderUrl.trim() === '') {
      setError('Drive folder URL is required');
      return;
    }
    setLoading(true);
    setError('');
    setResults([]);
    setJobId('');
    try {
      const payload = {
        driveFolderUrl: driveFolderUrl.trim(),
        campaign,
      };
      const callable = httpsCallable(functions, 'tagger', { timeout: 300000 });
      const res = await callable({ data: payload, ...payload });
      if (res.data?.jobId) {
        setJobId(res.data.jobId);
      } else {
        throw new Error('No job ID returned');
      }
    } catch (err) {
      console.error('Tagger failed', err);
      if (err) {
        console.error('Error code:', err.code);
        console.error('Error message:', err.message);
        console.error('Error details:', err.details);
      }
      setError('Failed to tag assets');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-4 rounded shadow max-w-lg w-full relative dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
        {loading && <LoadingOverlay text="Tagging assets..." className="!absolute" />}
        <h3 className="mb-2 font-semibold">Tag Assets from Drive</h3>
        {(!jobId || loading) ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block mb-1 text-sm">Google Drive Folder Link</label>
              <input
                type="text"
                value={driveFolderUrl}
                onChange={(e) => setDriveFolderUrl(e.target.value)}
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
                Start Tagging
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto max-h-96">
              <table className="ad-table min-w-max text-sm">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>URL</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Product</th>
                    <th>Campaign</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, idx) => (
                    <tr key={idx}>
                      <td>{r.name}</td>
                      <td className="max-w-[8rem] truncate">
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline">
                          {r.url}
                        </a>
                      </td>
                      <td>{r.type}</td>
                      <td>{r.description}</td>
                      <td>{r.product}</td>
                      <td>{r.campaign}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-right">
              <button onClick={onClose} className="btn-secondary px-3 py-1">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaggerModal;
