/**
 * LinkedIn Connection Service
 *
 * Handles LinkedIn OAuth connection for career awareness features.
 * Connects to the backend API at /api/linkedin/*
 *
 * @module services/linkedin
 */

import { toast } from '../ui/whisper.ui.js';
import { t } from '../i18n/index.js';
import { apiGet, apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('LinkedInService');

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
// /api/linkedin/* (src/api/linkedin-routes.ts) requires a verified caller, so
// every call goes through the authenticated api helpers (Bearer token).
// ============================================================================

/**
 * Get LinkedIn connection status, or null when it couldn't be loaded.
 */
export async function getLinkedInStatus(): Promise<LinkedInStatus | null> {
  const response = await apiGet<LinkedInStatus>('/api/linkedin/status');
  if (!response.ok || !response.data) {
    log.warn({ status: response.status }, 'LinkedIn status request failed');
    return null;
  }
  return response.data;
}

/**
 * Disconnect LinkedIn
 */
export async function disconnectLinkedIn(): Promise<boolean> {
  const response = await apiPost('/api/linkedin/disconnect');
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
  const response = await apiPost('/api/linkedin/sync');
  if (response.ok) {
    toast.info(t('toasts.syncingLinkedIn'));
    return true;
  }
  toast.error("Couldn't sync LinkedIn. Try again?");
  return false;
}

// ============================================================================
// CONNECTION FLOW
// ============================================================================

/**
 * Start LinkedIn OAuth connection
 * Redirects user to LinkedIn authorization page
 */
export async function connectLinkedIn(): Promise<void> {
  // Check if already connected
  const status = await getLinkedInStatus();
  if (status?.connected) {
    toast.info(t('toasts.linkedinAlreadyConnected'));
    return;
  }

  // Redirect to OAuth endpoint
  // The server will redirect to LinkedIn, then back to /settings?linkedin=connected
  window.location.href = '/api/linkedin/connect';
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
    // Clean up URL
    const url = new URL(window.location.href);
    url.searchParams.delete('linkedin');
    window.history.replaceState({}, '', url.toString());
  } else if (linkedinStatus === 'denied') {
    toast.info(t('toasts.linkedinConnectionCancelled'));
    // Clean up URL
    const url = new URL(window.location.href);
    url.searchParams.delete('linkedin');
    window.history.replaceState({}, '', url.toString());
  } else if (linkedinStatus === 'error') {
    toast.error("Couldn't connect LinkedIn. Try again?");
    // Clean up URL
    const url = new URL(window.location.href);
    url.searchParams.delete('linkedin');
    window.history.replaceState({}, '', url.toString());
  }
}
