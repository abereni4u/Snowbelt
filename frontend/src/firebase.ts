// Firebase setup (Role 4). Accounts, profiles with emergency contacts, and the neighbor help board.
// Fill frontend/.env.local from .env.example; until then the help features show a setup message.
import { initializeApp } from 'firebase/app'
import { GoogleAuthProvider, getAuth, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth'
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

// What each common sign-in failure means and how to fix it (shown in the app instead of failing silently)
const SIGN_IN_HELP: Record<string, string> = {
  'auth/unauthorized-domain': `Firebase doesn't allow sign-in from ${window.location.hostname}. Open the app at http://localhost:5173 (not 127.0.0.1 or a network IP), or add this domain in Firebase console > Authentication > Settings > Authorized domains.`,
  'auth/operation-not-allowed': 'Google sign-in is turned off for this Firebase project. Firebase console > Authentication > Sign-in method > Google > Enable.',
  'auth/configuration-not-found': "Authentication isn't set up for this Firebase project yet. Firebase console > Authentication > Get started, then enable Google.",
  'auth/invalid-api-key': 'The Firebase API key in frontend/.env.local is wrong. Copy it again from Firebase console > Project settings > Your apps.',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'The Firebase API key in frontend/.env.local is wrong. Copy it again from Firebase console > Project settings > Your apps.',
  'auth/popup-closed-by-user': 'The sign-in window closed before you finished. Try again.',
  'auth/network-request-failed': "Couldn't reach Google. Check your connection and try again.",
}

let reportError: (message: string) => void = (message) => console.warn(message)
export function onSignInError(listener: (message: string) => void) {
  reportError = listener
}

export async function signInWithGoogle() {
  if (!auth) return
  const provider = new GoogleAuthProvider()
  try {
    await signInWithPopup(auth, provider)
  } catch (error) {
    const code = (error as { code?: string }).code ?? ''
    // Popup blocked by the browser: sign in on a full page instead
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider)
      return
    }
    if (code === 'auth/cancelled-popup-request') return
    console.error('Sign-in failed', error)
    reportError(SIGN_IN_HELP[code] ?? `Sign-in failed (${code || 'unknown error'}). Check the browser console for details.`)
  }
}

export async function signOutUser() {
  if (auth) await signOut(auth)
}
