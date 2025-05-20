import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { app } from "./firebase/config";

const storage = getStorage(app);

export async function uploadFile(file, adGroupId) {
  const filePath = `adGroups/${adGroupId}/${file.name}`;
  const fileRef = ref(storage, filePath);
  await uploadBytes(fileRef, file);
  const downloadURL = await getDownloadURL(fileRef);
  return downloadURL;
}
