/**
 * The AI notice's 3-hour repeat (AI_NOTICE_SPOKEN, shared/ai-notice.ts), installed on each
 * persona's AgentSession with the turn observers (turn-observers.ts installDirectorNotes).
 *
 * At a turn boundary only: once one of the persona's replies has finished playing and a short
 * beat has passed with the persona still listening. Never while the caller is mid-utterance,
 * never mid-sentence, never on a closing call, and never on a crisis turn: a crisis decision on
 * this turn (crisis-gate-signal.ts) or a crisis read still pending defers it to the next normal
 * turn. Spoken in this persona's voice, interruptible; a notice the caller talks over is not
 * counted and is said again at the next boundary.
 *
 * @module agents/multi-agent/ai-notice-wiring
 */

import { voice } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';
import { CRISIS_GATE_SIGNAL, crisisVerdictPending } from '../safety/crisis-gate-signal.js';
import {
  aiNoticeEnabled,
  repeatDue,
  repeatSpeaking,
  type NoticeDeps,
} from '../shared/ai-notice.js';
import { watchCaller } from '../shared/caller-activity.js';
import { farewellSaid } from '../shared/call-farewell.js';
import { isSessionClosing } from '../shared/session-closing-tracker.js';

const log = createLogger({ module: 'ai-notice-wiring' });

/** The pause after a reply before the notice, so a caller about to answer goes first. */
export const NOTICE_BEAT_MS = 800;

const EV = voice.AgentSessionEventTypes;

interface SpeechHandleLike {
  interrupted: boolean;
  waitForPlayout: () => Promise<void>;
}

export interface NoticeSession {
  on: (event: string, fn: (ev: never) => void) => unknown;
  off: (event: string, fn: (ev: never) => void) => unknown;
  say: (text: string, options?: { allowInterruptions?: boolean }) => SpeechHandleLike;
}

export interface WiringDeps extends NoticeDeps {
  setTimer?: (fn: () => void, ms: number) => unknown;
}

/** Watch one persona session for a turn boundary where a due repeat may be said. */
export function installAiNotice(
  input: { session: object; sessionId: string; cleanupFunctions: Array<() => void> },
  deps: WiringDeps = {}
): void {
  if (!aiNoticeEnabled(deps.env)) return;
  const { sessionId, cleanupFunctions } = input;
  const session = input.session as NoticeSession;
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? setTimeout;
  const caller = watchCaller(session);
  let state = 'initializing';
  let spoke = false;
  /** When the last reply finished: a crisis signal after it belongs to the turn now ending. */
  let turnStartedAt = 0;
  let crisisAt = -1;

  const crisisTurn = (since: number): boolean =>
    crisisAt >= since || crisisVerdictPending(session) !== null;
  const quiet = (): boolean =>
    state === 'listening' &&
    !caller.busy() &&
    !isSessionClosing(sessionId) &&
    !farewellSaid(sessionId);

  const sayIfDue = (since: number): void => {
    const text = repeatDue(sessionId, deps);
    if (!text || !quiet()) return;
    if (crisisTurn(since)) return log.info({ sessionId }, 'AI notice due, deferred: crisis turn');
    repeatSpeaking(sessionId, true);
    let handle: SpeechHandleLike;
    try {
      handle = session.say(text, { allowInterruptions: true });
    } catch (error) {
      repeatSpeaking(sessionId, false);
      return log.warn({ sessionId, error: String(error) }, 'AI notice not spoken');
    }
    handle.waitForPlayout().then(
      () => repeatSpeaking(sessionId, false, !handle.interrupted, deps),
      (error: unknown) => {
        repeatSpeaking(sessionId, false);
        log.warn({ sessionId, error: String(error) }, 'AI notice playout failed');
      }
    );
  };

  const onState = (ev: { newState?: string }): void => {
    state = ev.newState ?? state;
    if (state === 'speaking') spoke = true;
    if (state !== 'listening' || !spoke) return;
    spoke = false;
    const since = turnStartedAt;
    turnStartedAt = now();
    if (repeatDue(sessionId, deps)) setTimer(() => sayIfDue(since), NOTICE_BEAT_MS);
  };
  const onCrisis = (): void => {
    crisisAt = now();
  };
  session.on(EV.AgentStateChanged, onState);
  session.on(CRISIS_GATE_SIGNAL, onCrisis);
  cleanupFunctions.push(() => {
    session.off(EV.AgentStateChanged, onState);
    session.off(CRISIS_GATE_SIGNAL, onCrisis);
    caller.stop();
  });
}
