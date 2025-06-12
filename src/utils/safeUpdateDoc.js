import { updateDoc } from 'firebase/firestore';

const RESERVED = ['createTime', 'updateTime', 'readTime'];
export async function safeUpdateDoc(ref, data) {
  const filtered = Object.fromEntries(
    Object.entries(data).filter(([k]) => !RESERVED.includes(k))
  );
  return updateDoc(ref, filtered);
}
