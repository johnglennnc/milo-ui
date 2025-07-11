// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyA0MLx37A85YFNu3S6-RDTB2kO6nQvHXhA",
  authDomain: "milo-sandbox-92c4a.firebaseapp.com",
  projectId: "milo-sandbox-92c4a",
  storageBucket: "milo-sandbox-92c4a.firebasestorage.app",
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

// Save lab result to patient history
export const saveLabResult = async (patientId, labData) => {
  try {
    await db
      .collection('patients')
      .doc(patientId)
      .collection('labHistory')
      .add({
        ...labData,
        date: new Date().toISOString(),
      });
    console.log('Lab result saved');
  } catch (error) {
    console.error('Error saving lab result:', error);
  }
};

// Fetch patient lab history
export const getPatientHistory = async (patientId) => {
  try {
    const snapshot = await db
      .collection('patients')
      .doc(patientId)
      .collection('labHistory')
      .orderBy('date', 'desc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error fetching history:', error);
    return [];
  }
};
