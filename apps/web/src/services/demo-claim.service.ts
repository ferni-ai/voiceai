/**
 * Demo Session Claim Service
 *
 * "Better than human" - Remember conversations before formal introduction.
 *
 * This service handles the magic moment when a demo user creates an account:
 * - Detects claim token from URL or localStorage
 * - Claims the demo session from the backend
 * - Stores conversation highlights for Ferni to reference
 * - Shows a warm acknowledgment
 *
 * Flow:
 * 1. User talks to Ferni on landing page (demo)
 * 2. Demo session stores conversation with claim token
 * 3. User clicks "Continue with Ferni" → arrives at app.ferni.ai?claim=xxx
 * 4. This service claims the session and migrates conversation data
 * 5. Ferni warmly acknowledges: "I remember you!"
 *
 * @module DemoClaimService
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('DemoClaim');

// ============================================================================
// TYPES
// ============================================================================

export interface DemoConversation {
  highlights: string[];
  topics: string[];
  userMood: string | null;
  ferniNotes: string;
  messageCount: number;
}

export interface ClaimResult {
  success: boolean;
  alreadyClaimed: boolean;
  conversation: DemoConversation | null;
  error?: string;
}

export interface DemoClaimState {
  claimed: boolean;
  claimToken: string | null;
  conversation: DemoConversation | null;
  claimedAt: number | null;
}

// ============================================================================
// STORAGE KEYS
// ============================================================================

const STORAGE_KEYS = {
  // From landing page demo widget
  CLAIM_TOKEN: 'ferni_demo_claim_token',
  ROOM_NAME: 'ferni_demo_room_name',
  SESSION_TIME: 'ferni_demo_session_time',
  // App-side storage
  CLAIMED_CONVERSATION: 'ferni_claimed_conversation',
  CLAIMED_AT: 'ferni_claimed_at',
};

// ============================================================================
// STATE
// ============================================================================

let claimState: DemoClaimState = {
  claimed: false,
  claimToken: null,
  conversation: null,
  claimedAt: null,
};

let claimPromise: Promise<ClaimResult> | null = null;

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get claim token from URL query param or localStorage.
 */
function getClaimToken(): string | null {
  // First check URL
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get('claim');
  if (urlToken) {
    log.debug('Found claim token in URL');
    return urlToken;
  }

  // Then check localStorage (in case user came back later)
  try {
    const storedToken = localStorage.getItem(STORAGE_KEYS.CLAIM_TOKEN);
    const sessionTime = localStorage.getItem(STORAGE_KEYS.SESSION_TIME);

    if (storedToken && sessionTime) {
      // Check if session is less than 48 hours old
      const sessionAge = Date.now() - parseInt(sessionTime, 10);
      const maxAge = 48 * 60 * 60 * 1000; // 48 hours

      if (sessionAge < maxAge) {
        log.debug('Found valid claim token in localStorage');
        return storedToken;
      } else {
        log.debug('Claim token expired, cleaning up');
        cleanupLocalStorage();
      }
    }
  } catch (e) {
    log.warn('Error reading localStorage:', e);
  }

  return null;
}

/**
 * Clean up localStorage after claiming or expiry.
 */
function cleanupLocalStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.CLAIM_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.ROOM_NAME);
    localStorage.removeItem(STORAGE_KEYS.SESSION_TIME);
  } catch (e) {
    log.warn('Error cleaning localStorage:', e);
  }
}

/**
 * Clean up URL after claiming (remove ?claim=xxx).
 */
function cleanupUrl(): void {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('claim')) {
      url.searchParams.delete('claim');
      window.history.replaceState({}, '', url.toString());
      log.debug('Cleaned up claim token from URL');
    }
  } catch (e) {
    log.warn('Error cleaning URL:', e);
  }
}

/**
 * Call the backend to claim the demo session.
 */
async function claimSessionFromBackend(
  claimToken: string,
  firebaseToken: string | null
): Promise<ClaimResult> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (firebaseToken) {
      headers['Authorization'] = `Bearer ${firebaseToken}`;
    }

    const response = await fetch('/demo-claim', {
      method: 'POST',
      headers,
      body: JSON.stringify({ claim_token: claimToken }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        alreadyClaimed: false,
        conversation: null,
        error: data.error || 'Failed to claim demo session',
      };
    }

    return {
      success: true,
      alreadyClaimed: data.already_claimed || false,
      conversation: data.conversation
        ? {
            highlights: data.conversation.highlights || [],
            topics: data.conversation.topics || [],
            userMood: data.conversation.user_mood,
            ferniNotes: data.conversation.ferni_notes || '',
            messageCount: data.conversation.message_count || 0,
          }
        : null,
    };
  } catch (error) {
    log.error('Error claiming demo session:', error);
    return {
      success: false,
      alreadyClaimed: false,
      conversation: null,
      error: 'Network error while claiming demo session',
    };
  }
}

