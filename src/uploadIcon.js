import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from './firebase/config';

const storage = getStorage(app);

export async function uploadIcon(file) {
  const filePath = `Campfire/site-icon/${file.name}`;
  const fileRef = ref(storage, filePath);
  await uploadBytes(fileRef, file, {
    cacheControl: 'public,max-age=31536000,immutable',
  });
  const downloadURL = await getDownloadURL(fileRef);
  return downloadURL;
}
