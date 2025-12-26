/**
 * Firebase Stub
 *
 * Provides empty implementations for Firebase SDK
 * when running in development without Firebase credentials.
 *
 * This allows the dev server to run without import errors.
 * The actual services detect when Firebase is not configured
 * and handle it gracefully.
 */

// Stub types for firebase/app
export interface FirebaseApp {
  name: string;
  options: Record<string, unknown>;
  automaticDataCollectionEnabled: boolean;
}

export interface FirebaseOptions {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
}

// Stub for firebase/app
export const initializeApp = (_options?: FirebaseOptions, _name?: string): FirebaseApp => ({
  name: '[DEFAULT]',
  options: {},
  automaticDataCollectionEnabled: false,
});
export const getApps = (): FirebaseApp[] => [];
export const getApp = (_name?: string): FirebaseApp => ({
  name: '[DEFAULT]',
  options: {},
  automaticDataCollectionEnabled: false,
});

// Provider info type
export interface UserInfo {
  providerId: string;
  uid: string;
  displayName: string | null;
  email: string | null;
  phoneNumber: string | null;
  photoURL: string | null;
}

// Stub types for firebase/auth
export type Auth = {
  currentUser: User | null;
  app: FirebaseApp;
  onAuthStateChanged: (callback: (user: User | null) => void) => () => void;
};

export type User = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
  isAnonymous: boolean;
  emailVerified: boolean;
  providerData: UserInfo[];
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  reload: () => Promise<void>;
  delete: () => Promise<void>;
};

export type UserCredential = {
  user: User;
  providerId: string | null;
  operationType: string;
};

export type Unsubscribe = () => void;

// Stub for firebase/auth
export const getAuth = (_app?: FirebaseApp): Auth => ({
  currentUser: null,
  app: _app ?? getApp(),
  onAuthStateChanged: (callback: (user: User | null) => void) => {
    callback(null);
    return () => {};
  },
});

export const onAuthStateChanged = (
  _auth: Auth,
  callback: (user: User | null) => void
): Unsubscribe => {
  callback(null);
  return () => {};
};

export const signInWithCustomToken = (_auth: Auth, _customToken: string): Promise<UserCredential> => {
  return Promise.reject(new Error('Firebase not configured'));
};

export const signInAnonymously = (_auth: Auth): Promise<UserCredential> => {
  return Promise.reject(new Error('Firebase not configured'));
};

export const signInWithPopup = (_auth: Auth, _provider: unknown): Promise<UserCredential> => {
  return Promise.reject(new Error('Firebase not configured'));
};

export const signOut = (_auth: Auth) => Promise.resolve();

export const linkWithCredential = (_user: User, _credential: unknown): Promise<UserCredential> => {
  return Promise.reject(new Error('Firebase not configured'));
};

export const sendPasswordResetEmail = (_auth: Auth, _email: string) => {
  return Promise.reject(new Error('Firebase not configured'));
};

// Provider classes
export const GoogleAuthProvider = class {
  static PROVIDER_ID = 'google.com';
  static credential(_idToken: string, _accessToken?: string) {
    return { providerId: 'google.com' };
  }
  addScope(_scope: string) { return this; }
};

export const EmailAuthProvider = class {
  static PROVIDER_ID = 'password';
  static credential(email: string, _password: string) {
    return { providerId: 'password', email };
  }
};

export const OAuthProvider = class {
  providerId: string;
  constructor(providerId: string) {
    this.providerId = providerId;
  }
  static credential(_idToken: string) {
    return { providerId: 'oauth' };
  }
  addScope(_scope: string) { return this; }
  setCustomParameters(_params: Record<string, string>) { return this; }
};

export const connectAuthEmulator = () => {};

export default {
  initializeApp,
  getApps,
  getApp,
  getAuth,
  onAuthStateChanged,
  signInWithCustomToken,
  signInAnonymously,
  signInWithPopup,
  signOut,
  linkWithCredential,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  EmailAuthProvider,
  OAuthProvider,
  connectAuthEmulator,
};
