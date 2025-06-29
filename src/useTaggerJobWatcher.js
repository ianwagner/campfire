import { useEffect } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from './firebase/config';

const saveResults = (results) => {
  try {
    const raw = localStorage.getItem('assetLibrary');
    const existing = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(existing) ? existing : [];
    const newRows = (Array.isArray(results) ? results : []).map((r) => ({
      id: Math.random().toString(36).slice(2),
      ...r,
    }));
    localStorage.setItem('assetLibrary', JSON.stringify([...arr, ...newRows]));
  } catch (err) {
    console.error('Failed to save tagger results', err);
  }
};

export default function useTaggerJobWatcher() {
  useEffect(() => {
    const jobId = localStorage.getItem('pendingTaggerJobId');
    if (!jobId) return undefined;
    if (localStorage.getItem('taggerModalOpen') === 'true') return undefined;

    const handleData = (data) => {
      if (data.status === 'complete') {
        saveResults(data.results);
        localStorage.removeItem('pendingTaggerJobId');
      } else if (data.status === 'error') {
        localStorage.removeItem('pendingTaggerJobId');
      }
    };

    let unsub = null;
    const init = async () => {
      try {
        const snap = await getDoc(doc(db, 'taggerJobs', jobId));
        if (snap.exists()) {
          const d = snap.data();
          if (d.status === 'complete' || d.status === 'error') {
            handleData(d);
            return;
          }
        }
        unsub = onSnapshot(doc(db, 'taggerJobs', jobId), (s) => {
          const d = s.data();
          if (!d) return;
          if (d.status === 'complete' || d.status === 'error') handleData(d);
        });
      } catch (err) {
        console.error('Failed to watch tagger job', err);
      }
    };

    init();

    return () => {
      if (unsub) unsub();
    };
  }, []);
}
