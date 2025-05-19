// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDZ7h9KXAwIvzqFf9gMrMBOJvkMxSMjjRw",
  authDomain: "tak-campfire.firebaseapp.com",
  projectId: "tak-campfire",
  storageBucket: "tak-campfire.firebasestorage.app",
  messagingSenderId: "198332728326",
  appId: "1:198332728326:web:d7eec9d577fb30fa916f87",
  measurementId: "G-HR9YW7Y4H0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);