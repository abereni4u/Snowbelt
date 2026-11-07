// Firebase setup (Role 4). Accounts, profiles with emergency contacts, and the neighbor help board.
// Fill frontend/.env.local from .env.example; until then the help features show a setup message.
import { initializeApp } from 'firebase/app'
import { GoogleAuthProvider, getAuth, signInWithPopup, signOut } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseReady = Boolean(config.apiKey && config.projectId)
const app = firebaseReady ? initializeApp(config) : null
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null

export async function signInWithGoogle() {
  if (auth) await signInWithPopup(auth, new GoogleAuthProvider())
}

export async function signOutUser() {
  if (auth) await signOut(auth)
}
