import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from './firebase/config';

const storage = getStorage(app);

function sanitizeSegment(str) {
  return (str || '')
    .replace(/\//g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function uploadInstanceImage(file, componentKey, instanceName) {
  const compSegment = sanitizeSegment(componentKey);
  const instSegment = sanitizeSegment(instanceName);
  const filePath = `Campfire/Instances/${compSegment}/${instSegment}/${file.name}`;
  const fileRef = ref(storage, filePath);
  await uploadBytes(fileRef, file, {
    cacheControl: 'public,max-age=31536000,immutable',
  });
  const url = await getDownloadURL(fileRef);
  return url;
}
