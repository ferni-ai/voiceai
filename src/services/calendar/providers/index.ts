/**
 * Calendar Providers
 *
 * Pluggable calendar provider adapters for syncing with external services.
 * All providers implement the CalendarProviderAdapter interface.
 *
 * @module calendar/providers
 */

// Provider classes
export { GoogleCalendarProvider, googleCalendarProvider } from './google-provider.js';
export { AppleCalendarProvider, appleCalendarProvider } from './apple-provider.js';
export { OutlookCalendarProvider, outlookCalendarProvider } from './outlook-provider.js';

// Registry functions
export { getProvider, getAllProviders, getConfiguredProviders } from './provider-registry.js';

