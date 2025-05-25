import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from './firebase/config';

const storage = getStorage(app);

export async function uploadLogo(file) {
  const filePath = `Campfire/site-logo/${file.name}`;
  const fileRef = ref(storage, filePath);
  await uploadBytes(fileRef, file);
  const downloadURL = await getDownloadURL(fileRef);
  return downloadURL;
}
