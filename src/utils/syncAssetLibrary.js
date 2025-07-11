import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export default async function syncAssetLibrary(brandCode = '', assets = []) {
  if (!Array.isArray(assets)) return;
  const ops = [];
  for (const asset of assets) {
    if (!asset || !asset.id) continue;
    ops.push(
      setDoc(doc(db, 'adAssets', asset.id), { ...asset, brandCode }, { merge: true })
    );
  }
  await Promise.all(ops);
}
