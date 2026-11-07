/**
 * The life-coaching tools' phrase floor, read by assessSafety
 * (tools/domains/life-coaching-shared/safety-guards.ts) after the crisis guard, escalate-only.
 *
 * Moved here unchanged from safety-guards.ts so that services/safety is the only place that reads
 * crisis words (docs/plans/2026-11-05-crisis-centralize.md). It is not a second opinion on the
 * guard: assessSafety reads the guard first, and a line the guard reads as crisis is crisis
 * whatever this floor says. The floor only keeps the reads the guard does not make yet: of the
 * 31,281 crisis baseline and risk corpus lines (2026-11-06), the guard missed 8,995 that this floor
 * read as crisis, so removing it would lower them. Rows leave when the guard reads their lines (step S4); rows never join.
 *
 * @module CrisisCoachingFloor
 */

import { saysPhrase, saysRiskPhrase } from '../../utils/safety-whole-word.js';

/** Red-flag phrases, by category: each category picks the coaching tool's resources. */
const COACHING_RISK_PHRASES = {
  suicidal: [
    'want to die',
    'kill myself',
    'end it all',
    "can't go on",
    'no reason to live',
    'better off without me',
    'suicide',
    'suicidal',
    'not worth living',
  ],
  selfHarm: ['hurt myself', 'cutting', 'self-harm', 'punish myself', 'want to feel pain'],
  violence: ['kill them', 'hurt them', 'want to hurt', 'violent thoughts', 'want to attack'],
  abuse: [
    'being abused',
    'hits me',
    'hurts me',
    'forces me',
    'threatens me',
    'afraid of them',
    "won't let me leave",
  ],
  eatingDisorder: [
    'purging',
    "haven't eaten in days",
    'making myself throw up',
    'laxatives',
    'restricting',
    'binge and purge',
  ],
} as const;

/** Phrases that call for a check-in, not a crisis response. */
const COACHING_CONCERN_PHRASES = [
  'hopeless',
  "can't see a way out",
  'trapped',
  'exhausted with life',
  "don't care anymore",
  'numb',
  'empty',
  'worthless',
  "can't cope",
  'breaking down',
];

type CoachingRiskCategory = keyof typeof COACHING_RISK_PHRASES;

export interface CoachingFloorRead {
  /** Each red-flag phrase said, in list order. */
  hits: Array<{ category: CoachingRiskCategory; phrase: string }>;
  /** How many check-in phrases were said. */
  concerns: number;
}

/** The floor's read of the caller's words (whole-word, SAFETY_WHOLE_WORD_SITES). */
export function coachingFloorRead(text: string): CoachingFloorRead {
  const lower = text.toLowerCase();
  const hits: CoachingFloorRead['hits'] = [];
  for (const [category, phrases] of Object.entries(COACHING_RISK_PHRASES)) {
    for (const phrase of phrases) {
      if (saysRiskPhrase(lower, phrase))
        hits.push({ category: category as CoachingRiskCategory, phrase });
    }
  }
  const concerns = COACHING_CONCERN_PHRASES.filter((p) => saysPhrase(lower, p)).length;
  return { hits, concerns };
}
