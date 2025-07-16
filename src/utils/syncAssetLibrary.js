import {
  collection,
  getDocs,
  query,
  where,
  doc,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';

export default async function syncAssetLibrary(brandCode = '', assets = []) {
  if (!Array.isArray(assets)) return;

  const q = brandCode
    ? query(collection(db, 'adAssets'), where('brandCode', '==', brandCode))
    : collection(db, 'adAssets');
  const snap = await getDocs(q);
  const existingIds = snap.docs.map((d) => d.id);
  const incomingIds = assets.map((a) => a.id);

  const ops = [];

  for (const id of existingIds) {
    if (!incomingIds.includes(id)) {
      ops.push(deleteDoc(doc(db, 'adAssets', id)));
    }
  }

  for (const asset of assets) {
    if (!asset || !asset.id) continue;
    ops.push(
      setDoc(doc(db, 'adAssets', asset.id), { ...asset, brandCode }, { merge: true })
    );
  }

  await Promise.all(ops);
}
