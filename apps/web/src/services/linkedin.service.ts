/**
 * LinkedIn Connection Service
 *
 * Handles LinkedIn OAuth connection for career awareness features.
 * Talks to the backend at /api/linkedin/* with the user's Bearer token
 * (apiGet/apiPost); connecting goes through POST /auth/oauth/start, because a
 * page navigation can't carry that token.
 *
 * @module services/linkedin
 */

import { toast } from '../ui/whisper.ui.js';
import { t } from '../i18n/index.js';
import { apiGet, apiPost } from '../utils/api.js';
import { startOAuthConnect } from './oauth-connect.service.js';

// ============================================================================
// TYPES
// ============================================================================

export interface LinkedInStatus {
  connected: boolean;
  profile: {
    firstName: string;
    lastName: string;
    headline?: string;
    profilePicture?: string;
  } | null;
  upcomingMilestones: Array<{
    type: string;
    title: string;
    description: string;
    date: string;
  }>;
}

// ============================================================================
// API CALLS
// ============================================================================

/**
 * Get LinkedIn connection status (null when the server can't say).
 */
export async function getLinkedInStatus(): Promise<LinkedInStatus | null> {
  const response = await apiGet<LinkedInStatus>('/api/linkedin/status');
  return response.ok && response.data ? response.data : null;
}

/**
 * Disconnect LinkedIn
 */
export async function disconnectLinkedIn(): Promise<boolean> {
  const response = await apiPost('/api/linkedin/disconnect', {}, { maxRetries: 0 });
  if (response.ok) {
    toast.success(t('toasts.linkedInDisconnected'));
    return true;
  }
  toast.error("Couldn't disconnect LinkedIn");
  return false;
}

/**
 * Force sync LinkedIn data
 */
export async function syncLinkedIn(): Promise<boolean> {
  const response = await apiPost('/api/linkedin/sync', {}, { maxRetries: 0 });
  if (response.ok) {
    toast.info(t('toasts.syncingLinkedIn'));
    return true;
  }
  return false;
}

// ============================================================================
// CONNECTION FLOW
// ============================================================================

/**
 * Start LinkedIn OAuth connection.
 * Asks the server for a login URL bound to the signed-in user, then goes there;
 * the server sends the user on to LinkedIn and back to /settings?linkedin=….
 * When the server refuses (signed out, LinkedIn not set up) nothing navigates
 * and the user is told why.
 */
export async function connectLinkedIn(): Promise<void> {
  const status = await getLinkedInStatus();
  if (status?.connected) {
    toast.info(t('toasts.linkedinAlreadyConnected'));
    return;
  }

  const result = await startOAuthConnect('linkedin');
  if (!result.success) {
    toast.error(result.error ?? "Couldn't connect LinkedIn. Try again?");
  }
}

/**
 * Handle LinkedIn OAuth callback from URL params
 * Call this on settings page load to show connection result
 */
export function handleLinkedInCallback(): void {
  const params = new URLSearchParams(window.location.search);
  const linkedinStatus = params.get('linkedin');

  if (linkedinStatus === 'connected') {
    toast.success("LinkedIn connected! I'll remember your work milestones.");
  } else if (linkedinStatus === 'denied') {
    toast.info(t('toasts.linkedinConnectionCancelled'));
  } else if (linkedinStatus === 'error') {
    toast.error("Couldn't connect LinkedIn. Try again?");
  } else if (linkedinStatus === 'unavailable') {
    toast.error("LinkedIn isn't available right now");
  } else {
    return;
  }
  // Clean up URL
  const url = new URL(window.location.href);
  url.searchParams.delete('linkedin');
  window.history.replaceState({}, '', url.toString());
}
