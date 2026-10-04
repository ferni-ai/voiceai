/**
 * A small sound when a reply is slow to start: "Mm." / "Hmm." at the turn.
 *
 * Gaps between turns are typically ~200 ms (Levinson & Torreira 2015), often
 * opened with a reaction or filler while the content is still being planned;
 * gaps past ~700 ms are heard as reluctance (Kendrick & Torreira 2015). Our
 * first words take 2-4 s (STT
 * end of turn + LLM + TTS, measured 2026-09-28), so after a short wait we play
 * a cached reaction clip, and the reply follows it. It is kept rare (every
 * other turn at most, half the time) because the same sound on every turn is
 * a tic, the thing the opener gate removes from the text.
 *
 * @module agents/integrations/turn-opening-sound
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'TurnOpeningSound' });

export const TURN_OPENING = {
  /** Play only if the agent is still silent this long after the turn ends. */
  waitMs: 650,
  probability: 0.5,
  /** No opening sound right after a backchannel: "mm ... mm". */
  afterBackchannelMs: 2500,
} as const;

export interface TurnOpeningMoment {
  /** The user's final words for the turn. */
  transcript: string;
  /** Whether the previous turn got an opening sound. */
  playedLastTurn: boolean;
  sinceLastClipMs: number;
}

/** The clip text to play, or null. */
export function turnOpeningClip(
  m: TurnOpeningMoment,
  random: () => number = Math.random
): string | null {
  if (m.playedLastTurn) return null;
  if (m.sinceLastClipMs < TURN_OPENING.afterBackchannelMs) return null;
  if (random() >= TURN_OPENING.probability) return null;
  // Thinking about a question sounds like "hmm"; taking in news, "mm".
  return /\?\s*$/.test(m.transcript.trim()) ? 'Hmm' : 'Mm';
}

interface SessionEvents {
  on(event: string, handler: (ev: unknown) => void): unknown;
  off(event: string, handler: (ev: unknown) => void): unknown;
}

/**
 * Watch the session: when the agent starts thinking about a reply and is
 * still silent after TURN_OPENING.waitMs, play an opening clip. Returns a
 * detach function.
 */
export function attachTurnOpeningSound(
  session: SessionEvents,
  clips: { playClip: (text: string) => boolean; lastPlayedAt: () => number },
  lastUserTranscript: () => string,
  /** Whether reply audio was produced at or after this time (TTS first frame). */
  replyAudioSince: (since: number) => boolean = () => false
): () => void {
  let timer: NodeJS.Timeout | null = null;
  let playedLastTurn = false;
  let userStartedAt = 0;
  let userSpeaking = false;
  const cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  // The agent goes "thinking" on ink's early end-of-turn, which is often only a
  // pause: if the caller carries on, the "Mm" would land on top of them.
  const onUserState = (ev: unknown): void => {
    userSpeaking = (ev as { newState?: string }).newState === 'speaking';
    if (!userSpeaking) return;
    userStartedAt = Date.now();
    cancel();
  };
  const onState = (ev: unknown): void => {
    cancel();
    if ((ev as { newState?: string }).newState !== 'thinking') return;
    timer = setTimeout(() => {
      timer = null;
      if (userSpeaking) return;
      // The reply's audio exists already; its playback is about to start.
      if (replyAudioSince(userStartedAt)) return;
      const text = turnOpeningClip({
        transcript: lastUserTranscript(),
        playedLastTurn,
        sinceLastClipMs: Date.now() - clips.lastPlayedAt(),
      });
      playedLastTurn = text !== null && clips.playClip(text);
      if (playedLastTurn) log.info({ text }, 'turn opening clip played');
    }, TURN_OPENING.waitMs);
  };
  session.on('agent_state_changed', onState);
  session.on('user_state_changed', onUserState);
  return () => {
    cancel();
    session.off('agent_state_changed', onState);
    session.off('user_state_changed', onUserState);
  };
}
