/**
 * Vocal bursts: the small sounds a friend makes before the words ("Hmm,",
 * "Ugh,", "Aww,", a nervous "Heh,"), the voice's version of an emoji.
 * VOCAL_BURSTS=on, off by default.
 *
 * Cartesia has one nonverbal tag, [laughter]. Every other tag tried
 * ([sigh], [breath], [gasp], [yawn], [chuckle], [cough], [hmm], [tsk], ...) is
 * dropped silently: alone, each returns no audio (spike on sonic-3.6, voice
 * fdeb5d75, 2026-10-11). Written as words, most bursts render. Some spellings
 * come out wrong: "*yawn*" and "*sigh*" are read aloud as the words, "Awww"
 * as "Oh, W", "Tsk tsk" as "tuck tuck". So the inventory says how each
 * expression is written, and a misrendering spelling the model writes anyway
 * is rewritten before TTS. The written forms are placeholders until the blind
 * round r2 ("Which one sounds like a real person reacting?") is rated.
 *
 * When: the turn reminder may invite one burst at the start of the reply
 * (burstLine), never on a careful turn (venting, bad news, tender, support
 * held after hard news) or a crisis-guided one, and at most one in any
 * BURST_EVERY replies. A burst at the start of a reply that wasn't invited is
 * dropped (the opener gate, opener-gate.ts). Every burst actually spoken is
 * counted from the transcription stream, which only runs for a reply that
 * plays, so a dropped preemptive reply never counts.
 *
 * @module agents/personas/vocal-bursts
 */

import { ReadableStream } from 'node:stream/web';

import { leverModes } from '../../speech/tts-gateway/director/gate.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { TurnSignals } from './turn-extras.js';

const log = createLogger({ module: 'VocalBursts' });

type Env = Record<string, string | undefined>;

export function vocalBurstsEnabled(env: Env = process.env): boolean {
  return env.VOCAL_BURSTS === 'on';
}

/** At most one burst in any this many consecutive replies. */
export const BURST_EVERY = 3;
/** How often an eligible turn is invited to open with one (the model still judges whether one fits). */
export const BURST_OFFER_P = 0.4;

export interface Burst {
  id: string;
  emoji: string;
  /** How the model writes it: the spelling that rendered as the sound. */
  written: string;
  /** When a friend makes it, for the invitation. */
  fits: string;
  /** Spellings kept as written (regex source, whole word, case-insensitive). */
  keep: string;
  /** Spellings that misrender, rewritten to `written` (regex source). */
  fix?: string;
}

/** A stage direction for `word`: [sighs], *sighs*. */
const cue = (word: string): string => String.raw`\[${word}\]|\*${word}\*`;

/** Placeholders from the spike's transcripts (ink-whisper on each render), until r2 is rated. */
export const BURSTS: readonly Burst[] = [
  ['think', '🤔', 'Hmm,', 'thinking it over', 'h+m+', cue('hmm+')],
  ['surprise', '😮', 'Oh!', 'surprised', 'oh+|whoa+', cue('gasps?')],
  ['annoyed', '🙄', 'Ugh,', 'annoyed for them', 'ugh+|pf+t+|psh+', cue('groans?')],
  ['wince', '😬', 'Eek,', 'wincing at an awkward spot', 'eek+|oof+|yikes', cue('winces?')],
  ['tender', '🥲', 'Aww,', 'touched by something sweet', 'aww?', 'aw{3,}'],
  ['nervous', '😅', 'Heh,', 'caught out, a little sheepish', 'heh'],
  ['chuckle', '🙂', 'Ha,', 'mildly amused', 'ha(?:ha)*|hah', cue('chuckles?')],
  ['laugh', '😂', '[laughter]', 'something genuinely funny', String.raw`\[laughter\]`],
  ['sigh', '😮‍💨', 'Haah,', 'resigned or relieved', 'haa+h|phew', `${cue('sighs?')}|\\(sighs?\\)`],
  ['yawn', '😴', 'Aaahhh,', 'tired, late in a long day', 'a{3,}h+', cue('yawns?')],
  ['tsk', '😤', 'Tch,', 'that was unfair to them', 'tch|tut', `tsk(?:,? tsk)*|${cue('tsk')}`],
].map(([id, emoji, written, fits, keep, fix]) => ({ id, emoji, written, fits, keep, fix }));

const LEAD = String.raw`^((?:\s|<[^>]*>)*)`;
const MATCHERS = BURSTS.map((b) => ({
  burst: b,
  re: new RegExp(`${LEAD}(?:(${b.keep})|(${b.fix ?? '(?!)'}))(?![A-Za-z'])[\\s,.!?…-]*`, 'i'),
}));

export interface LeadingBurst {
  burst: Burst;
  /** Markup before it (an <emotion/> tag), kept. */
  lead: string;
  /** The burst as written, with the punctuation and space after it. */
  text: string;
  /** Written in a spelling that misrenders. */
  misrendered: boolean;
}

