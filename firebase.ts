import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type Auth,
  type UserCredential,
  type User as FirebaseUser,
  type NextOrObserver,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  type Firestore,
} from 'firebase/firestore';

// Official ColtaneDB Firebase project credentials
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || 'AIzaSyColtaneDBProductionKeyPlaceholder',
  authDomain: 'coltanedb.firebaseapp.com',
  projectId: 'coltanedb',
  storageBucket: 'coltanedb.firebasestorage.app',
  messagingSenderId: '573404384111',
  appId: '1:573404384111:web:9add23b082210d273b769a',
};

export function getOrInitFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  const apps = getApps();
  const app = apps.length > 0 && apps[0] ? apps[0] : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  return { app, auth, db };
}

export const { app, auth, db } = getOrInitFirebase();
export const googleProvider = new GoogleAuthProvider();

export async function signUp(email: string, password: string): Promise<UserCredential> {
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function login(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function loginWithGoogle(): Promise<UserCredential> {
  return signInWithPopup(auth, googleProvider);
}

export async function logout(): Promise<void> {
  return signOut(auth);
}

export function subscribeToAuthState(callback: NextOrObserver<FirebaseUser>): () => void {
  return onAuthStateChanged(auth, callback);
}

export {
  onAuthStateChanged,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
};
