/**
 * The `eot` key of a TURN_RECEIPT (turn-receipt.ts): LiveKit's end-of-turn
 * model's last call before the commit (TURN_DETECTOR, turn-patience.ts). It
 * carries the model that made it (v1-mini after a cloud fallback), its
 * probability and the threshold below which LiveKit waited its maximum. The key
 * is absent when no model ran or its prediction timed out, so receipts without
 * a model are unchanged.
 *
 * Split out of turn-receipt.ts to keep that file under the 500-line ratchet.
 *
 * @module agents/shared/turn-receipt-eot
 */

/** LiveKit's end-of-turn prediction (its eot_prediction event) with the model that made it. */
export interface EotCall {
  model: string;
  probability: number;
  threshold: number;
  /** The caller's last speech to the prediction. */
  delayMs: number;
}

/**
 * A prediction this old at the commit belongs to an earlier pause. The commit
 * follows within the maximum wait (2 s) plus an unfinished-turn hold (2 s).
 */
const EOT_MAX_AGE_MS = 6000;

/** The latest end-of-turn prediction, held until the commit it belongs to claims it. */
export class PendingEot {
  private pending: { call: EotCall; at: number } | null = null;

  constructor(private readonly now: () => number) {}

  /** LiveKit's model judged the caller's pause; the last one counts. Null (malformed) is ignored. */
  note(call: EotCall | null): void {
    if (call) this.pending = { call, at: this.now() };
  }

  /** At a commit: the turn keeps its first prediction, and the pending one is always cleared. */
  claim(turn: { eot: EotCall | null }): void {
    const { pending } = this;
    this.pending = null;
    if (pending && this.now() - pending.at <= EOT_MAX_AGE_MS) turn.eot ??= pending.call;
  }
}

/** An eot_prediction event as an EotCall, labelled with the session detector's model now. */
export function eotCallFrom(ev: unknown, session: unknown): EotCall | null {
  const p = (ev ?? {}) as { probability?: number; threshold?: number; delayMs?: number };
  if (typeof p.probability !== 'number' || typeof p.threshold !== 'number') return null;
  // The session's detector; its model flips to v1-mini after a cloud fallback.
  const model = (session as { turnDetection?: { model?: unknown } }).turnDetection?.model;
  return {
    model: typeof model === 'string' ? model : 'unknown',
    probability: p.probability,
    threshold: p.threshold,
    delayMs: p.delayMs ?? 0,
  };
}

/** The receipt's `eot` key, rounded; spread in, so it is absent when no model ran. */
export function eotReceiptField(eot: EotCall | null): { eot?: EotCall } {
  if (!eot) return {};
  return {
    eot: {
      ...eot,
      probability: Math.round(eot.probability * 1000) / 1000,
      threshold: Math.round(eot.threshold * 1000) / 1000,
      delayMs: Math.round(eot.delayMs),
    },
  };
}