/**
 * Store claimed conversation for Ferni to reference.
 */
function storeClaimedConversation(conversation: DemoConversation): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CLAIMED_CONVERSATION, JSON.stringify(conversation));
    localStorage.setItem(STORAGE_KEYS.CLAIMED_AT, Date.now().toString());
    log.debug('Stored claimed conversation');
  } catch (e) {
    log.warn('Error storing claimed conversation:', e);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check for and claim any pending demo session.
 * Should be called early in app initialization, after auth is ready.
 *
 * @param getFirebaseToken - Function to get the current Firebase token
 * @returns Claim result (or cached result if already claimed)
 */
export async function checkAndClaimDemoSession(
  getFirebaseToken: () => Promise<string | null>
): Promise<ClaimResult> {
  // Return cached result if already processed
  if (claimState.claimed) {
    return {
      success: true,
      alreadyClaimed: true,
      conversation: claimState.conversation,
    };
  }

  // Return existing promise if claim is in progress
  if (claimPromise) {
    return claimPromise;
  }

  // Check for claim token
  const claimToken = getClaimToken();
  if (!claimToken) {
    return {
      success: false,
      alreadyClaimed: false,
      conversation: null,
      error: 'No claim token found',
    };
  }

  claimState.claimToken = claimToken;

  // Claim the session
  claimPromise = (async () => {
    log.info('Claiming demo session...');

    const firebaseToken = await getFirebaseToken();
    const result = await claimSessionFromBackend(claimToken, firebaseToken);

    if (result.success) {
      claimState.claimed = true;
      claimState.conversation = result.conversation;
      claimState.claimedAt = Date.now();

      // Store conversation for Ferni
      if (result.conversation) {
        storeClaimedConversation(result.conversation);
      }

      // Cleanup
      cleanupLocalStorage();
      cleanupUrl();

      log.info('Demo session claimed successfully', {
        highlights: result.conversation?.highlights?.length || 0,
        topics: result.conversation?.topics?.length || 0,
      });

      // Dispatch event for other parts of the app
      window.dispatchEvent(
        new CustomEvent('ferni:demo-claimed', {
          detail: {
            conversation: result.conversation,
            alreadyClaimed: result.alreadyClaimed,
          },
        })
      );
    } else {
      log.warn('Failed to claim demo session:', result.error);
      // Still cleanup if claim failed
      cleanupUrl();
    }

    return result;
  })();

  return claimPromise;
}

/**
 * Get the claimed demo conversation (if any).
 * Returns null if no demo was claimed or conversation has expired.
 */
export function getClaimedConversation(): DemoConversation | null {
  // Check in-memory state first
  if (claimState.conversation) {
    return claimState.conversation;
  }

  // Check localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.CLAIMED_CONVERSATION);
    const claimedAt = localStorage.getItem(STORAGE_KEYS.CLAIMED_AT);

    if (stored && claimedAt) {
      // Conversation is valid for 7 days after claim
      const age = Date.now() - parseInt(claimedAt, 10);
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

      if (age < maxAge) {
        return JSON.parse(stored) as DemoConversation;
      } else {
        // Expired, clean up
        localStorage.removeItem(STORAGE_KEYS.CLAIMED_CONVERSATION);
        localStorage.removeItem(STORAGE_KEYS.CLAIMED_AT);
      }
    }
  } catch (e) {
    log.warn('Error reading claimed conversation:', e);
  }

  return null;
}

/**
 * Check if there's a pending claim token (demo user coming from landing page).
 */
export function hasPendingClaim(): boolean {
  return getClaimToken() !== null;
}

/**
 * Clear the claimed conversation (e.g., after Ferni has acknowledged it).
 */
export function clearClaimedConversation(): void {
  claimState.conversation = null;
  try {
    localStorage.removeItem(STORAGE_KEYS.CLAIMED_CONVERSATION);
    localStorage.removeItem(STORAGE_KEYS.CLAIMED_AT);
  } catch (e) {
    log.warn('Error clearing claimed conversation:', e);
  }
}

/**
 * Get the current claim state (for debugging).
 */
export function getClaimState(): DemoClaimState {
  return { ...claimState };
}

// Export for debugging
if (typeof window !== 'undefined') {
  (window as unknown as { FerniDemoClaim?: object }).FerniDemoClaim = {
    hasPendingClaim,
    getClaimedConversation,
    getClaimState,
    checkAndClaimDemoSession,
  };
}
