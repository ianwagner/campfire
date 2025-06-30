import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { auth, db } from './firebase/config';

const TaggerJobsPanel = ({ onClose }) => {
  const [jobs, setJobs] = useState([]);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return undefined;
    const q = query(
      collection(db, 'taggerJobs'),
      where('createdBy', '==', uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setJobs(arr);
    });
    return () => unsub();
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-4 rounded shadow max-w-lg w-full relative dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
        <button type="button" className="absolute top-2 right-2" onClick={onClose}>✕</button>
        <h3 className="mb-2 font-semibold">Tagging Jobs</h3>
        <div className="overflow-x-auto max-h-96">
          <table className="ad-table min-w-max text-sm">
            <thead>
              <tr>
                <th>Folder</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const pct = j.total ? Math.round((j.processed / j.total) * 100) : 0;
                return (
                  <tr key={j.id}>
                    <td className="break-all">{j.driveFolderUrl}</td>
                    <td>{j.status}</td>
                    <td>
                      <div className="progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
                        <div className="progress-bar-inner" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-xs text-right">{j.processed}/{j.total}</div>
                    </td>
                    <td className="text-xs text-red-600 break-all">{Array.isArray(j.errors) ? j.errors.join('; ') : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TaggerJobsPanel;
