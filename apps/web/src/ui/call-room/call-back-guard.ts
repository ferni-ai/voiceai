/**
 * Back during a call keeps the call.
 *
 * In the Play app (a TWA) back is history back, and with no entry of our own
 * it finishes the activity, mid-call. While a call runs this holds one history
 * entry (`{ ferniCall: true }`). Back pops it: the call carries on, the entry
 * goes back, and a short hint says how to hang up.
 *
 * Panels opened during the call still close with back first: they hold their
 * own entry on top of ours (utils/back-closes-overlay.ts), so their back lands
 * on our entry, which this ignores. On hang-up the entry is given back quietly,
 * but only when it is the current one; under an open panel it is left for the
 * panel's own pop.
 *
 * @module ui/call-room/call-back-guard
 */

const CALL_KEY = 'ferniCall';
const OVERLAY_KEY = 'ferniOverlay';

type HistoryState = Record<string, unknown>;

const asState = (state: unknown): HistoryState | null =>
  typeof state === 'object' && state !== null ? (state as HistoryState) : null;

const isCallEntry = (state: unknown): boolean => asState(state)?.[CALL_KEY] === true;

/** Our entry is the current one, not a panel's entry stacked on it. */
const isOursOnTop = (state: unknown): boolean =>
  isCallEntry(state) && asState(state)?.[OVERLAY_KEY] !== true;

export interface CallBackGuard {
  /** The call started: hold an entry. Idempotent. */
  enter(): void;
  /** The call ended: give the entry back if it is on top. Idempotent. */
  leave(): void;
  dispose(): void;
}

export function createCallBackGuard(showHint: () => void): CallBackGuard {
  let active = false;
  let quietPops = 0;

  const push = (): void => {
    const { [OVERLAY_KEY]: _overlay, ...base } = asState(history.state) ?? {};
    history.pushState({ ...base, [CALL_KEY]: true }, '');
  };

  const onPop = (event: PopStateEvent): void => {
    if (quietPops > 0) {
      quietPops--;
      return;
    }
    // A panel's back landed on our entry: the panel closes, the call is untouched.
    if (!active || isCallEntry(event.state)) return;
    push();
    showHint();
  };

  window.addEventListener('popstate', onPop);

  return {
    enter() {
      if (active) return;
      active = true;
      push();
    },
    leave() {
      if (!active) return;
      active = false;
      if (isOursOnTop(history.state)) {
        quietPops++;
        history.back();
      }
    },
    dispose() {
      window.removeEventListener('popstate', onPop);
    },
  };
}
