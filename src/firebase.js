import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyA0MLx37A85YFNu3S6-RDTB2kO6nQvHXhA",
  authDomain: "milo-sandbox-92c4a.firebaseapp.com",
  projectId: "milo-sandbox-92c4a",
  storageBucket: "milo-sandbox-92c4a.appspot.com",
  messagingSenderId: "480638447868",
  appId: "1:480638447868:web:500bceedac79ae61526779"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);

const auth = getAuth(app);

// 🔥 Set persistence immediately after creating auth
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log("✅ Auth persistence set to localStorage.");
  })
  .catch((error) => {
    console.error("❌ Failed to set auth persistence:", error);
  });

export { auth };

