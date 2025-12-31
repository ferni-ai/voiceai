/**
 * LinkedIn Connection Service
 *
 * Handles LinkedIn OAuth connection for career awareness features.
 * Connects to the backend API at /api/linkedin/*
 *
 * @module services/linkedin
 */

import { toast } from '../ui/toast.ui.js';
import { t } from '../i18n/index.js';

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
 * Get LinkedIn connection status
 */
export async function getLinkedInStatus(): Promise<LinkedInStatus | null> {
  try {
    const response = await fetch('/api/linkedin/status', {
      credentials: 'include',
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Disconnect LinkedIn
 */
export async function disconnectLinkedIn(): Promise<boolean> {
  try {
    const response = await fetch('/api/linkedin/disconnect', {
      method: 'POST',
      credentials: 'include',
    });

    if (response.ok) {
      toast.success(t('toasts.linkedInDisconnected'));
      return true;
    }

    toast.error("Couldn't disconnect LinkedIn");
    return false;
  } catch {
    toast.error("Couldn't disconnect LinkedIn");
    return false;
  }
}

/**
 * Force sync LinkedIn data
 */
export async function syncLinkedIn(): Promise<boolean> {
  try {
    const response = await fetch('/api/linkedin/sync', {
      method: 'POST',
      credentials: 'include',
    });

    if (response.ok) {
      toast.info(t('toasts.syncingLinkedIn'));
      return true;
    }

    return false;
  } catch {
    return false;
  }
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