/** The burst a reply opens with, if any. */
export function leadingBurst(text: string): LeadingBurst | null {
  for (const { burst, re } of MATCHERS) {
    const m = re.exec(text);
    if (m) return { burst, lead: m[1], text: m[0].slice(m[1].length), misrendered: !m[2] };
  }
  return null;
}

/**
 * The reply with its opening burst in the spelling that renders. A sigh cue
 * stays when the speech director renders sighs itself (SPEECH_DIRECTOR_NONVERBAL=live).
 */
export function withRenderedBurst(
  text: string,
  found: LeadingBurst,
  env: Env = process.env
): string {
  if (!found.misrendered) return text;
  if (found.burst.id === 'sigh' && leverModes(env).nonverbal === 'live') return text;
  const rest = text.slice(found.lead.length + found.text.length);
  return `${found.lead}${found.burst.written} ${rest}`;
}

/** The reply without its opening burst; unchanged when nothing would be left to say. */
export function withoutBurst(text: string, found: LeadingBurst): string {
  const rest = text.slice(found.lead.length + found.text.length);
  return /[A-Za-z]/.test(rest.charAt(0)) ? found.lead + rest : text;
}

const INVITE =
  'This reply may open with one small sound a friend would make, only if one truly fits what they just said (this once it overrides the rule against reaction words): ' +
  BURSTS.map((b) => `"${b.written}" (${b.fits})`).join(', ') +
  '. Write it exactly as shown, first, then go on; if none fits, use none.';

interface BurstState {
  /** Replies played since the last burst. */
  sinceBurst: number;
  /** The current request invited one. */
  offered: boolean;
}

const states = new WeakMap<object, BurstState>();

function stateOf(session: object): BurstState {
  let s = states.get(session);
  if (!s) {
    s = { sinceBurst: BURST_EVERY, offered: false };
    states.set(session, s);
  }
  return s;
}

/**
 * The invitation for this request, or '' (and no invitation recorded).
 * Draws nothing from `rng` when the flag is off or the turn can't have one.
 */
export function burstLine(
  session: object,
  signals: TurnSignals,
  rng: () => number,
  env: Env = process.env
): string {
  if (!vocalBurstsEnabled(env)) return '';
  const s = stateOf(session);
  s.offered = false;
  if (signals.careful || signals.supportFirst || signals.move === 'lookup') return '';
  if (s.sinceBurst < BURST_EVERY - 1) return '';
  if (rng() >= BURST_OFFER_P) return '';
  s.offered = true;
  return INVITE;
}

/** Forget an invitation: a new request is being built. */
export function clearBurstOffer(session: object): void {
  const s = states.get(session);
  if (s) s.offered = false;
}

/**
 * Whether the reply about to be generated may open with a burst: invited by
 * this request and not a crisis-guided reply. Undefined with the flag off, so
 * the opener gate behaves exactly as before.
 */
export function burstAllowed(
  session: object,
  guided: boolean,
  env: Env = process.env
): boolean | undefined {
  if (!vocalBurstsEnabled(env)) return undefined;
  return !guided && (states.get(session)?.offered ?? false);
}

/**
 * Counts one played reply, and the burst it opened with. `raw` is the reply's
 * text before the caption filter (which drops [laughter]).
 */
export function noteSpokenReply(
  session: object,
  raw: string,
  onBurst?: (burst: Burst, spoken: string) => void
): Burst | null {
  const s = stateOf(session);
  const found = leadingBurst(raw);
  if (!found) {
    s.sinceBurst++;
    return null;
  }
  s.sinceBurst = 0;
  log.info({ burst: found.burst.id }, 'VOCAL_BURST');
  onBurst?.(found.burst, found.text.trim());
  return found.burst;
}

/** Characters of a played reply to read for its opening burst. */
const HEAD = 40;

/** The transcription text, passed through; the reply's opening is noted once (noteSpokenReply). */
export function tapSpokenBursts<T extends string | { text: string }>(
  text: ReadableStream<T> | AsyncIterable<T>,
  session: object,
  onBurst?: (burst: Burst, spoken: string) => void,
  env: Env = process.env
): ReadableStream<T> | AsyncIterable<T> {
  if (!vocalBurstsEnabled(env)) return text;
  return new ReadableStream<T>({
    async start(controller) {
      let head = '';
      let noted = false;
      try {
        for await (const chunk of text as AsyncIterable<T>) {
          if (!noted) {
            head += typeof chunk === 'string' ? chunk : chunk.text;
            if (head.length >= HEAD) {
              noted = true;
              noteSpokenReply(session, head, onBurst);
            }
          }
          controller.enqueue(chunk);
        }
        if (!noted && head) noteSpokenReply(session, head, onBurst);
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
