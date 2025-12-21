/**
 * Calendar Selection Service
 *
 * Manages which calendars from each provider are selected for sync.
 * Users can choose which calendars to include rather than syncing all.
 *
 * @module calendar/calendar-selection
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import type { CalendarProvider, SelectedCalendar } from './types.js';
import { googleCalendarProvider } from './providers/google-provider.js';
import { appleCalendarProvider } from './providers/apple-provider.js';
import { outlookCalendarProvider } from './providers/outlook-provider.js';

const log = getLogger();

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

let db: FirestoreType | null = null;

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    return db;
  } catch (error) {
    log.warn({ error }, 'Firestore not available for calendar selection');
    return null;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getProviderAdapter(provider: CalendarProvider) {
  switch (provider) {
    case 'google':
      return googleCalendarProvider;
    case 'apple':
      return appleCalendarProvider;
    case 'outlook':
      return outlookCalendarProvider;
    default:
      return null;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get available calendars from a provider
 */
export async function getAvailableCalendars(
  userId: string,
  provider: CalendarProvider
): Promise<SelectedCalendar[]> {
  const adapter = getProviderAdapter(provider);

  if (!adapter || !adapter.getCalendars) {
    log.warn({ provider }, 'Provider does not support getCalendars');
    return [];
  }

  try {
    const connected = await adapter.isConnected(userId);
    if (!connected) {
      log.debug({ userId, provider }, 'User not connected to provider');
      return [];
    }

    const calendars = await adapter.getCalendars(userId);

    // Convert to SelectedCalendar format
    return calendars.map((cal) => ({
      id: cal.id,
      name: cal.name,
      enabled: true, // Default all to enabled
      primary: cal.primary,
    }));
  } catch (error) {
    log.error({ error: String(error), userId, provider }, 'Error fetching available calendars');
    return [];
  }
}

/**
 * Get the user's selected calendars for a provider
 */
export async function getSelectedCalendars(
  userId: string,
  provider: CalendarProvider
): Promise<SelectedCalendar[]> {
  const firestore = await getFirestore();
  if (!firestore) return [];

  try {
    const doc = await firestore
      .collection(`users/${userId}/calendar_providers`)
      .doc(provider)
      .get();

    if (!doc.exists) return [];

    const data = doc.data();
    const selectedCalendars = data?.selectedCalendars as SelectedCalendar[] | undefined;

    // If no selection saved, get all available and mark as enabled
    if (!selectedCalendars || selectedCalendars.length === 0) {
      return getAvailableCalendars(userId, provider);
    }

    return selectedCalendars;
  } catch (error) {
    log.error({ error: String(error), userId, provider }, 'Error getting selected calendars');
    return [];
  }
}

/**
 * Update which calendars are selected for sync
 */
export async function updateSelectedCalendars(
  userId: string,
  provider: CalendarProvider,
  selectedIds: string[]
): Promise<{ success: boolean; calendars: SelectedCalendar[] }> {
  const firestore = await getFirestore();
  if (!firestore) {
    return { success: false, calendars: [] };
  }

  try {
    // Get all available calendars
    const available = await getAvailableCalendars(userId, provider);

    if (available.length === 0) {
      return { success: false, calendars: [] };
    }

    // Mark calendars as enabled/disabled based on selection
    const updated: SelectedCalendar[] = available.map((cal) => ({
      ...cal,
      enabled: selectedIds.includes(cal.id),
    }));

    // At least one calendar must be selected
    const hasSelected = updated.some((c) => c.enabled);
    if (!hasSelected && updated.length > 0) {
      // Default to primary or first calendar
      const primary = updated.find((c) => c.primary) || updated[0];
      primary.enabled = true;
    }

    // Save to Firestore
    await firestore.collection(`users/${userId}/calendar_providers`).doc(provider).set(
      {
        selectedCalendars: updated,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    log.info(
      { userId, provider, selectedCount: updated.filter((c) => c.enabled).length },
      'Updated selected calendars'
    );

    return { success: true, calendars: updated };
  } catch (error) {
    log.error({ error: String(error), userId, provider }, 'Error updating selected calendars');
    return { success: false, calendars: [] };
  }
}

/**
 * Get calendar IDs that are enabled for sync
 */
export async function getEnabledCalendarIds(
  userId: string,
  provider: CalendarProvider
): Promise<string[]> {
  const calendars = await getSelectedCalendars(userId, provider);
  return calendars.filter((c) => c.enabled).map((c) => c.id);
}

/**
 * Check if a specific calendar is enabled for sync
 */
export async function isCalendarEnabled(
  userId: string,
  provider: CalendarProvider,
  calendarId: string
): Promise<boolean> {
  const calendars = await getSelectedCalendars(userId, provider);

  // If no selection saved, all calendars are considered enabled
  if (calendars.length === 0) return true;

  const calendar = calendars.find((c) => c.id === calendarId);
  return calendar?.enabled ?? true;
}

/**
 * Get a summary of calendar selection for all providers
 */
export async function getCalendarSelectionSummary(userId: string): Promise<{
  google: { total: number; enabled: number };
  apple: { total: number; enabled: number };
  outlook: { total: number; enabled: number };
}> {
  const [google, apple, outlook] = await Promise.all([
    getSelectedCalendars(userId, 'google'),
    getSelectedCalendars(userId, 'apple'),
    getSelectedCalendars(userId, 'outlook'),
  ]);

  return {
    google: {
      total: google.length,
      enabled: google.filter((c) => c.enabled).length,
    },
    apple: {
      total: apple.length,
      enabled: apple.filter((c) => c.enabled).length,
    },
    outlook: {
      total: outlook.length,
      enabled: outlook.filter((c) => c.enabled).length,
    },
  };
}

export default {
  getAvailableCalendars,
  getSelectedCalendars,
  updateSelectedCalendars,
  getEnabledCalendarIds,
  isCalendarEnabled,
  getCalendarSelectionSummary,
};
