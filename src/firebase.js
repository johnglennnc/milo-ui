// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc, addDoc, collection, query, orderBy, getDocs } from 'firebase/firestore';
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

// ✅ Set auth persistence to local storage
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log("✅ Auth persistence set to localStorage.");
  })
  .catch((error) => {
    console.error("❌ Failed to set auth persistence:", error);
  });

export { auth };


// ✅ Save a lab result to /patients/{patientId}/labHistory subcollection
export const saveLabResult = async (patientId, labData) => {
  try {
    const labRef = collection(db, 'patients', patientId, 'labHistory');
    await addDoc(labRef, {
      ...labData,
      date: new Date().toISOString()
    });
    console.log('✅ Lab result saved to subcollection.');
  } catch (error) {
    console.error('❌ Error saving lab result:', error);
  }
};


// ✅ Get full patient lab history from /patients/{patientId}/labs array
export const getPatientHistory = async (patientId) => {
  try {
    const docRef = doc(db, 'patients', patientId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return [];

    const data = docSnap.data();
    return data.labs || [];
  } catch (error) {
    console.error('❌ Error fetching patient history:', error);
    return [];
  }
};
