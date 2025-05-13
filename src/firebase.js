import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCxfRASursqFekKV8aNBP8fC9DxIIhqOwE",
  authDomain: "milo-live-4a8b5.firebaseapp.com",
  projectId: "milo-live-4a8b5",
  storageBucket: "milo-live-4a8b5.appspot.com",
  messagingSenderId: "14607500766",
  appId: "1:14607500766:web:e2188b4cca4b49c938094f"
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

