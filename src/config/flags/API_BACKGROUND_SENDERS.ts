import type { FlagSpec } from '../flag-spec.js';

// on | off (kill switch, 2026-11-24, #3853): the API server starts its background senders at listen: the proactive scheduler, Apple calendar polling, the Google and Outlook calendar renewals, the workflow handler and Spotify token refresh. Off: none of them start, so a local or preview run never texts, calls or pushes from the database it points at; the server still listens, serves and attaches the Twilio /stream bridge. API_LISTEN_HOST (default 0.0.0.0) sets the interface it listens on (servers/api/api-listen.ts).
export const API_BACKGROUND_SENDERS = {
  default: 'on',
  owner: 'platform',
  kind: 'kill-switch',
} as const satisfies FlagSpec;
