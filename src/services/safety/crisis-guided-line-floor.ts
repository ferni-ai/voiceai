/**
 * CRISIS_GUIDED_LINE_FLOOR (off by default): a reply the voice gate guided for a crisis read
 * always names the line to call.
 *
 * The gate asks the model to give 988 as the last thing it reads (crisis-gate.ts), but nothing
 * checks the reply did. With the flag on, code reads the model's whole reply and says what it
 * left out after it, in the words main's own scripts use:
 * - the caller's own crisis: 988 (TALK_TO_988, or TALK_TO_988_ES in Spanish);
 * - the caller's own imminent read: 911, then 988, each only when missing;
 * - someone the caller is worried about: the for-them 988 line (FOR_THEM_988);
 * - an emergency for someone else: 911 for them, and no 988 (owner, 2026-11-02).
 *
 * A guide carries a `line` only where a crisis read built it (decisionFor, and the stepped-down
 * read of an eased imminent turn); a soft check-in, a grounded light touch, an after-check, an
 * agreement or adjudicator ease, a transfer request and the timeout check-in have none and pass
 * untouched. A disclosure guide has one only when the caller may be at risk themselves; its own
 * care (the abuse line, Childhelp) is not 988's to replace. Spanish for someone else has none:
 * main has no Spanish for-them wording yet.
 *
 * Spanish is a Spanish pattern read, or Spanish crisis words in the caller's last line (the
 * timeout check-in's reader), so a classifier-only read of a Spanish line is answered in Spanish.
 * Presence is read by names988 / names911 (crisis-line-speech.ts), every written form of each.
 *
 * Only adds, and fails closed: no reply gets the line alone, and a test that throws counts as
 * the line missing (withMissingEnding).
 *
 * @module CrisisGuidedLineFloor
 */

import type { ReadableStream } from 'node:stream/web';
import { flagOn, type Env } from '../../config/env-flag.js';
import { spanishReadersOn } from '../../utils/fold-spanish.js';
import { ABUSE_INDICATOR, MINOR_ABUSE_INDICATOR } from './abuse-disclosure.js';
import { call911ForThem } from './crisis-caller-check.js';
import {
  CALL_911_ES,
  FOR_THEM_988,
  LATE_911_LINE,
  TALK_TO_988,
  TALK_TO_988_ES,
} from './crisis-guard-replies.js';
import { withMissingEnding, type ReplyPart } from './crisis-grounded-screen.js';
import type { CrisisDetectionResult } from './crisis-guard.js';
import { names911, names988 } from './crisis-line-speech.js';
import { crisisWordsLanguage } from './crisis-timeout-checkin.js';

/** Whose line a crisis guide's reply must name, and how urgently. */
export interface GuideLine {
  who: 'self' | 'them';
  /** Self: an imminent read (911 too). Them: an emergency (911 for them, no 988). */
  urgent: boolean;
  lang: 'en' | 'es';
}

/** The disclosure reads that keep 988: the caller may be at risk themselves. */
const SELF_RISK = [`${ABUSE_INDICATOR}_self_harm`, `${MINOR_ABUSE_INDICATOR}_self_harm`];

/**
 * The line a crisis read's guide must name, or undefined for none. `disclosure`: the guide is a
 * disclosure's (disclosureGuidance), not the crisis guidance. `latest`: the caller's last line.
 * Only a Spanish pattern read sets `language`; a classifier-only read of a Spanish line has none,
 * so the caller's own words choose Spanish too, as the timeout check-in reads them.
 */
export function guideLineOf(
  crisis: Pick<CrisisDetectionResult, 'indicators' | 'subject' | 'language'>,
  disclosure = false,
  latest?: string
): GuideLine | undefined {
  const spanish = crisis.language === 'es' || (!!latest && crisisWordsLanguage(latest) === 'es');
  const lang = spanish ? 'es' : 'en';
  if (disclosure && !SELF_RISK.some((i) => crisis.indicators.includes(i))) return undefined;
  if (crisis.subject === 'third_party' && !disclosure) {
    const urgent = crisis.indicators.includes('third_party_emergency');
    // In Spanish, only the 911 for someone down, with CRISIS_SPANISH_READERS on (#4060).
    if (lang === 'es' && !(urgent && spanishReadersOn())) return undefined;
    return { who: 'them', urgent, lang };
  }
  return { who: 'self', urgent: crisis.indicators.includes('imminent_danger'), lang };
}

const SAY_988: ReplyPart = { present: names988, words: TALK_TO_988 };
const SAY_988_ES: ReplyPart = { present: names988, words: TALK_TO_988_ES };

/** What the reply must name for this line, in the order code says what is missing. */
function partsFor(line: GuideLine): readonly ReplyPart[] {
  if (line.who === 'them') {
    return line.urgent
      ? [{ present: names911, words: call911ForThem(line.lang) }]
      : [{ present: names988, words: FOR_THEM_988 }];
  }
  if (line.lang === 'es') {
    return line.urgent ? [{ present: names911, words: CALL_911_ES }, SAY_988_ES] : [SAY_988_ES];
  }
  return line.urgent ? [{ present: names911, words: LATE_911_LINE }, SAY_988] : [SAY_988];
}

/**
 * The guided reply with the line it left out said after it, when the flag is on and the guide
 * has a line; every other reply, the same stream untouched.
 */
export function withGuidedLine<T>(
  reply: ReadableStream<T> | null,
  decision: { line?: GuideLine },
  env: Env = process.env
): ReadableStream<T | string> | null {
  if (!decision.line || !flagOn('CRISIS_GUIDED_LINE_FLOOR', env)) return reply;
  return withMissingEnding(reply, partsFor(decision.line));
}
