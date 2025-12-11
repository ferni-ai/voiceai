/**
 * Application State Management
 *
 * Centralized, type-safe state management for the Voice AI application.
 * Uses a simple observable pattern for state changes.
 *
 * Authentication Flow:
 * - On app load, Firebase Auth initializes (anonymous if no session)
 * - Firebase UID becomes the primary user identifier
 * - Device ID kept for migration of existing users
 */

import { STORAGE_KEYS } from '../config/index.js';
import { getCoach, getPersona } from '../config/personas.js';
import type { AuthState } from '../services/firebase-auth.service.js';
import type { AudioState, ConnectionState, SpotifyState } from '../types/events.js';
import type { PersonaConfig, PersonaId } from '../types/persona.js';

// ============================================================================
// STATE SHAPE
// ============================================================================

/**
 * Complete application state.
 */
export interface AppState {
  /** Current connection status */
  readonly connection: ConnectionState;

  /** Active persona (who's currently speaking) */
  readonly activePersona: PersonaConfig;

  /** Selected persona (user's choice at connection time) */
  readonly selectedPersona: PersonaConfig;

  /** Current audio activity state */
  readonly audio: AudioState;

  /** Spotify player state */
  readonly spotify: SpotifyState;

  /** User's display name */
  readonly userName: string | null;

  /** Device ID for session tracking (legacy, kept for migration) */
  readonly deviceId: string;

  /** Firebase UID - primary user identifier */
  readonly firebaseUid: string | null;

  /** Whether user has a linked account (not just anonymous) */
  readonly isAccountLinked: boolean;

  /** User's email (if linked) */
  readonly userEmail: string | null;

  /** Current message being displayed */
  readonly currentMessage: string | null;

  /** Whether user is muted */
  readonly isMuted: boolean;

  /** Whether the agent is wrapping up the conversation */
  readonly isWrappingUp: boolean;
}

// ============================================================================
// STATE SUBSCRIBER
// ============================================================================

/**
 * Function called when state changes.
 */
export type StateSubscriber<K extends keyof AppState> = (
  newValue: AppState[K],
  oldValue: AppState[K]
) => void;

/**
 * Subscription tracking.
 */
interface Subscription<K extends keyof AppState> {
  key: K;
  callback: StateSubscriber<K>;
}

// ============================================================================
// STATE STORE
// ============================================================================

/**
 * Generate a unique device ID.
 */
