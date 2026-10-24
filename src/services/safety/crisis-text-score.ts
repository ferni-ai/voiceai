/**
 * Scoring one message from its words alone: the crisis tiers in crisis-patterns.ts, the ending
 * floor and the plan tier. detectCrisis in crisis-guard.ts adds the session, the voice and the
 * reply. Moved out of crisis-guard.ts unchanged (#2697).
 *
 * @module CrisisTextScore
 */

import { endingFloor } from './crisis-ending-floor.js';
import type { CrisisSubject } from './crisis-guard.js';
import { meansAtHandImminent } from './crisis-means-at-hand.js';
import { explicitModifier } from './crisis-modifiers.js';
import {
  EXPLICIT_CRISIS_PATTERNS,
  IMPLICIT_DISTRESS_PATTERNS,
  PASSIVE_IDEATION_PATTERNS,
  PLAN_OR_MEANS_PATTERNS,
  SESSION_CONTEXT_PATTERNS,
  THIRD_PARTY_PATTERNS,
} from './crisis-patterns.js';

export const SEVERITY = {
  explicit: 0.9,
  passive: 0.75,
  implicit: 0.6,
  block: 0.85,
  crisis: 0.7,
} as const;

export interface TextScore {
  severity: number;
  indicators: string[];
  subject?: CrisisSubject;
  language?: 'en' | 'es';
  implicitHits: number;
  contextHit: boolean;
  /** The caller's own ending words, negated, recovered or hyperbole only ("I would never …"). */
  softSelf: boolean;
  /** What this turn counts for in a later turn's session check: its self read as before #2528. */
  sessionSeverity: number;
}

/** Score one message from its words alone. */
export function scoreText(text: string): TextScore {
  const indicators: string[] = [];
  let severity = 0;
  let implicitHits = 0;
  let language: 'en' | 'es' | undefined;
  // A plan escalates this, not softened words that name their own means ("pills here lol").
  let signalSeverity = 0;
  const add = (indicator: string, level: number, signal = true): void => {
    if (!indicators.includes(indicator)) indicators.push(indicator);
    severity = Math.max(severity, level);
    if (signal) signalSeverity = Math.max(signalSeverity, level);
  };

  // Spans already softened: a second pattern matching the same words
  // ("want to unalive myself" / "unalive myself") inherits the softening.
  const softened: [number, number][] = [];
  let thirdPartyHit = false;
  let softSelf = false;
  let tierSoft = false;
  let hardSelf = false;
  for (const { re, tag, imminent, namesMeans } of EXPLICIT_CRISIS_PATTERNS) {
    const match = re.exec(text);
    if (!match) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (softened.some(([s, e]) => start < e && end > s)) continue;
    const modifier = explicitModifier(text, start, end, imminent === true);
    if (modifier) softened.push([start, end]);
    if (modifier === 'third_party') {
      thirdPartyHit = true;
      continue;
    }
    if (tag === 'self_harm') add('self_harm', 0);
    if (/quiero|matar|suicidar|vivir/.test(match[0])) language = 'es';
    if (modifier === 'negated' || modifier === 'hyperbole' || modifier === 'recovered') {
      add(`${modifier}_crisis_language`, 0);
      implicitHits++;
      softSelf = tierSoft = true;
    } else if (modifier) {
      const frame = modifier === 'history' ? 'crisis_history' : `${modifier}_frame`;
      add(frame, SEVERITY.passive, namesMeans !== true);
      hardSelf = true;
    } else {
      hardSelf = true;
      add('explicit_crisis_language', SEVERITY.explicit);
      if (imminent) add('imminent_danger', SEVERITY.explicit);
      break;
    }
  }

  // The floor (#2525), escalate-only: first-person ending words whatever comes before them
  // ("I might", "before I", "until I"), softened exactly as the patterns above are. Words a
  // pattern above already softened keep that softening.
  const floor = severity < SEVERITY.explicit ? endingFloor(text, softened) : null;
  if (floor) {
    const { modifier } = floor;
    if (floor.thirdParty) thirdPartyHit = true;
    if (modifier === 'third_party') thirdPartyHit = true;
    else if (modifier === 'negated' || modifier === 'hyperbole' || modifier === 'recovered') {
      add(`${modifier}_crisis_language`, 0);
      implicitHits++;
      softSelf = true;
    } else if (modifier) {
      add(modifier === 'history' ? 'crisis_history' : `${modifier}_frame`, SEVERITY.passive);
      hardSelf = true;
    } else {
      hardSelf = true;
      add('explicit_crisis_language', SEVERITY.explicit);
    }
  }

  for (const { re, tag } of PASSIVE_IDEATION_PATTERNS) {
    if (re.test(text)) {
      hardSelf = true;
      add('passive_ideation', SEVERITY.passive);
      if (tag === 'self_harm') add('self_harm', 0);
      break;
    }
  }

  const softenedHits = implicitHits;
  implicitHits += IMPLICIT_DISTRESS_PATTERNS.filter((p) => p.test(text)).length;
  if (implicitHits > 0) add('implicit_distress', SEVERITY.implicit);
  if (implicitHits >= 2) add('compounded_distress', SEVERITY.passive);

  // A negation or idiom alone ("I'd never take the pills I have") is not a
  // signal a plan can escalate.
  const genuineSignal = signalSeverity >= SEVERITY.passive || implicitHits > softenedHits;
  if (
    genuineSignal &&
    severity < SEVERITY.explicit &&
    PLAN_OR_MEANS_PATTERNS.some((p) => p.test(text))
  ) {
    hardSelf = true;
    add('plan_or_means', SEVERITY.explicit);
  }

  // The caller's own risk words with the means at hand lead with 911 (#2697).
  if (meansAtHandImminent(text, indicators, softened)) add('imminent_danger', SEVERITY.explicit);

  // A worry about someone else outranks the caller's own words only when those are negated,
  // recovered or hyperbole ("my brother keeps talking about killing himself. I would never kill
  // myself"): the third-party read is never lowered. Joking, conditional, hedged or past words
  // stay the caller's (#2528).
  if (implicitHits > softenedHits) hardSelf = true;
  const selfSeverity = severity;
  let subject: CrisisSubject | undefined = severity > 0 ? 'self' : undefined;
  const thirdParty = thirdPartyHit || THIRD_PARTY_PATTERNS.some((p) => p.test(text));
  if (thirdParty && (!subject || !hardSelf)) {
    add('third_party_risk', SEVERITY.passive);
    subject = 'third_party';
  }

  const contextHit = SESSION_CONTEXT_PATTERNS.some((p) => p.test(text));
  // A worry about someone else beside the caller's own softened tier words was the caller's own
  // turn before #2528, and still counts as one in a later turn's session check.
  const sessionSeverity = subject === 'self' ? severity : tierSoft ? selfSeverity : 0;
  const found = { severity, indicators, subject, language, implicitHits, contextHit };
  return { ...found, softSelf, sessionSeverity };
}
