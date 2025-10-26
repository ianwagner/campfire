import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from './firebase/config';

const storage = getStorage(app);

const sanitizeId = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return 'unassigned';
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-');
};

export async function uploadIntegrationLogo(file, integrationId = '') {
  if (!file) {
    throw new Error('No file provided');
  }
  const safeId = sanitizeId(integrationId);
  const extension = (() => {
    const parts = file.name?.split?.('.') || [];
    if (parts.length > 1) {
      return parts.pop();
    }
    return 'png';
  })();
  const timestamp = Date.now();
  const filePath = `Campfire/integrations/${safeId}/logo-${timestamp}.${extension}`;
  const fileRef = ref(storage, filePath);
  await uploadBytes(fileRef, file, {
    cacheControl: 'public,max-age=86400',
    contentType: file.type || undefined,
  });
  const downloadURL = await getDownloadURL(fileRef);
  return downloadURL;
}

export default uploadIntegrationLogo;
