import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// ✅ Fixed: Correct Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDZ7h9KXAwIvzqFf9gMrMBOJvkMxSMjjRw",
  authDomain: "tak-campfire.firebaseapp.com",
  projectId: "tak-campfire",
  storageBucket: "tak-campfire.appspot.com", // ✅ fixed this
  messagingSenderId: "198332728326",
  appId: "1:198332728326:web:d7eec9d577fb30fa916f87"
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);

// ✅ Export services you'll use
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
