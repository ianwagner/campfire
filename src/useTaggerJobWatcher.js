import { useEffect } from 'react';
import { doc, onSnapshot, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase/config';
import syncAssetLibrary from "./utils/syncAssetLibrary";
import { safeGetItem, safeRemoveItem } from './utils/safeLocalStorage.js';

const saveResults = async (brandCode, results) => {
  try {
    let q = collection(db, 'adAssets');
    if (brandCode) q = query(q, where('brandCode', '==', brandCode));
    const snap = await getDocs(q);
    const firebaseAssets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const arrByUrl = Object.fromEntries(firebaseAssets.filter(a => a.url).map(a => [a.url, a]));
    const arr = [...firebaseAssets];

    for (const r of (Array.isArray(results) ? results : [])) {
      if (arrByUrl[r.url]) continue;
      const newRow = { id: Math.random().toString(36).slice(2), ...r };
      arr.push(newRow);
      arrByUrl[r.url] = newRow;
    }

    await syncAssetLibrary(brandCode, arr);
  } catch (err) {
    console.error('Failed to save tagger results', err);
  }
};

export default function useTaggerJobWatcher() {
  useEffect(() => {
    const jobId = safeGetItem('pendingTaggerJobId');
    const brandCode = safeGetItem('pendingTaggerJobBrand') || '';
    if (!jobId) return undefined;
    if (safeGetItem('taggerModalOpen') === 'true') return undefined;

    const handleData = (data) => {
      if (data.status === 'complete') {
        saveResults(brandCode, data.results);
        safeRemoveItem('pendingTaggerJobId');
        safeRemoveItem('pendingTaggerJobBrand');
      } else if (data.status === 'error') {
        safeRemoveItem('pendingTaggerJobId');
        safeRemoveItem('pendingTaggerJobBrand');
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
