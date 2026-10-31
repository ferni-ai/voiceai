/**
 * Silence on a quiet call: one presence check a call at most, and later and
 * softer when the caller is tired or it's the middle of the night.
 *
 * Prod call 2026-10-11, 3:47 am for the caller: after 13-36 s pauses Ferni said
 * "Mm? You still there?" four times and two more "Mm?"s. Each came about 15 s
 * after he stopped (LiveKit's userAwayTimeout), and the silence path's
 * once-per-silence limit reset every time the caller spoke, so a tired caller
 * who left gaps got checked on again and again; the note it sends already
 * says not to ask, and the model asked anyway.
 *
 * LISTEN_FIRST=on (off by default):
 * - at most one spoken presence check a call, the idle check-in included;
 * - caller low on energy or late night: nothing until 45 s of quiet; then,
 *   late at night, one soft "I'm here if you want to talk, or we can call it
 *   a night"; a tired caller in the daytime gets quiet (a presence sound, if
 *   PRESENCE_SOUNDS is on, is the only thing that plays);
 * - otherwise the usual silence response, still only once a call.
 *
 * QUIET_AFTER_QUESTION=on (off by default; owner's call 2026-10-30), with LISTEN_FIRST=on:
 * - late at night, when Ferni's last line asked the caller something, one soft
 *   check-in after QUESTION_WAIT_MS of quiet instead of the 45 s hold: the
 *   long quiet is for sitting together, not for a question left hanging;
 * - a call with any crisis signal never gets a long hold: the usual daytime
 *   silence response instead, question or not.
 *
 * @module agents/voice-agent/quiet-presence
 */

import type { voice } from '@livekit/agents';
import {
  callerTimeZoneOf,
  lateNightFor,
  listenFirstEnabled,
  lowEnergyCaller,
  turnsOf,
} from '../personas/listen-first.js';
import { flagOn, type Env } from '../../config/env-flag.js';
import { crisisRiskThisCall } from '../../services/safety/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { endsOnQuestion } from '../personas/answer-turn.js';
import { sessionScope } from '../personas/crisis-gate-words.js';
import { crisisDecidedOn } from '../safety/crisis-gate-signal.js';
import { safeGenerateReply } from '../shared/safe-generate-reply.js';
import { fireAndForget } from '../../utils/safe-fire-and-forget.js';
import { isRealSilence, type SessionStates } from './dead-air.js';
import { silenceResponseBlocked } from './silence-response-blockers.js';

/** How long a tired or late-night caller's quiet runs before Ferni says anything. */
export const QUIET_WAIT_MS = 45_000;
/** The quiet before LiveKit marks the caller "away" (AgentSession userAwayTimeout, default 15 s). */
export const AWAY_MS = 15_000;
/**
 * QUIET_AFTER_QUESTION: how long the quiet after Ferni's question runs before one soft
 * check-in. The middle of the 8-10 s the owner chose: time for a tired caller to think
 * and answer, short of leaving a question hanging. It is under AWAY_MS, so it runs from
 * Ferni finishing speaking (onAgentDone), not from the caller being marked away.
 */
export const QUESTION_WAIT_MS = 9_000;

const log = createLogger({ module: 'quiet-presence' });

function quietAfterQuestionOn(env: Env = process.env): boolean {
  return flagOn('QUIET_AFTER_QUESTION', env);
}

/**
 * Ferni's line asked the caller something: a question mark in its last sentence
 * (answer-turn.ts), after dropping what trails it: emoji, quotes, brackets, a stage
 * direction ("[softly]") and stray punctuation ("you okay?," reads as a question).
 */
export function askedQuestion(ferniLine: string | undefined): boolean {
  if (!ferniLine) return false;
  const trimmed = ferniLine
    .replace(/(?:\s*\[[^\]]*\])+\s*$/u, '')
    .replace(/[^\p{L}\p{N}?.!]+$/u, '');
  return endsOnQuestion(trimmed);
}

export const QUESTION_NOTE =
  "[It's late for them and they haven't answered what you just asked. In one short, soft sentence, let them know there's no rush: they can take their time, or let it go. Don't repeat the question or ask if they're still there.]";

export const NIGHT_NOTE =
  "[It's late for them and they've been quiet a while. In one short, soft sentence, let them know you're here if they want to talk, or you can both call it a night. Don't ask if they're still there.]";

export interface QuietCues {
  lowEnergy: boolean;
  lateNight: boolean;
  /** Ferni's last line asked the caller something (read with QUIET_AFTER_QUESTION on). */
  askedQuestion?: boolean;
  /** Anything on this call signalled crisis (read with QUIET_AFTER_QUESTION on). */
  crisis?: boolean;
}

export type QuietDecision =
  | { action: 'speak'; instructions: string }
  | { action: 'wait'; ms: number }
  /** Stay quiet: a check already spoke this call, or a tired caller in the daytime. */
  | { action: 'none' }
  /** The usual silence response may answer (if nothing has this call). */
  | { action: 'usual' };

/**
 * What to do `quietMs` into a quiet stretch, with `checks` presence checks already spoken
 * this call. `afterQuestion` is QUIET_AFTER_QUESTION: off, the cues' question and crisis
 * are not read.
 */
export function quietDecision(
  quietMs: number,
  cues: QuietCues,
  checks: number,
  afterQuestion = false
): QuietDecision {
  if (checks >= 1) return { action: 'none' };
  if (afterQuestion && cues.crisis) return { action: 'usual' }; // never a long hold
  if (!cues.lowEnergy && !cues.lateNight) return { action: 'usual' };
  if (!cues.lateNight) return { action: 'none' };
  const asked = afterQuestion && cues.askedQuestion === true;
  const waitMs = asked ? QUESTION_WAIT_MS : QUIET_WAIT_MS;
  if (quietMs < waitMs) return { action: 'wait', ms: waitMs - quietMs };
  return { action: 'speak', instructions: asked ? QUESTION_NOTE : NIGHT_NOTE };
}

