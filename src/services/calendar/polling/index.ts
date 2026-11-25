/**
 * Apple Calendar polling (CalDAV has no webhooks): the entry the API server starts and stops it
 * through.
 *
 * @module services/calendar/polling
 */
export { loadRegisteredUsers, startPolling, stopPolling } from './apple-polling.js';
