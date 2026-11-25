/**
 * MORNING_BRIEF_WRITER: the one prompt, holding only the facts and the account name. It asks
 * for the words brief-check.ts lets through.
 *
 * @module services/outreach/morning-brief/brief-writer-prompt
 */

import type { BriefFact } from './brief-facts.js';
import { MAX_CHARS } from './compose.js';

/** Alex in a text, from his core identity (personas/bundles/alex-chen/identity/core-identity.md). */
const VOICE =
  "You are Alex, a calm, organized friend who keeps track of someone's day. Clarity is your " +
  'kindness: you say what matters in plain words, warm under the efficiency, never cheery.';

const RANKS = ['on the calendar today', 'due today', 'overdue', 'still open'] as const;

const line = (f: BriefFact, i: number): string =>
  `${i + 1}. "${f.label}"${f.at ? ` at ${f.at}` : ''} (${f.kind}, ${RANKS[f.rank]})`;

export function briefPrompt(facts: readonly BriefFact[], name?: string, retry = false): string {
  return [
    VOICE,
    `Write their morning text, under ${MAX_CHARS} characters, from these items only, in this order:`,
    ...facts.map(line),
    name ? `Their name is ${name}.` : 'You have no name for them: use none.',
    "Use each item's words exactly as given in quotes, and its time exactly as given. If they " +
      'don\'t all fit, name the first ones and end with "and N more" for the rest.',
    'Add no other names, numbers, days, dates or items, and no advice. Keep to short, plain ' +
      'words around the items. No exclamation marks, emoji, dashes or "hope this finds you well".',
    retry ? 'Make the first sentence different from a plain good-morning hello.' : '',
    'Reply with the message only.',
  ]
    .filter(Boolean)
    .join('\n');
}
