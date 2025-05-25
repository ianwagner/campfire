import { collection, getDocs, query, where, doc, deleteDoc } from 'firebase/firestore';
import { listAll, ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase/config';

const removeFolder = async (folderRef) => {
  const res = await listAll(folderRef);
  await Promise.all(res.items.map((i) => deleteObject(i)));
  await Promise.all(res.prefixes.map((p) => removeFolder(p)));
};

export default async function deleteGroup(groupId, brandCode, groupName) {
  const assetSnap = await getDocs(collection(db, 'adGroups', groupId, 'assets'));
  await Promise.all(
    assetSnap.docs.map((d) => deleteDoc(doc(db, 'adGroups', groupId, 'assets', d.id)))
  );

  const crossQuery = query(collection(db, 'adAssets'), where('adGroupId', '==', groupId));
  const crossSnap = await getDocs(crossQuery);
  await Promise.all(crossSnap.docs.map((d) => deleteDoc(doc(db, 'adAssets', d.id))));

  const path = `Campfire/Brands/${brandCode}/Adgroups/${groupName}`;
  await removeFolder(ref(storage, path));

  await deleteDoc(doc(db, 'adGroups', groupId));
}
