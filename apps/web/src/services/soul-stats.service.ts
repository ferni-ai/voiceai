/**
 * Soul Stats Service
 *
 * Counts how often the avatar's "soul" responses play in this browser, and
 * sends the counts to POST /api/soul-stats so the admin Human Listening panel
 * can show what people's avatars did in the last 24 h (#4069):
 * - Micro-expressions: subliminal 40-150 ms emotional flashes
 * - Protective modes: avatar scales up, draws closer during distress
 * - Comfort pulses: warm pulsing glow during self-soothing
 * - Memory sparks: golden flash acknowledging emotional peaks
 *
 * Counts only, kept in memory: never the trigger, a session id, the uid or any
 * text, and nothing in localStorage. Sent for a signed-in person at most once a
 * minute, and when the page is hidden. A 404 (SOUL_STATS off on the server), 400
 * or 413 stops this page sending for the rest of its life.
 *
 * @module SoulStatsService
 */

import { createLogger } from '../utils/logger.js';
import { getAuthToken } from './firebase-auth.service.js';

const log = createLogger('SoulStatsService');

export type SoulCountKey =
  'micro_expression' | 'protective_mode' | 'comfort_pulse' | 'memory_spark';
export type SoulCounts = Record<SoulCountKey, number>;

const SOUL_STATS_URL = '/api/soul-stats';
const SEND_EVERY_MS = 60_000;
/** The server refuses a count above this, so one send never carries more. */
const MAX_COUNT = 500;
/** Off on the server (404), or a body it will never take (400, 413): stop for this page. */
const STOP_STATUSES = new Set([400, 404, 413]);

const noCounts = (): SoulCounts => ({
  micro_expression: 0,
  protective_mode: 0,
  comfort_pulse: 0,
  memory_spark: 0,
});
const KEYS = Object.keys(noCounts()) as SoulCountKey[];

export interface SoulStatsDeps {
  /** The signed-in person's ID token, or null when nobody is signed in. */
  getToken: () => Promise<string | null>;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  setTimer: (send: () => void, ms: number) => void;
  /** Calls `send` whenever the page is hidden or unloaded. */
  onPageHide: (send: () => void) => void;
}

function onPageHide(send: () => void): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  window.addEventListener('pagehide', send);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') send();
  });
}

const browserDeps: SoulStatsDeps = {
  getToken: () => getAuthToken(),
  fetch: (url, init) => fetch(url, init),
  setTimer: (send, ms) => void setTimeout(send, ms),
  onPageHide,
};

export class SoulStatsService {
  private pending = noCounts();
  private timerSet = false;
  private listening = false;
  private stopped = false;

  constructor(private readonly deps: SoulStatsDeps = browserDeps) {}

  recordMicroExpression(): void {
    this.add('micro_expression');
  }

  recordProtectiveMode(): void {
    this.add('protective_mode');
  }

  recordComfortPulse(): void {
    this.add('comfort_pulse');
  }

  recordMemorySpark(): void {
    this.add('memory_spark');
  }

  /** Sends what is pending: nothing when every count is 0, nobody is signed in, or once stopped. */
  async send(): Promise<void> {
    if (this.stopped || KEYS.every((k) => this.pending[k] === 0)) return;
    // Taken before any await, so a timer send and a page-hide send never carry the same counts
    const counts = this.pending;
    this.pending = noCounts();
    const token = await this.deps.getToken().catch(() => null);
    if (!token) return this.keep(counts, false); // signed out: hold them, no retry timer
    try {
      const response = await this.deps.fetch(SOUL_STATS_URL, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ counts }),
      });
      if (STOP_STATUSES.has(response.status)) {
        this.stopped = true;
        log.debug('Soul stats not taken; not sending again on this page', {
          status: response.status,
        });
      } else if (!response.ok) {
        log.warn('Soul stats not stored; keeping them for the next send', {
          status: response.status,
        });
        this.keep(counts);
      }
    } catch (err) {
      log.warn('Could not send soul stats; keeping them for the next send', err);
      this.keep(counts);
    }
  }

  private add(key: SoulCountKey): void {
    if (this.stopped) return;
    this.pending[key] = Math.min(MAX_COUNT, this.pending[key] + 1);
    if (!this.listening) {
      this.listening = true;
      this.deps.onPageHide(() => void this.send());
    }
    this.schedule();
  }

  /** Puts counts that were not stored back, so the next send carries them. */
  private keep(counts: SoulCounts, retry = true): void {
    for (const k of KEYS) this.pending[k] = Math.min(MAX_COUNT, this.pending[k] + counts[k]);
    if (retry) this.schedule();
  }

  private schedule(): void {
    if (this.timerSet) return;
    this.timerSet = true;
    this.deps.setTimer(() => {
      this.timerSet = false;
      void this.send();
    }, SEND_EVERY_MS);
  }
}

export const soulStatsService = new SoulStatsService();
