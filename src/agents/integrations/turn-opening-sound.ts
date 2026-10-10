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
 * Off by default (TURN_OPENING_SOUND=on enables it). On a dev call
 * (2026-10-04) every "Mm" was followed by the reply 20-250 ms later, so the
 * clip landed on the start of Ferni's own sentence, which usually opens with
 * an acknowledgement anyway ("Mm. Good to hear."). Fillers only help when the
 * wait is long (around 4 s, arXiv 2507.22352); replies now start in about 1 s.
 *
 * TURN_OPENING_SOUND=early is the latency mode. Of a ~1.4 s reply gap (dev +
 * prod, 2026-10-10, n=1,100 turns) ~0.45 s is ink deciding the turn is over
 * and ~0.9 s runs from that commit to the reply's first audio, mostly the
 * model's first words. In early mode the clip plays TURN_OPENING_EARLY_MS
 * (120) after the commit, only while no reply words have reached TTS (so the
 * reply is still >= ~0.4 s away), chosen from the caller's words, never the
 * same clip twice running and never on two turns in a row. The reply's first
 * audio waits for the clip to end (no overlap) and its own stock opener is
 * trimmed (turnOpenedSince, opener-gate.ts): "Mm." then "That's a lot.", not
 * "Mm." then "Mm, that's a lot."
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

/** Whether to attach the opening sound at all (opt-in, see module doc). */
export function turnOpeningSoundEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.TURN_OPENING_SOUND === 'on' || env.TURN_OPENING_SOUND === 'early';
}

/** Early (latency) mode's wait after the commit, or null when the mode is not early. */
export function earlyOpeningWaitMs(
  env: Record<string, string | undefined> = process.env
): number | null {
  if (env.TURN_OPENING_SOUND !== 'early') return null;
  const ms = Number(env.TURN_OPENING_EARLY_MS ?? '120');
  return Number.isFinite(ms) && ms >= 0 ? ms : 120;
}

const LAUGH = /\b(?:ha(?:ha)+|hah|lol|lmao)\b|\[laugh/i;
const GRIEF = /\b(?:died|passed away|funeral|cancer|diagnos\w*|miscarriage|hospice)\b/i;
const GOOD =
  /\b(?:got the job|got engaged|engaged|promoted|promotion|pregnant|we won|i won|great news|guess what|so excited)\b/i;
const HARD =
  /\b(?:stress\w*|exhaust\w*|tired|rough|awful|terrible|overwhelm\w*|fired|laid off|broke up|divorce|sick|hurt|anxious|worried|scared|lonely|sad|long day)\b/i;

/**
 * Early mode's clip for these words, or null: none for a laugh (a laugh-along
 * answers that), a short turn ("okay", "how are you?") or a repeat of the last
 * clip. Clips are the persona's cached backchannels (conversational-audio-cache.ts).
 */
export function earlyOpeningClip(transcript: string, lastClip: string | null): string | null {
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  if (words.length < 3 || LAUGH.test(transcript)) return null;
  const question = /\?\s*$/.test(transcript.trim());
  const options = GRIEF.test(transcript)
    ? ['Mm']
    : GOOD.test(transcript)
      ? ['Oh', 'Whoa']
      : HARD.test(transcript)
        ? ['Oof', 'Mm']
        : question
          ? words.length > 4
            ? ['Hmm']
            : []
          : ['Mm', 'Yeah'];
  return options.find((clip) => clip !== lastClip) ?? null;
}

/** When each session's current turn was opened by a clip (early mode). */
const openedAt = new WeakMap<object, number>();

/** Whether a turn-opening clip played for this session at or after `since`. */
export function turnOpenedSince(session: object, since: number): boolean {
  return (openedAt.get(session) ?? -1) >= since;
}

/** What early mode needs besides the clips. */
export interface EarlyOpening {
  waitMs: number;
  /** Whether the reply's words reached TTS at or after this time. */
  replyTextSince(since: number): boolean;
  /** The clip's length in ms (0 when unknown). */
  clipMs(text: string): number;
  /** Hold the reply's first audio this long. */
  holdReply(ms: number): void;
}

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
  replyAudioSince: (since: number) => boolean = () => false,
  early?: EarlyOpening
): () => void {
  let timer: NodeJS.Timeout | null = null;
  let playedLastTurn = false;
  let lastClip: string | null = null;
  let lastThinkingTurn = -1;
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
  const playEarly = (thinkingAt: number, skipTurn: boolean): void => {
    // Words already at TTS mean audio in ~120 ms: a clip would only delay it.
    if (!early || skipTurn || early.replyTextSince(userStartedAt)) return;
    const text = earlyOpeningClip(lastUserTranscript(), lastClip);
    playedLastTurn = text !== null && clips.playClip(text);
    if (!playedLastTurn || text === null) return;
    lastClip = text;
    openedAt.set(session, Date.now());
    const clipMs = early.clipMs(text);
    early.holdReply(clipMs);
    log.info({ text, afterCommitMs: Date.now() - thinkingAt, clipMs }, 'TURN_OPENING_EARLY');
  };
  const onState = (ev: unknown): void => {
    cancel();
    if ((ev as { newState?: string }).newState !== 'thinking') return;
    const thinkingAt = Date.now();
    // Early mode opens a caller's turn once: never again after a tool call.
    if (early && userStartedAt === lastThinkingTurn) return;
    lastThinkingTurn = userStartedAt;
    // ...and a turn after one with a clip never gets one, however it ends.
    const skipTurn = early !== undefined && playedLastTurn;
    if (early) playedLastTurn = false;
    timer = setTimeout(() => {
      timer = null;
      if (userSpeaking) return;
      // The reply's audio exists already; its playback is about to start.
      if (replyAudioSince(userStartedAt)) return;
      if (early) {
        playEarly(thinkingAt, skipTurn);
        return;
      }
      const text = turnOpeningClip({
        transcript: lastUserTranscript(),
        playedLastTurn,
        sinceLastClipMs: Date.now() - clips.lastPlayedAt(),
      });
      playedLastTurn = text !== null && clips.playClip(text);
      if (playedLastTurn) log.info({ text }, 'turn opening clip played');
    }, early?.waitMs ?? TURN_OPENING.waitMs);
  };
  session.on('agent_state_changed', onState);
  session.on('user_state_changed', onUserState);
  return () => {
    cancel();
    session.off('agent_state_changed', onState);
    session.off('user_state_changed', onUserState);
  };
}
