import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { app } from "./firebase/config";

const storage = getStorage(app);

// Uploads an asset to Firebase Storage using a readable folder structure.
// Brand code and group name are included so the folder path mirrors the UI hierarchy.
function sanitizeSegment(str) {
  return (str || '')
    .replace(/\//g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function uploadFile(file, adGroupId, brandCode, groupName) {
  const brandSegment = sanitizeSegment(brandCode);
  const groupSegment = sanitizeSegment(groupName);
  const filePath = `Campfire/Brands/${brandSegment}/Adgroups/${groupSegment}/${file.name}`;
  const fileRef = ref(storage, filePath);
  await uploadBytes(fileRef, file, {
    cacheControl: 'public,max-age=31536000,immutable',
  });
  const downloadURL = await getDownloadURL(fileRef);
  return downloadURL;
}
