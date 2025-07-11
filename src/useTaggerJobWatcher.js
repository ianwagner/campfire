import { useEffect } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import syncAssetLibrary from "./utils/syncAssetLibrary";

const saveResults = async (brandCode, results) => {
  try {
    const key = brandCode ? `assetLibrary_${brandCode}` : 'assetLibrary';
    const raw = localStorage.getItem(key);
    const existing = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(existing) ? existing : [];
    const newRows = (Array.isArray(results) ? results : []).map((r) => ({
      id: Math.random().toString(36).slice(2),
      ...r,
    }));
    localStorage.setItem(key, JSON.stringify([...arr, ...newRows]));
    await syncAssetLibrary(brandCode, [...arr, ...newRows]);
  } catch (err) {
    console.error('Failed to save tagger results', err);
  }
};

export default function useTaggerJobWatcher() {
  useEffect(() => {
    const jobId = localStorage.getItem('pendingTaggerJobId');
    const brandCode = localStorage.getItem('pendingTaggerJobBrand') || '';
    if (!jobId) return undefined;
    if (localStorage.getItem('taggerModalOpen') === 'true') return undefined;

    const handleData = (data) => {
      if (data.status === 'complete') {
        saveResults(brandCode, data.results);
        localStorage.removeItem('pendingTaggerJobId');
        localStorage.removeItem('pendingTaggerJobBrand');
      } else if (data.status === 'error') {
        localStorage.removeItem('pendingTaggerJobId');
        localStorage.removeItem('pendingTaggerJobBrand');
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
