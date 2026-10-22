/**
 * BACKCHANNEL_TIMING=on: when a live "mm-hm" starts, and which take it is.
 *
 * On 60 real prod calls (sounds audit, 2026-10-22) 145 of 467 backchannels
 * (31%) were cut a median 78 ms in because the caller carried on, 30% repeated
 * the same clip inside 60 s, and 36 backchannels were followed within 1.5 s by
 * the turn-opening clip ("Mm" then "Mm-hm").
 *
 * When: the clip waited 220 ms of pause whatever the caller had just said. A
 * cut clip's caller resumed at a pause of 240 / 311 / 402 ms (p10 / p50 / p90).
 * Whether their latest partial ends a sentence (. ! ?) is the cheap signal that
 * separates: 18% of those backchannels were cut, against 38-40% when it ends on
 * an open word and 27% with no partial. Ending on a conjunction, article,
 * preposition or "um" (40%) was no better than any open ending (38%), nor were
 * words since the last backchannel, so neither is used. Rule: 260 ms after a
 * sentence end, 390 ms otherwise (a breath pause ends at 400 ms,
 * backchannel-pause-clock.ts, so later never plays). 76% of the cut clips
 * resumed before their wait: the projected cut rate is 9.8% with every
 * fully heard clip kept if those pauses ran past ~600 ms, but if the VAD's
 * late flips mean a third of them resumed sooner, it stays near 32%. Re-run
 * voiceai-evidence/sounds-audit-2026-10-22/scripts/backchannel_stepon.py after
 * a week flagged on to see which.
 *
 * Which: a shuffled bag per token (Mm, Mhm, Mm-hmm, Yeah, Right) holding its
 * plain clip, and for Mm-hmm its voiced takes unless the moment is soft. A
 * take never plays twice inside 60 s, a token never twice running, and a
 * token over 40% of the call so far waits unless it is the least used (so
 * the soft trio cannot stall). Each play gets +-2 dB of gain.
 *
 * @module agents/integrations/backchannel-timing
 */

import { VOICED_TAKES } from '../shared/reaction-clips.js';
import { REACTION_VARIANTS } from './voiced-presence.js';

/** BACKCHANNEL_TIMING=on: the timing, variation and turn-edge rules above. */
export function backchannelTimingEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.BACKCHANNEL_TIMING === 'on';
}

export const BACKCHANNEL_TIMING = {
  /** Pause before a clip when the caller's partial ends a sentence. */
  phraseEndPauseMs: 260,
  /** ...and when it does not (mid-phrase, no punctuation, no partial yet). */
  openPhrasePauseMs: 390,
  /** The same take never twice inside this window. */
  repeatWindowMs: 60_000,
  /** A token past this share of the call waits, unless it is the least used. */
  maxTokenShare: 0.4,
  /** Gain jitter per play, +- dB. */
  gainJitterDb: 2,
  /** No turn-opening clip when a backchannel played this soon before the turn ended. */
  openerAfterBackchannelMs: 2500,
} as const;

const SENTENCE_END = /[.!?]["')\]]*\s*$/;

/** How long the caller's pause must run before a backchannel may start. */
export function backchannelPauseMs(partialTranscript: string): number {
  return SENTENCE_END.test(partialTranscript)
    ? BACKCHANNEL_TIMING.phraseEndPauseMs
    : BACKCHANNEL_TIMING.openPhrasePauseMs;
}

/** A clip's volume with +-gainJitterDb of random gain. */
export function jitterVolume(volume: number, random: () => number = Math.random): number {
  const db = (random() * 2 - 1) * BACKCHANNEL_TIMING.gainJitterDb;
  return volume * 10 ** (db / 20);
}

/** Whether the opening clip should stay off: a backchannel played just before the turn ended. */
export function backchannelBeforeTurnEnd(turnEndedAt: number, lastClipAt: number): boolean {
  return lastClipAt > 0 && turnEndedAt - lastClipAt < BACKCHANNEL_TIMING.openerAfterBackchannelMs;
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = out[i] as T;
    out[i] = out[j] as T;
    out[j] = swap;
  }
  return out;
}

type PlayClip = (text: string, opts?: { pauseStartedAt?: number }) => boolean;

/**
 * The live clip player under BACKCHANNEL_TIMING (clip-player.ts): +-2 dB per
 * clip, and an mm-hm the bag picked plays as picked, never re-varied by
 * VOICED_PRESENCE (voiced-presence.ts) into a take heard a moment ago.
 */
export function timedLivePlay(
  playAt: (volume: () => number) => PlayClip,
  volume: number,
  vary: (play: PlayClip) => PlayClip
): PlayClip {
  const plain = playAt(() => jitterVolume(volume));
  const varied = vary(plain);
  return (text, opts) => (REACTION_VARIANTS[text] === 'mmhm' ? plain : varied)(text, opts);
}

/** A token's clips: the plain render, plus (Mm-hmm only, when `takes`) the voiced mm-hm takes. */
function clipsFor(token: string, takes: boolean): readonly string[] {
  return takes && token === 'Mm-hmm' ? [token, ...VOICED_TAKES.mmhm] : [token];
}

export interface BackchannelBag {
  /**
   * Play the first clip that fits: `first` (a contextual reaction) if not
   * heard in 60 s, else a token from `tokens` in random order. Returns the
   * text played, or null (nothing fresh, or `play` refused them all).
   */
  play: (
    first: string | null,
    tokens: readonly string[],
    takes: boolean,
    play: (text: string) => boolean,
    now?: number
  ) => string | null;
}

/** One call's backchannel bags. */
export function createBackchannelBag(random: () => number = Math.random): BackchannelBag {
  const lastAt = new Map<string, number>();
  const counts = new Map<string, number>();
  const decks = new Map<string, string[]>();
  let total = 0;
  let lastToken: string | null = null;
  const fresh = (clip: string, now: number): boolean =>
    now - (lastAt.get(clip) ?? -Infinity) >= BACKCHANNEL_TIMING.repeatWindowMs;
  const record = (token: string, clip: string, now: number): void => {
    lastAt.set(clip, now);
    counts.set(token, (counts.get(token) ?? 0) + 1);
    total++;
    lastToken = token;
    const deck = decks.get(token) ?? [];
    if (deck.includes(clip)) deck.splice(deck.indexOf(clip), 1);
  };
  /** The token's next fresh clip from its shuffled deck (refilled when empty). */
  const draw = (token: string, takes: boolean, now: number): string | undefined => {
    const all = clipsFor(token, takes);
    let deck = decks.get(token)?.filter((c) => all.includes(c));
    if (deck === undefined || deck.length === 0) deck = shuffled(all, random);
    decks.set(token, deck);
    return deck.find((c) => fresh(c, now));
  };
  return {
    play(first, tokens, takes, play, now = Date.now()) {
      if (first !== null && fresh(first, now) && play(first)) {
        record(first, first, now);
        return first;
      }
      const used = (t: string): number => counts.get(t) ?? 0;
      const least = Math.min(...tokens.map(used));
      for (const token of shuffled(tokens, random)) {
        if (token === lastToken && tokens.length > 1) continue;
        const share = (used(token) + 1) / (total + 1);
        if (share > BACKCHANNEL_TIMING.maxTokenShare && used(token) > least) continue;
        const clip = draw(token, takes, now);
        if (clip !== undefined && play(clip)) {
          record(token, clip, now);
          return clip;
        }
      }
      return null;
    },
  };
}
