/**
 * Check-in Service - Proactive outreach polling
 *
 * Polls the backend for pending check-ins and dispatches events
 * when Ferni wants to reach out to the user.
 *
 * Events dispatched:
 * - `ferni:checkin-available` - A check-in is pending (detail: { message, type, id })
 * - `ferni:checkin-dismissed` - User dismissed the check-in
 *
 * @module services/checkin
 */

import { createLogger } from '../utils/logger.js';
import { apiGet } from '../utils/api.js';
import { getAuthState } from './firebase-auth.service.js';

const log = createLogger('CheckinService');

// ============================================================================
// TYPES
// ============================================================================

export interface CheckinInfo {
  id: string;
  type: 'thinking_of_you' | 'gentle_checkin' | 'celebration' | 'support';
  message: string;
  personaId?: string;
  timestamp: string;
}

interface CheckinResponse {
  hasCheckin: boolean;
  checkin?: CheckinInfo;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
const STORAGE_KEY = 'ferni_checkin_dismissed';
const DISMISS_DURATION_MS = 60 * 60 * 1000; // 1 hour

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let checkInterval: ReturnType<typeof setInterval> | null = null;
let initialCheckTimeout: ReturnType<typeof setTimeout> | null = null;
let currentCheckin: CheckinInfo | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the check-in service.
 * Starts polling for pending check-ins.
 */
export function initCheckinService(): void {
  if (isInitialized) return;

  // Initial check after a brief delay
  initialCheckTimeout = setTimeout(() => {
    void checkForCheckin();
  }, 3000);

  // Set up periodic checking
  checkInterval = setInterval(() => {
    void checkForCheckin();
  }, CHECK_INTERVAL_MS);

  isInitialized = true;
  log.info('Check-in service initialized');
}

/**
 * Dispose the check-in service.
 * Stops polling and cleans up.
 */
export function disposeCheckinService(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  if (initialCheckTimeout) {
    clearTimeout(initialCheckTimeout);
    initialCheckTimeout = null;
  }
  currentCheckin = null;
  isInitialized = false;
  log.info('Check-in service disposed');
}

// ============================================================================
// CHECK-IN POLLING
// ============================================================================

/**
 * Check for pending check-ins from the backend.
 */
async function checkForCheckin(): Promise<void> {
  const authState = getAuthState();
  if (!authState.isAuthenticated) {
    return;
  }

  // Check if recently dismissed
  const dismissed = getDismissedTime();
  if (dismissed && Date.now() - dismissed < DISMISS_DURATION_MS) {
    // Don't show for 1 hour after dismissal
    return;
  }

  try {
    const response = await apiGet<CheckinResponse>('/api/outreach/pending-checkin');
    if (response.ok && response.data?.hasCheckin && response.data.checkin) {
      currentCheckin = response.data.checkin;
      dispatchCheckinAvailable(currentCheckin);
    }
  } catch (err) {
    log.debug('Could not check for check-in', { error: String(err) });
  }
}

/**
 * Dispatch event when check-in is available.
 */
function dispatchCheckinAvailable(checkin: CheckinInfo): void {
  window.dispatchEvent(
    new CustomEvent('ferni:checkin-available', {
      detail: {
        id: checkin.id,
        message: checkin.message,
        type: checkin.type,
        personaId: checkin.personaId,
      },
    })
  );
  log.info('Check-in available event dispatched', { type: checkin.type });
}

// ============================================================================
// DISMISSED STATE
// ============================================================================

function getDismissedTime(): number | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return parseInt(stored, 10);
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

function setDismissedTime(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Dismiss the current check-in.
 * Won't show again for DISMISS_DURATION_MS.
 */
export function dismissCheckin(): void {
  setDismissedTime();
  currentCheckin = null;
  window.dispatchEvent(new CustomEvent('ferni:checkin-dismissed'));
  log.info('Check-in dismissed');
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get the current pending check-in, if any.
 */
export function getCurrentCheckin(): CheckinInfo | null {
  return currentCheckin;
}

/**
 * Check if there's a pending check-in.
 */
export function hasCheckin(): boolean {
  return currentCheckin !== null;
}

/**
 * Force an immediate check for pending check-ins.
 */
export async function forceCheck(): Promise<void> {
  await checkForCheckin();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const checkinService = {
  init: initCheckinService,
  dispose: disposeCheckinService,
  dismiss: dismissCheckin,
  getCurrent: getCurrentCheckin,
  hasCheckin,
  forceCheck,
};

export default checkinService;
