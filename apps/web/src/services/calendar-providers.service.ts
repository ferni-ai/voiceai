/**
 * Calendar Providers Service
 *
 * Manages OAuth connections to calendar platforms:
 * - Google Calendar (fully implemented)
 * - Apple Calendar (iCloud) 
 * - Microsoft Outlook
 *
 * Philosophy: Ferni has her own native calendar system. External
 * providers are sync integrations that give Ferni more context
 * about your schedule.
 */

import { createLogger } from '../utils/logger.js';
import { apiGet, apiPost } from '../utils/api.js';

const log = createLogger('CalendarProviders');

// ============================================================================
// TYPES
// ============================================================================

export type CalendarProvider = 'google' | 'apple' | 'outlook';

export interface CalendarProviderStatus {
  provider: CalendarProvider;
  connected: boolean;
  configured: boolean;
  email?: string;
  lastSynced?: string;
  calendarCount?: number;
  error?: string;
}

export interface CalendarEvent {
  id: string;
  provider: CalendarProvider;
  title: string;
  description?: string;
  location?: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  attendees?: Array<{
    email: string;
    name?: string;
    status: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  }>;
  reminders?: Array<{
    method: 'email' | 'popup';
    minutes: number;
  }>;
  recurrence?: string[];
  calendarId: string;
  calendarName?: string;
}

export interface SyncedCalendar {
  id: string;
  provider: CalendarProvider;
  name: string;
  color?: string;
  primary?: boolean;
  accessRole: 'owner' | 'writer' | 'reader';
  enabled: boolean;
}

// ============================================================================
// PROVIDER CONFIGURATIONS
// ============================================================================

interface ProviderConfig {
  name: string;
  authUrl: string;
  scopes: string[];
  color: string;
  icon: string;
}

const PROVIDER_CONFIGS: Record<CalendarProvider, ProviderConfig> = {
  google: {
    name: 'Google Calendar',
    authUrl: '/auth/google/calendar',
    scopes: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    color: '#4285f4',
    icon: '📅',
  },
  apple: {
    name: 'Apple Calendar',
    authUrl: '/auth/apple/calendar',
    scopes: ['calendar'],
    color: '#ff3b30',
    icon: '🍎',
  },
  outlook: {
    name: 'Outlook Calendar',
    authUrl: '/auth/outlook/calendar',
    scopes: ['Calendars.Read', 'Calendars.ReadWrite'],
    color: '#0078d4',
    icon: '📆',
  },
};

// ============================================================================
// STATE
// ============================================================================

const providerStatuses: Map<CalendarProvider, CalendarProviderStatus> = new Map();
const statusListeners: Set<(statuses: Map<CalendarProvider, CalendarProviderStatus>) => void> =
  new Set();

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize calendar providers and fetch current status
 */
export async function initCalendarProviders(): Promise<
  Map<CalendarProvider, CalendarProviderStatus>
> {
  try {
    const response = await apiGet<{
      providers: Record<CalendarProvider, CalendarProviderStatus>;
    }>('/api/calendar/providers/status');

    if (response.ok && response.data) {
      for (const [provider, status] of Object.entries(response.data.providers)) {
        providerStatuses.set(provider as CalendarProvider, status);
      }
      notifyListeners();
    }
  } catch (error) {
    log.debug('Failed to fetch calendar provider status:', String(error));

    // Set defaults
    for (const provider of Object.keys(PROVIDER_CONFIGS) as CalendarProvider[]) {
      providerStatuses.set(provider, {
        provider,
        connected: false,
        configured: provider === 'google', // Google is always configured
      });
    }
  }

  return providerStatuses;
}

/**
 * Get status of a specific provider
 */
export function getProviderStatus(provider: CalendarProvider): CalendarProviderStatus {
  return (
    providerStatuses.get(provider) ?? {
      provider,
      connected: false,
      configured: false,
    }
  );
}

/**
 * Get all provider statuses
 */
export function getAllProviderStatuses(): Map<CalendarProvider, CalendarProviderStatus> {
  return new Map(providerStatuses);
}

/**
 * Connect to a calendar provider via OAuth
 */
export async function connectProvider(
  provider: CalendarProvider,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const config = PROVIDER_CONFIGS[provider];

  if (!config) {
    return { success: false, error: 'Unknown provider' };
  }

  const status = providerStatuses.get(provider);
  if (status && !status.configured) {
    return {
      success: false,
      error: `${config.name} integration is coming soon!`,
    };
  }

  // Redirect to OAuth flow
  // Use user_id param for backend consistency, include return_url for proper redirect
  const returnUrl = encodeURIComponent('/settings?calendar=' + provider);
  const authUrl = `${config.authUrl}?user_id=${userId}&return_url=${returnUrl}`;
  log.info('Initiating calendar OAuth flow', { provider, authUrl });

  window.location.href = authUrl;

  return { success: true };
}

/**
 * Disconnect from a calendar provider
 */
