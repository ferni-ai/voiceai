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
import { safeGenerateReply } from '../shared/safe-generate-reply.js';
import { fireAndForget } from '../../utils/safe-fire-and-forget.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isRealSilence, type SessionStates } from './dead-air.js';
import { silenceResponseBlocked } from './silence-response-blockers.js';

/** How long a tired or late-night caller's quiet runs before Ferni says anything. */
export const QUIET_WAIT_MS = 45_000;
/** The quiet before LiveKit marks the caller "away" (AgentSession userAwayTimeout, default 15 s). */
export const AWAY_MS = 15_000;

const log = createLogger({ module: 'QuietPresence' });

export const NIGHT_NOTE =
  "[It's late for them and they've been quiet a while. In one short, soft sentence, let them know you're here if they want to talk, or you can both call it a night. Don't ask if they're still there.]";

export interface QuietCues {
  lowEnergy: boolean;
  lateNight: boolean;
}

export type QuietDecision =
  | { action: 'speak'; instructions: string }
  | { action: 'wait'; ms: number }
  /** Stay quiet: a check already spoke this call, or a tired caller in the daytime. */
  | { action: 'none' }
  /** The usual silence response may answer (if nothing has this call). */
  | { action: 'usual' };

/** What to do `quietMs` into a quiet stretch, with `checks` presence checks already spoken this call. */
export function quietDecision(quietMs: number, cues: QuietCues, checks: number): QuietDecision {
  if (checks >= 1) return { action: 'none' };
  if (!cues.lowEnergy && !cues.lateNight) return { action: 'usual' };
  if (!cues.lateNight) return { action: 'none' };
  if (quietMs < QUIET_WAIT_MS) return { action: 'wait', ms: QUIET_WAIT_MS - quietMs };
  return { action: 'speak', instructions: NIGHT_NOTE };
}

export interface QuietPresenceDeps {
  cues: () => QuietCues;
  /** When the caller last spoke (ms since epoch). */
  lastSpokeAt: () => number;
  /** Real silence and nothing holding a silence response back. */
  canSpeak: () => boolean;
  speak: (instructions: string) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Each time this holds the silence (waits, or stays quiet). Without it a held 45 s left no
   *  trace, and a release sweep's dead air took code reading to explain (#3164). */
  onHold?: (hold: QuietHold) => void;
}

interface QuietHold {
  action: 'wait' | 'none';
  waitMs: number;
  quietMs: number;
  checks: number;
  lowEnergy: boolean;
  lateNight: boolean;
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

  private decide(quietSince: number, spokeAt: number): boolean {
    const quietMs = Date.now() - quietSince;
    const cues = this.deps.cues();
    const d = quietDecision(quietMs, cues, this.checks);
    if (d.action === 'usual') return false;
    if (d.action === 'wait' || d.action === 'none') {
      const waitMs = d.action === 'wait' ? d.ms : 0;
      this.deps.onHold?.({ action: d.action, waitMs, quietMs, checks: this.checks, ...cues });
    }
    if (d.action === 'wait') {
      const set = this.deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
      this.timer = set(() => {
        this.timer = null;
        // They spoke since: this quiet is over.
        if (this.deps.lastSpokeAt() === spokeAt) this.decide(quietSince, spokeAt);
      }, d.ms);
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
  userData: { callerTimezone?: string; lastUserMessage?: string };
  sessionId: string;
  room?: { remoteParticipants?: Map<string, unknown> };
  conversationManager: { isAgentSpeaking: () => boolean };
}

/** The call's QuietPresence with LISTEN_FIRST=on, else null (session-state-handler.ts). */
export function quietPresenceFor(
  ctx: QuietCallContext,
  callerLastSpokeAt: () => number
): QuietPresence | null {
  if (!listenFirstEnabled()) return null;
  const { session, userData, sessionId, room, conversationManager } = ctx;
  return new QuietPresence({
    cues: () => ({
      lowEnergy: lowEnergyCaller(turnsOf(session.history?.items ?? []).caller),
      lateNight: lateNightFor(new Date(), callerTimeZoneOf(userData)),
    }),
    lastSpokeAt: callerLastSpokeAt,
    onHold: (hold) => log.info({ sessionId, ...hold }, 'QUIET_HOLD'),
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
