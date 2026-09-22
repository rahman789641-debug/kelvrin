import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  User as FirebaseUser
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';

export interface GoogleAuthResult {
  idToken: string;
  email: string;
  displayName: string;
  photoURL?: string;
  uid: string;
}

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {} as Record<string, string>;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyDaypBqb4jjtjsU88FyB9ulGQ_ISBEKoUU',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'kelvrinapp.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'kelvrinapp',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'kelvrinapp.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '863641797040',
  appId: env.VITE_FIREBASE_APP_ID || '1:863641797040:web:9835583dfbb24bd8ad5675',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || 'G-3Q1RFJ4G2J',
};

// Initialize Firebase App instance
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase Auth & Firestore Cloud DB
export const auth = getAuth(app);
export const db = getFirestore(app);

// Configure Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
// Force account selection so that Google displays the user's available email accounts
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Initialize Analytics safely if browser environment supports it
export let analytics: any = null;
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      try {
        analytics = getAnalytics(app);
      } catch (err) {
        console.debug('[Firebase] Analytics init skipped:', err);
      }
    }
  }).catch(() => {});
}

export const isFirebaseConfigured = (): boolean => {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.apiKey !== 'your-firebase-api-key'
  );
};

/**
 * Triggers Google Sign-In with real Firebase Popup.
 * Opens the Google account selection dialog, authenticates the user,
 * and returns the verified user identity token, email, name, avatar, and uid.
 */
export async function signInWithGoogleIdentity(preferredEmail?: string): Promise<GoogleAuthResult> {
  try {
    if (preferredEmail) {
      googleProvider.setCustomParameters({
        prompt: 'select_account',
        login_hint: preferredEmail,
      });
    } else {
      googleProvider.setCustomParameters({
        prompt: 'select_account',
      });
    }

    const result = await signInWithPopup(auth, googleProvider);
    const user: FirebaseUser = result.user;
    const idToken = await user.getIdToken();

    return {
      idToken,
      email: user.email || '',
      displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'User'),
      photoURL: user.photoURL || undefined,
      uid: user.uid,
    };
  } catch (error: any) {
    console.error('[Firebase Auth] Google Sign-In Error:', error);

    if (error.code === 'auth/popup-closed-by-user') {
      throw new Error('Google Sign-In popup was closed before completing.');
    }
    if (error.code === 'auth/cancelled-popup-request') {
      throw new Error('Google Sign-In was cancelled.');
    }
    if (error.code === 'auth/popup-blocked') {
      throw new Error('Google Sign-In popup was blocked by your browser. Please allow popups for this site.');
    }
    if (error.code === 'auth/operation-not-allowed') {
      throw new Error('Google Sign-In is not enabled in Firebase Console. Please enable Google under Authentication > Sign-in method.');
    }
    if (error.code === 'auth/unauthorized-domain') {
      throw new Error(`Domain (${window.location.hostname}) is not authorized in Firebase. Add it to Firebase Console > Authentication > Settings > Authorized domains.`);
    }

    throw new Error(error.message || 'Google Authentication failed.');
  }
}

export async function signOutGoogleIdentity(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch (err) {
    console.warn('[Firebase Auth] Sign out notice:', err);
  }
  localStorage.removeItem('kelvrin_session_token');
  localStorage.removeItem('kelvrin_user');
}
