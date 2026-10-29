/**
 * Expression arbiter (avatar audit item 9): one gate for every expression
 * request, so a single agent message shows one reaction instead of five.
 *
 * Rules:
 * - Priority: safety > reply tone > reaction > ambient. A higher priority
 *   always takes the face at once.
 * - Dwell: a shown expression keeps the face for at least MIN_DWELL_MS (or its
 *   hold, when longer). Requests of the same or lower priority in that window
 *   are dropped, so the face doesn't flicker between signals.
 * - Hysteresis: asking again for the expression that is still showing (inside
 *   its hold, or resting with no hold) is a no-op, so it isn't replayed.
 *
 * The arbiter only decides; each request carries the one `show` it runs.
 * Off by default: the expressionArbiter switch in config/motion-flags.ts.
 *
 * @module app/expression-arbiter
 */

import { isMotionFlagOn } from '../config/motion-flags.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ExpressionArbiter');

/** Minimum time an expression owns the face before an equal or lower request may replace it. */
export const MIN_DWELL_MS = 1200;

export type ExpressionPriority = 'ambient' | 'reaction' | 'replyTone' | 'safety';

const RANK: Readonly<Record<ExpressionPriority, number>> = {
  ambient: 0,
  reaction: 1,
  replyTone: 2,
  safety: 3,
};

export interface ExpressionRequest {
  /** Which signal asked (logging). */
  source: string;
  priority: ExpressionPriority;
  /** What the face will show; equal keys count as the same expression. */
  key: string;
  /** How long the expression holds before relaxing (0 = rests until replaced). */
  holdMs?: number;
  /** The single visible reaction to run when the request wins. */
  show: () => void;
}

export interface ExpressionArbiter {
  /** Show the request if it wins. Returns true when it was shown. */
  request(req: ExpressionRequest): boolean;
  /** Forget the current owner (call end, tests). */
  reset(): void;
}

interface Owner {
  key: string;
  rank: number;
  /** End of the dwell: equal or lower priorities wait until then. */
  until: number;
  /** When the expression stops showing (Infinity for a resting one). */
  shownUntil: number;
}

export function createExpressionArbiter(now: () => number): ExpressionArbiter {
  let owner: Owner | null = null;

  return {
    request(req) {
      const t = now();
      const rank = RANK[req.priority];
      if (owner && req.key === owner.key && t < owner.shownUntil && rank <= owner.rank) {
        log.debug('Expression already showing', { source: req.source, key: req.key });
        return false;
      }
      if (owner && t < owner.until && rank <= owner.rank) {
        log.debug('Expression dropped (dwell)', {
          source: req.source,
          key: req.key,
          holder: owner.key,
        });
        return false;
      }
      try {
        req.show();
      } catch (error) {
        log.warn('Expression failed to show', {
          source: req.source,
          key: req.key,
          error: String(error),
        });
        return false;
      }
      const hold = req.holdMs ?? 0;
      owner = {
        key: req.key,
        rank,
        until: t + Math.max(MIN_DWELL_MS, hold),
        shownUntil: hold > 0 ? t + hold : Number.POSITIVE_INFINITY,
      };
      return true;
    },
    reset() {
      owner = null;
    },
  };
}

export function isExpressionArbiterEnabled(): boolean {
  return isMotionFlagOn('expressionArbiter');
}

/** The app-wide arbiter. */
export const expressionArbiter = createExpressionArbiter(() => Date.now());
