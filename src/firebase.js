import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDY_xMGEg_7H34HPJG0xRuMOfKEKFyalGA",
  authDomain: "timetracker-866e1.firebaseapp.com",
  projectId: "timetracker-866e1",
  storageBucket: "timetracker-866e1.firebasestorage.app",
  messagingSenderId: "149059943839",
  appId: "1:149059943839:web:8d5afd3120b5ac836e91aa",
  measurementId: "G-XMZV097TD0"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
