/**
 * Polls GET /api/ecobee/link/status while the user enters their PIN on
 * ecobee.com. The server answers { status: 'connected' | 'pending' |
 * 'expired' | 'no_pending_auth' } (src/servers/api/routes/ecobee.ts).
 *
 * One poll at a time: starting a new one, cancelling the setup or closing the
 * panel stops the previous one, so nothing keeps polling in the background.
 */

import { apiGet } from '../utils/api.js';

export type EcobeeLinkStatus = 'connected' | 'pending' | 'expired' | 'no_pending_auth';

export interface EcobeeLinkPollOptions {
  userId: string;
  onConnected: () => void;
  onExpired: () => void;
  intervalMs?: number;
  /** Give up after this long (the PIN itself expires server side). */
  timeoutMs?: number;
}

let interval: ReturnType<typeof setInterval> | null = null;
let timeout: ReturnType<typeof setTimeout> | null = null;
let generation = 0;

export function stopEcobeeLinkPoll(): void {
  generation++;
  if (interval) clearInterval(interval);
  if (timeout) clearTimeout(timeout);
  interval = null;
  timeout = null;
}

export function startEcobeeLinkPoll(options: EcobeeLinkPollOptions): void {
  const { userId, onConnected, onExpired, intervalMs = 3000, timeoutMs = 300000 } = options;
  stopEcobeeLinkPoll();
  const current = generation;

  let checking = false;
  const check = async (): Promise<void> => {
    if (checking) return;
    checking = true;
    try {
      const res = await apiGet<{ status?: EcobeeLinkStatus }>('/api/ecobee/link/status', { userId });
      if (current !== generation || !res.ok) return;
      if (res.data?.status === 'connected') {
        stopEcobeeLinkPoll();
        onConnected();
      } else if (res.data?.status === 'expired') {
        stopEcobeeLinkPoll();
        onExpired();
      }
    } finally {
      checking = false;
    }
  };

  interval = setInterval(() => void check(), intervalMs);
  timeout = setTimeout(stopEcobeeLinkPoll, timeoutMs);
}
