/**
 * Attention queue: at most one self-showing interruption on the idle screen
 * per session.
 *
 * Badges, toasts, hints and overlays that would appear on their own while no
 * call is running ask here first. Requests are pooled for a short moment
 * after the first one arrives; when the pool settles the highest-priority one
 * shows and the rest are dropped (logged at debug). Once the session's budget
 * is spent, later idle requests are dropped too. A source that was granted
 * may update what it already shows. During a call nothing is gated.
 *
 * With the calm-idle flag off, every request shows at once, as before.
 */

import { isCalmIdleOn } from '../config/calm-idle.js';
import { appState } from '../state/app.state.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('AttentionQueue');

/** Every source that may interrupt the idle screen, highest priority first. */
export const ATTENTION_PRIORITY = {
  /** "Ferni is thinking of you" check-in on the avatar. */
  checkin: 100,
  /** Unread messages Ferni or the team left for you. */
  'proactive-messages': 90,
  /** "On this day" memory card. */
  'memory-lane': 70,
  /** June 15 birthday celebration. */
  'ferni-birthday': 60,
  /** Feature discovery hint. */
  'feature-hint': 40,
  /** Morning / evening sidekick beside the avatar. */
  'time-of-day': 20,
} as const;

export type AttentionId = keyof typeof ATTENTION_PRIORITY;
export type AttentionOutcome = 'shown' | 'pending' | 'dropped';

export interface AttentionQueueOptions {
  /** Interruptions allowed per session. */
  budget?: number;
  /** How long to pool requests before choosing one. */
  settleMs?: number;
  /** True while no call is running; only idle requests are gated. */
  isIdle?: () => boolean;
  /** Where granted sources survive a reload in the same tab. */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

export interface AttentionQueue {
  request(id: AttentionId, show: () => void): AttentionOutcome;
  /** Interruptions shown so far this session. */
  spent(): number;
}

const GRANTED_KEY = 'ferni_attention_granted';
const DEFAULT_SETTLE_MS = 2500;

function sessionStore(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** Sources already granted this session; a reload keeps showing them. */
function readGranted(storage: AttentionQueueOptions['storage']): AttentionId[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(GRANTED_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter(
          (id): id is AttentionId => typeof id === 'string' && Object.hasOwn(ATTENTION_PRIORITY, id)
        )
      : [];
  } catch {
    return [];
  }
}

function runShow(id: AttentionId, show: () => void): void {
  try {
    show();
  } catch (error) {
    log.error({ id, error: String(error) }, 'Interruption failed to show');
  }
}

export function createAttentionQueue(options: AttentionQueueOptions = {}): AttentionQueue {
  const budget = options.budget ?? 1;
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const isIdle = options.isIdle ?? (() => appState.get('connection') === 'disconnected');
  const storage = options.storage === undefined ? sessionStore() : options.storage;
  const granted = new Set<AttentionId>(readGranted(storage));
  const pending = new Map<AttentionId, () => void>();
  const droppedLogged = new Set<AttentionId>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    timer = null;
    const waiting = [...pending.entries()].sort(
      ([a], [b]) => ATTENTION_PRIORITY[b] - ATTENTION_PRIORITY[a]
    );
    pending.clear();
    if (!isIdle()) {
      log.debug({ dropped: waiting.map(([id]) => id) }, 'Call started; idle interruptions dropped');
      return;
    }
    waiting.forEach(([id, show]) => {
      if (granted.size >= budget) {
        log.debug({ id }, 'Interruption dropped: session budget spent');
        return;
      }
      granted.add(id);
      try {
        storage?.setItem(GRANTED_KEY, JSON.stringify([...granted]));
      } catch (error) {
        log.debug({ error: String(error) }, 'Could not remember the spent budget');
      }
      log.debug({ id }, 'Interruption shown');
      runShow(id, show);
    });
  };

  return {
    request(id, show) {
      if (!isIdle() || granted.has(id)) {
        runShow(id, show);
        return 'shown';
      }
      if (granted.size >= budget) {
        // Pollers ask again every few seconds: log each source's drop once.
        if (!droppedLogged.has(id)) log.debug({ id }, 'Interruption dropped: session budget spent');
        droppedLogged.add(id);
        return 'dropped';
      }
      pending.set(id, show);
      timer ??= setTimeout(flush, settleMs);
      return 'pending';
    },
    spent: () => granted.size,
  };
}

let sharedQueue: AttentionQueue | null = null;

/**
 * Ask to show a self-showing interruption. Shows at once when the calm-idle
 * flag is off; otherwise goes through the session's attention queue.
 * Pass `wantsAttention = false` for a refresh that only hides or clears, so
 * one call site can serve both.
 */
export function requestAttention(id: AttentionId, show: () => void, wantsAttention = true): void {
  if (!wantsAttention || !isCalmIdleOn()) {
    show();
    return;
  }
  sharedQueue ??= createAttentionQueue();
  sharedQueue.request(id, show);
}
