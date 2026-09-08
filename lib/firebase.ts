import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: "AIzaSyCnHWyT_QBD4HKO9mMwkcLLcFIgXHrdaZI",
  authDomain: "tetherly-usdt.firebaseapp.com",
  projectId: "tetherly-usdt",
  storageBucket: "tetherly-usdt.firebasestorage.app",
  messagingSenderId: "952995446713",
  appId: "1:952995446713:web:ab3b72e471fb46daba8068",
};

// Initialize Firebase (singleton pattern for Next.js SSR and client)
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