export interface QuietPresenceDeps {
  cues: () => QuietCues;
  /** When the caller last spoke (ms since epoch). */
  lastSpokeAt: () => number;
  /** Real silence and nothing holding a silence response back. */
  canSpeak: () => boolean;
  speak: (instructions: string) => void;
  /** QUIET_AFTER_QUESTION is on (read at each decision, so a caller's own flags apply). */
  afterQuestion?: () => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export class QuietPresence {
  private checks = 0;
  private timer: unknown = null;

  constructor(private readonly deps: QuietPresenceDeps) {}

  /**
   * The caller is "away": both sides have been quiet for AWAY_MS. True when
   * this took the silence (spoke, waits or stays quiet); false when the usual
   * silence response may answer.
   */
  onQuiet(): boolean {
    this.cancel();
    return this.decide(Date.now() - AWAY_MS, this.deps.lastSpokeAt());
  }

  /**
   * Ferni just stopped speaking. With QUIET_AFTER_QUESTION on, a question late at night
   * gets its check-in QUESTION_WAIT_MS later, before the caller is marked away. The line
   * is read when the wait ends, once it is surely in the call's history.
   */
  onAgentDone(): void {
    if (!this.afterQuestion()) return;
    this.cancel();
    const quietSince = Date.now();
    const spokeAt = this.deps.lastSpokeAt();
    this.later(QUESTION_WAIT_MS, () => {
      if (this.deps.lastSpokeAt() === spokeAt && this.deps.cues().askedQuestion === true) {
        this.decide(quietSince, spokeAt);
      }
    });
  }

  private afterQuestion(): boolean {
    return this.deps.afterQuestion?.() ?? false;
  }

  private later(ms: number, fn: () => void): void {
    const set = this.deps.setTimer ?? ((f, wait) => setTimeout(f, wait));
    this.timer = set(() => {
      this.timer = null;
      fn();
    }, ms);
  }

  private decide(quietSince: number, spokeAt: number): boolean {
    const cues = this.deps.cues();
    const afterQuestion = this.afterQuestion();
    const d = quietDecision(Date.now() - quietSince, cues, this.checks, afterQuestion);
    if (d.action === 'usual') return false;
    if (d.action === 'wait') {
      if (!afterQuestion || cues.askedQuestion !== true) {
        log.info({ reason: 'late_night', waitMs: d.ms }, 'Quiet presence holding');
      }
      // They spoke since: this quiet is over.
      this.later(d.ms, () => {
        if (this.deps.lastSpokeAt() === spokeAt) this.decide(quietSince, spokeAt);
      });
    } else if (d.action === 'none' && this.checks === 0) {
      log.info({ reason: 'tired_daytime' }, 'Quiet presence holding');
    } else if (d.action === 'speak' && this.deps.canSpeak()) {
      this.checks++;
      this.deps.speak(d.instructions);
    }
    return true;
  }

  /** Another path (the usual silence response, the idle check-in) is about to check in: may it? */
  takeCheck(): boolean {
    if (this.checks >= 1) return false;
    this.checks++;
    return true;
  }

  /** The call is ending. */
  cancel(): void {
    if (this.timer === null) return;
    const clear = this.deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    clear(this.timer);
    this.timer = null;
  }
}

interface QuietCallContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: voice.AgentSession<any>;
  userData: { callerTimezone?: string; lastUserMessage?: string; services?: unknown };
  sessionId: string;
  room?: { remoteParticipants?: Map<string, unknown> };
  conversationManager: { isAgentSpeaking: () => boolean };
}

/**
 * Any crisis signal on this call: a reply the crisis gate guided or replaced, or risk noted
 * (or a read still in flight) under either of the call's ids. Fails toward the short wait.
 */
function callHasCrisisSignal(
  session: unknown,
  callIds: ReadonlyArray<string | undefined>
): boolean {
  if (crisisDecidedOn(session)) return true;
  return callIds.some((id) => id !== undefined && crisisRiskThisCall(id));
}

/** The call's QuietPresence with LISTEN_FIRST=on, else null (session-state-handler.ts). */
export function quietPresenceFor(
  ctx: QuietCallContext,
  callerLastSpokeAt: () => number
): QuietPresence | null {
  if (!listenFirstEnabled()) return null;
  const { session, userData, sessionId, room, conversationManager } = ctx;
  return new QuietPresence({
    cues: () => {
      const turns = turnsOf(session.history?.items ?? []);
      const cues: QuietCues = {
        lowEnergy: lowEnergyCaller(turns.caller),
        lateNight: lateNightFor(new Date(), callerTimeZoneOf(userData)),
      };
      if (!quietAfterQuestionOn()) return cues;
      return {
        ...cues,
        askedQuestion: askedQuestion(turns.ferni.at(-1)),
        crisis: callHasCrisisSignal(session, [sessionId, sessionScope(userData)]),
      };
    },
    afterQuestion: () => quietAfterQuestionOn(),
    lastSpokeAt: callerLastSpokeAt,
    canSpeak: () =>
      !conversationManager.isAgentSpeaking() &&
      isRealSilence(session as unknown as SessionStates) &&
      !silenceResponseBlocked(sessionId, room, (Date.now() - callerLastSpokeAt()) / 1000, userData),
    speak: (instructions) =>
      fireAndForget(async () => {
        await safeGenerateReply(session, {
          instructions,
          allowInterruptions: true,
          context: 'silence-quiet-presence',
          sessionId,
          timeoutMs: 10_000,
          priority: 'low',
          waitForPlayout: false,
        });
      }, 'quiet-presence'),
  });
}
