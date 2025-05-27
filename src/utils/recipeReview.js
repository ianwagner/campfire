import {
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  getDoc,
  serverTimestamp,
  Timestamp,
  arrayUnion
} from 'firebase/firestore';
import { db } from '../firebase/config';

export async function fetchReadyRecipes({ groupId = null, brandCodes = [] } = {}) {
  if (!groupId && (!brandCodes || brandCodes.length === 0)) return [];
  let snap;
  if (groupId) {
    const col = collection(db, 'adGroups', groupId, 'recipes');
    const q = query(col, where('status', '==', 'ready'));
    snap = await getDocs(q);
  } else {
    const col = collectionGroup(db, 'recipes');
    const q = query(col, where('brandCode', 'in', brandCodes), where('status', '==', 'ready'));
    snap = await getDocs(q);
  }
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), groupId: groupId || d.ref.parent.parent.id }));
}

export async function recordRecipeDecision(groupId, recipeId, decision, {
  userId = null,
  userEmail = null,
  reviewerName = '',
  userRole = null
} = {}, comment = '') {
  const recipeRef = doc(db, 'adGroups', groupId, 'recipes', recipeId);
  const newStatus =
    decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'edit_requested';

  const historyEntry = {
    userId,
    userEmail,
    userName: reviewerName,
    ...(userRole ? { userRole } : {}),
    action: newStatus,
    comment: decision === 'edit' ? comment : '',
    timestamp: Timestamp.now()
  };

  await updateDoc(recipeRef, {
    status: newStatus,
    comment: decision === 'edit' ? comment : '',
    lastUpdatedBy: userId,
    lastUpdatedAt: serverTimestamp(),
    history: arrayUnion(historyEntry)
  });

  await addDoc(collection(db, 'adGroups', groupId, 'recipeResponses'), {
    recipeId,
    decision,
    comment: decision === 'edit' ? comment : '',
    timestamp: serverTimestamp(),
    userId,
    userEmail,
    reviewerName,
    userRole
  });
}

export async function incrementRecipeVersion(groupId, recipeId) {
  const recipeRef = doc(db, 'adGroups', groupId, 'recipes', recipeId);
  const snap = await getDoc(recipeRef);
  if (!snap.exists()) return;
  const current = snap.data().version || 1;
  await updateDoc(recipeRef, {
    version: current + 1,
    status: 'ready',
    lastUpdatedAt: serverTimestamp()
  });
}