function generateDeviceId(): string {
  return `device_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Safe localStorage getter (handles private browsing mode).
 */
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Private browsing mode or localStorage unavailable
    return null;
  }
}

/**
 * Safe localStorage setter (handles private browsing mode).
 */
function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing mode - silently ignore
    console.debug(`Could not persist ${key} (private browsing?)`);
  }
}

/**
 * Load persisted state from localStorage.
 */
function loadPersistedState(): Partial<AppState> {
  const userName = safeGetItem(STORAGE_KEYS.USER_NAME);
  const deviceId = safeGetItem(STORAGE_KEYS.DEVICE_ID) ?? generateDeviceId();
  const personaId = safeGetItem(STORAGE_KEYS.SELECTED_PERSONA);

  // Persist device ID if newly generated
  if (!safeGetItem(STORAGE_KEYS.DEVICE_ID)) {
    safeSetItem(STORAGE_KEYS.DEVICE_ID, deviceId);
  }

  // NOTE: ferni_user_id is now managed by Firebase auth
  // We keep device ID for backward compatibility during migration
  // The primary user ID is now the Firebase UID

  return {
    userName,
    deviceId,
    selectedPersona: personaId ? getPersona(personaId) : getCoach(),
  };
}

/**
 * Create initial application state.
 */
function createInitialState(): AppState {
  const persisted = loadPersistedState();
  const coach = getCoach();
  const initialPersona = persisted.selectedPersona ?? coach;

  // Set initial theme on document
  if (typeof document !== 'undefined') {
    document.body.setAttribute('data-persona', initialPersona.id);
  }

  return {
    connection: 'disconnected',
    activePersona: initialPersona,
    selectedPersona: initialPersona,
    audio: 'idle',
    spotify: 'uninitialized',
    userName: persisted.userName ?? null,
    deviceId: persisted.deviceId ?? generateDeviceId(),
    firebaseUid: null, // Set after Firebase auth initializes
    isAccountLinked: false,
    userEmail: null,
    currentMessage: null,
    isMuted: false,
    isWrappingUp: false,
  };
}

// ============================================================================
// STATE STORE CLASS
// ============================================================================

/**
 * Type-safe state store with subscription support.
 */
class AppStateStore {
  private state: AppState;
  private subscriptions: Subscription<keyof AppState>[] = [];

  constructor() {
    this.state = createInitialState();
  }

  /**
   * Get current state (immutable snapshot).
   */
  getState(): Readonly<AppState> {
    return { ...this.state };
  }

  /**
   * Get a specific state value.
   */
  get<K extends keyof AppState>(key: K): AppState[K] {
    return this.state[key];
  }

  /**
   * Update state and notify subscribers.
   */
  set<K extends keyof AppState>(key: K, value: AppState[K]): void {
    const oldValue = this.state[key];
    if (oldValue === value) return;

    // Create new state object (immutable update)
    this.state = {
      ...this.state,
      [key]: value,
    };

    // Persist certain values to localStorage
    this.persistState(key, value);

    // Notify subscribers
    this.notifySubscribers(key, value, oldValue);
  }

  /**
   * Update multiple state values at once.
   */
  update(updates: Partial<AppState>): void {
    for (const [key, value] of Object.entries(updates)) {
      this.set(key as keyof AppState, value as AppState[keyof AppState]);
    }
  }

  /**
   * Subscribe to state changes for a specific key.
   */
  subscribe<K extends keyof AppState>(key: K, callback: StateSubscriber<K>): () => void {
    const subscription = { key, callback } as unknown as Subscription<keyof AppState>;
    this.subscriptions.push(subscription);

    // Return unsubscribe function
    return () => {
      const index = this.subscriptions.indexOf(subscription);
      if (index > -1) {
        this.subscriptions.splice(index, 1);
      }
    };
  }

  /**
   * Persist specific state values to localStorage.
   * Uses safe methods to handle private browsing mode.
   */
  private persistState<K extends keyof AppState>(key: K, value: AppState[K]): void {
    switch (key) {
      case 'userName':
        if (typeof value === 'string') {
          safeSetItem(STORAGE_KEYS.USER_NAME, value);
        }
        break;
      case 'selectedPersona':
        if (value && typeof value === 'object' && 'id' in value) {
          const persona = value as { id: string };
          safeSetItem(STORAGE_KEYS.SELECTED_PERSONA, persona.id);
        }
        break;
      case 'deviceId':
        if (typeof value === 'string') {
          safeSetItem(STORAGE_KEYS.DEVICE_ID, value);
        }
        break;
    }
  }

  /**
   * Notify relevant subscribers of state changes.
   */
  private notifySubscribers<K extends keyof AppState>(
    key: K,
    newValue: AppState[K],
    oldValue: AppState[K]
  ): void {
    for (const sub of this.subscriptions) {
      if (sub.key === key) {
        (sub.callback as StateSubscriber<K>)(newValue, oldValue);
      }
    }
  }

  /**
   * Reset state to initial values (for testing or logout).
   */
  reset(): void {
    this.state = createInitialState();
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Singleton state store instance.
 */
export const appState = new AppStateStore();

// ============================================================================
// CONVENIENCE ACTIONS
// ============================================================================

/**
 * Update connection state and notify UI components.
 */
export function setConnectionState(state: ConnectionState): void {
  appState.set('connection', state);

  // Dispatch event for UI components (connection heart, favicon, etc.)
  window.dispatchEvent(
    new CustomEvent('ferni:connection-state', {
      detail: { state },
    })
  );
}

/**
 * Update active persona (who's currently speaking).
 * Also updates the document's data-persona attribute for theme colors.
 */
export function setActivePersona(personaId: PersonaId): void {
  const persona = getPersona(personaId);
  appState.set('activePersona', persona);

  // Update document theme for CSS persona variables
  document.body.setAttribute('data-persona', personaId);
}

/**
 * Update selected persona (user's choice).
 */
export function setSelectedPersona(personaId: PersonaId): void {
  const persona = getPersona(personaId);
  appState.set('selectedPersona', persona);
  appState.set('activePersona', persona);

  // Update document theme for CSS persona variables
  document.body.setAttribute('data-persona', personaId);
}

/**
 * Update user name.
 */
export function setUserName(name: string): void {
  appState.set('userName', name);
}

/**
 * Show a message.
 */
export function setMessage(message: string | null): void {
  appState.set('currentMessage', message);
}

/**
 * Update Spotify state.
 */
export function setSpotifyState(state: SpotifyState): void {
  appState.set('spotify', state);
}

/**
 * Update audio state.
 */
export function setAudioState(state: AudioState): void {
  appState.set('audio', state);
}

/**
 * Get current device ID.
 */
export function getDeviceId(): string {
  return appState.getState().deviceId;
}

/**
 * Set wrap-up state (agent is saying goodbye).
 */
export function setWrappingUp(isWrappingUp: boolean): void {
  appState.set('isWrappingUp', isWrappingUp);
}

// ============================================================================
// FIREBASE AUTH STATE
// ============================================================================

/**
 * Update Firebase auth state from AuthState.
 * Called by the auth state listener after Firebase initializes.
 */
export function updateAuthState(authState: AuthState): void {
  appState.update({
    firebaseUid: authState.uid,
    isAccountLinked: authState.isLinked,
    userEmail: authState.email,
    // Update display name if provided by auth and we don't have one
    userName: authState.displayName || appState.get('userName'),
  });

  // Update ferni_user_id for API calls if we have a Firebase UID
  if (authState.uid) {
    safeSetItem(STORAGE_KEYS.USER_ID, authState.uid);
  }
}

/**
 * Get current Firebase UID.
 * Returns null if Firebase auth hasn't initialized yet.
 */
export function getFirebaseUid(): string | null {
  return appState.getState().firebaseUid;
}

/**
 * Get the primary user ID for API calls.
 * Prefers Firebase UID, falls back to device-based ID.
 */
export function getUserId(): string {
  const state = appState.getState();

  // Prefer Firebase UID
  if (state.firebaseUid) {
    return state.firebaseUid;
  }

  // Fallback to device-based ID for migration
  return `device:${state.deviceId}`;
}

/**
 * Check if user has linked their account (not just anonymous).
 */
export function isAccountLinked(): boolean {
  return appState.getState().isAccountLinked;
}
