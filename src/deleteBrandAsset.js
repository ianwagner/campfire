import { getStorage, ref, deleteObject } from 'firebase/storage';
import { app } from './firebase/config';

const storage = getStorage(app);

export async function deleteBrandAsset(url) {
  if (!url) return;
  const fileRef = ref(storage, url);
  try {
    await deleteObject(fileRef);
  } catch (err) {
    console.error('Failed to delete brand asset', err);
    throw err;
  }
}
