import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from './firebase/config';

const storage = getStorage(app);

export async function uploadRecipeIcon(file) {
  const filePath = `Campfire/recipe-icons/${file.name}`;
  const fileRef = ref(storage, filePath);
  await uploadBytes(fileRef, file, {
    cacheControl: 'public,max-age=31536000,immutable',
  });
  const url = await getDownloadURL(fileRef);
  return url;
}
