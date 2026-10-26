/**
 * What Ferni did out loud this call that isn't in his words. Side-track clips
 * (snore, whistle, hum, backchannels, laugh-along: clip-player.ts) and the
 * director's laugh and opening breath/sigh (reply-director.ts) never enter the
 * chat history, so asked "did you just snore?" the model could only guess.
 * Clips are recorded where they played, with why; the director (L1) reports
 * through its onNonverbal option, which tts-wrapper.ts points here. Read by the
 * next reply (personas/quirk-note.ts) and the after-call memory
 * (quirk-memory-register.ts).
 *
 * Keyed by userData.services.sessionId (the id the TTS gateway and endSession
 * use); bounded per call and per process. QUIRK_AWARENESS=on, else a no-op.
 *
 * @module services/session/quirk-log
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'QuirkLog' });

export function quirkAwarenessEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.QUIRK_AWARENESS === 'on';
}

export type QuirkKind =
  'snore' | 'whistle' | 'hum' | 'yawn' | 'laugh' | 'backchannel' | 'breath' | 'sigh';

/** Worth telling him about, most notable first. Breaths, sighs and "mm-hm"s never are. */
export const NOTABLE_QUIRKS: readonly QuirkKind[] = ['snore', 'whistle', 'hum', 'yawn', 'laugh'];

export interface QuirkEvent {
  kind: QuirkKind;
  /** Epoch ms it played. */
  at: number;
  /** Side-track clip or speech director. */
  source: 'clip' | 'director';
  personaId?: string;
  /** Why it played, in words he could say ("the line went quiet for about 20 s on an easy call"). */
  reason?: string;
  /** Where in the reply, for a director laugh ('before' | 'after'). */
  where?: string;
  /** How the caller took it, once they did: they laughed, or they brought it up. */
  landed?: 'laughed' | 'mentioned';
  /** What played: a tune id (presence-tune.ts) or a recorded file's label, never caller words. */
  clip?: string;
  /** VOICED_QUIRKS snore: he owns it out loud on the caller's next turn (quirk-note.ts), then false. */
  ownIt?: boolean;
}

/** The move id for the outcome log (MOVE_OUTCOMES, PR #720): quirk_snore, quirk_whistle, ... */
export const quirkMove = (kind: QuirkKind): string => `quirk_${kind}`;

const MAX_EVENTS = 40;
const MAX_SESSIONS = 64;
const logs = new Map<string, QuirkEvent[]>();

export function isNotable(kind: QuirkKind): boolean {
  return NOTABLE_QUIRKS.includes(kind);
}

/** Record something he did out loud. No-op without a sessionId or with QUIRK_AWARENESS off. */
export function recordQuirk(
  sessionId: string | undefined,
  event: Omit<QuirkEvent, 'at'> & { at?: number },
  env: Record<string, string | undefined> = process.env
): void {
  if (!sessionId || !quirkAwarenessEnabled(env)) return;
  let list = logs.get(sessionId);
  if (!list) {
    if (logs.size >= MAX_SESSIONS) logs.delete(logs.keys().next().value as string);
    list = [];
    logs.set(sessionId, list);
  }
  list.push({ ...event, at: event.at ?? Date.now() });
  if (list.length > MAX_EVENTS) {
    // Drop the oldest "mm-hm" or breath before a snore he may still be asked about.
    const i = list.findIndex((e) => !isNotable(e.kind));
    list.splice(i >= 0 ? i : 0, 1);
  }
  if (isNotable(event.kind)) {
    log.info(
      {
        sessionId,
        move: quirkMove(event.kind),
        source: event.source,
        reason: event.reason,
        clip: event.clip,
      },
      'QUIRK_PERFORMED'
    );
  }
}

/** This call's events so far, oldest first (the live array: callers may mark `landed`). */
export function quirkEvents(sessionId: string | undefined): QuirkEvent[] {
  return (sessionId && logs.get(sessionId)) || [];
}

/** Remove and return a call's events (the call ended). */
export function takeQuirks(sessionId: string): QuirkEvent[] {
  const list = logs.get(sessionId) ?? [];
  logs.delete(sessionId);
  return list;
}
