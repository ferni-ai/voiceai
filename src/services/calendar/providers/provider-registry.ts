/**
 * Calendar Provider Registry
 *
 * Central registry for all calendar provider adapters.
 * Use this to get provider instances and check configurations.
 *
 * @module calendar/providers/provider-registry
 */

import type { CalendarProviderAdapter, CalendarProvider } from '../types.js';
import { GoogleCalendarProvider } from './google-provider.js';
import { AppleCalendarProvider } from './apple-provider.js';
import { OutlookCalendarProvider } from './outlook-provider.js';

// ============================================================================
// PROVIDER INSTANCES
// ============================================================================

const providers: Map<CalendarProvider, CalendarProviderAdapter> = new Map();

// Initialize providers lazily
function ensureProviders(): void {
  if (providers.size > 0) return;

  providers.set('google', new GoogleCalendarProvider());
  providers.set('apple', new AppleCalendarProvider());
  providers.set('outlook', new OutlookCalendarProvider());
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get a specific provider adapter
 */
export function getProvider(provider: CalendarProvider): CalendarProviderAdapter | null {
  ensureProviders();

  // 'ferni' is the native calendar, not a provider
  if (provider === 'ferni') {
    return null;
  }

  return providers.get(provider) || null;
}

/**
 * Get all provider adapters
 */
export function getAllProviders(): CalendarProviderAdapter[] {
  ensureProviders();
  return Array.from(providers.values());
}

/**
 * Get all configured providers (have credentials)
 */
export function getConfiguredProviders(): CalendarProviderAdapter[] {
  ensureProviders();
  return Array.from(providers.values()).filter((p) => p.isConfigured());
}

/**
 * Check if a provider is configured
 */
export function isProviderConfigured(provider: CalendarProvider): boolean {
  if (provider === 'ferni') return true; // Native is always "configured"

  const adapter = getProvider(provider);
  return adapter?.isConfigured() || false;
}

/**
 * Get provider display info
 */
export function getProviderInfo(provider: CalendarProvider): {
  id: CalendarProvider;
  name: string;
  icon: string;
  description: string;
  configured: boolean;
  authType: 'oauth' | 'credentials' | 'native';
} {
  const configured = isProviderConfigured(provider);

  const info: Record<
    CalendarProvider,
    {
      name: string;
      icon: string;
      description: string;
      authType: 'oauth' | 'credentials' | 'native';
    }
  > = {
    ferni: {
      name: 'Ferni Calendar',
      icon: 'calendar',
      description: 'Your personal calendar in Ferni',
      authType: 'native',
    },
    google: {
      name: 'Google Calendar',
      icon: 'google',
      description: 'Sync with your Google account',
      authType: 'oauth',
    },
    apple: {
      name: 'Apple Calendar',
      icon: 'apple',
      description: 'Sync with iCloud Calendar',
      authType: 'credentials',
    },
    outlook: {
      name: 'Outlook Calendar',
      icon: 'outlook',
      description: 'Sync with Microsoft 365',
      authType: 'oauth',
    },
  };

  return {
    id: provider,
    ...info[provider],
    configured,
  };
}

/**
 * Get all provider info
 */
export function getAllProviderInfo(): ReturnType<typeof getProviderInfo>[] {
  const providerIds: CalendarProvider[] = ['ferni', 'google', 'apple', 'outlook'];
  return providerIds.map(getProviderInfo);
}

export default {
  getProvider,
  getAllProviders,
  getConfiguredProviders,
  isProviderConfigured,
  getProviderInfo,
  getAllProviderInfo,
};