export async function disconnectProvider(
  provider: CalendarProvider
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await apiPost<{ success: boolean }>(
      `/api/calendar/providers/${provider}/disconnect`,
      {}
    );

    if (response.ok && response.data?.success) {
      providerStatuses.set(provider, {
        provider,
        connected: false,
        configured: true,
      });
      notifyListeners();
      return { success: true };
    }

    return { success: false, error: 'Failed to disconnect' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Get calendars for a connected provider
 */
export async function getCalendars(provider: CalendarProvider): Promise<SyncedCalendar[]> {
  const status = providerStatuses.get(provider);
  if (!status?.connected) {
    return [];
  }

  try {
    const response = await apiGet<{ calendars: SyncedCalendar[] }>(
      `/api/calendar/providers/${provider}/calendars`
    );

    if (response.ok && response.data) {
      return response.data.calendars;
    }
  } catch (error) {
    log.error('Failed to fetch calendars:', String(error));
  }

  return [];
}

/**
 * Get events from a provider
 */
export async function getEvents(
  provider: CalendarProvider,
  options?: {
    startDate?: string;
    endDate?: string;
    calendarId?: string;
    maxResults?: number;
  }
): Promise<CalendarEvent[]> {
  const status = providerStatuses.get(provider);
  if (!status?.connected) {
    return [];
  }

  try {
    const params = new URLSearchParams();
    if (options?.startDate) params.set('startDate', options.startDate);
    if (options?.endDate) params.set('endDate', options.endDate);
    if (options?.calendarId) params.set('calendarId', options.calendarId);
    if (options?.maxResults) params.set('maxResults', String(options.maxResults));

    const response = await apiGet<{ events: CalendarEvent[] }>(
      `/api/calendar/providers/${provider}/events?${params}`
    );

    if (response.ok && response.data) {
      return response.data.events.map((event) => ({
        ...event,
        provider,
      }));
    }
  } catch (error) {
    log.error('Failed to fetch events:', String(error));
  }

  return [];
}

/**
 * Get events from all connected providers
 */
export async function getAllEvents(options?: {
  startDate?: string;
  endDate?: string;
  maxResults?: number;
}): Promise<CalendarEvent[]> {
  const connectedProviders = Array.from(providerStatuses.entries())
    .filter(([, status]) => status.connected)
    .map(([provider]) => provider);

  if (connectedProviders.length === 0) {
    return [];
  }

  const allEvents = await Promise.all(
    connectedProviders.map((provider) => getEvents(provider, options))
  );

  // Merge and sort by start time
  return allEvents
    .flat()
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
}

/**
 * Sync a provider's calendar data
 */
export async function syncProvider(
  provider: CalendarProvider
): Promise<{ success: boolean; newEvents?: number; error?: string }> {
  const status = providerStatuses.get(provider);
  if (!status?.connected) {
    return { success: false, error: 'Provider not connected' };
  }

  try {
    const response = await apiPost<{
      success: boolean;
      newEvents: number;
      lastSynced: string;
    }>(`/api/calendar/providers/${provider}/sync`, {});

    if (response.ok && response.data?.success) {
      const updated = providerStatuses.get(provider)!;
      providerStatuses.set(provider, {
        ...updated,
        lastSynced: response.data.lastSynced,
      });
      notifyListeners();
      return { success: true, newEvents: response.data.newEvents };
    }

    return { success: false, error: 'Sync failed' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Enable/disable a specific calendar from sync
 */
export async function setCalendarEnabled(
  provider: CalendarProvider,
  calendarId: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await apiPost<{ success: boolean }>(
      `/api/calendar/providers/${provider}/calendars/${calendarId}/toggle`,
      { enabled }
    );

    return {
      success: response.ok && response.data?.success === true,
      error: response.ok ? undefined : 'Failed to update calendar',
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Subscribe to provider status changes
 */
export function onProviderStatusChange(
  callback: (statuses: Map<CalendarProvider, CalendarProviderStatus>) => void
): () => void {
  statusListeners.add(callback);
  return () => statusListeners.delete(callback);
}

/**
 * Get provider configuration
 */
export function getProviderConfig(provider: CalendarProvider): ProviderConfig | undefined {
  return PROVIDER_CONFIGS[provider];
}

/**
 * Check if a provider is available (configured for use)
 */
export function isProviderAvailable(provider: CalendarProvider): boolean {
  const status = providerStatuses.get(provider);
  return status?.configured ?? (provider === 'google'); // Google always available
}

// ============================================================================
// HELPERS
// ============================================================================

function notifyListeners(): void {
  for (const listener of statusListeners) {
    try {
      listener(new Map(providerStatuses));
    } catch (error) {
      log.error('Status listener error:', String(error));
    }
  }
}

/**
 * Handle OAuth callback from calendar providers
 */
export function handleCalendarCallback(params: URLSearchParams): void {
  const provider = params.get('provider') as CalendarProvider | null;
  const success = params.get('success') === 'true';
  const error = params.get('error');
  const email = params.get('email');

  if (provider && providerStatuses.has(provider)) {
    if (success) {
      providerStatuses.set(provider, {
        provider,
        connected: true,
        configured: true,
        email: email ?? undefined,
        lastSynced: new Date().toISOString(),
      });
    } else {
      const current = providerStatuses.get(provider)!;
      providerStatuses.set(provider, {
        ...current,
        error: error ?? 'Connection failed',
      });
    }
    notifyListeners();
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const calendarProvidersService = {
  init: initCalendarProviders,
  getStatus: getProviderStatus,
  getAllStatuses: getAllProviderStatuses,
  connect: connectProvider,
  disconnect: disconnectProvider,
  getCalendars,
  getEvents,
  getAllEvents,
  sync: syncProvider,
  setCalendarEnabled,
  onStatusChange: onProviderStatusChange,
  getConfig: getProviderConfig,
  isAvailable: isProviderAvailable,
  handleCallback: handleCalendarCallback,
};

export default calendarProvidersService;
