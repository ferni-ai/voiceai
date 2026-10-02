/**
 * Conflict signals in plain language: map what the user said ("we took a
 * walk before talking", "we keep fighting about chores") onto the Conflict
 * Resolution Memory vocabulary (ConflictType, ResolutionApproach), so
 * conflicts mentioned in conversation feed the same pattern analysis as
 * conflicts recorded through the conflict tools.
 *
 * Pure: no I/O.
 *
 * @module services/superhuman/conflict-signals
 */

import type { ConflictType, ResolutionApproach } from './conflict-resolution-memory.js';

export const TENSION =
  /\b(fight|fights|fighting|fought|argu\w*|tension|tense|conflict|disagree\w*|upset with|mad at|angry at|frustrated with|clash\w*|snapped at|bicker\w*|cold shoulder|not speaking)\b/i;
export const RESOLVED =
  /\b(helped|worked|made up|resolved|better after|calmed|patched things up|cleared the air|talked it through|apologi[sz]ed)\b/i;

const APPROACHES: ReadonlyArray<[ResolutionApproach, RegExp]> = [
  [
    'take_a_break',
    /\b(walk|took a break|take a break|cool(ed)? (off|down)|space|stepp?(ed)? away|time apart)\b/i,
  ],
  ['sleep_on_it', /\b(slept on it|sleep on it|next morning|the next day)\b/i],
  ['write_it_out', /\b(wrote|writing it|journal\w*|a letter)\b/i],
  ['seek_to_understand', /\b(listen\w*|understand\w*|their side|perspective)\b/i],
  ['use_i_statements', /\b(i feel|i-statements?|i statements?)\b/i],
  ['apologize_first', /\b(apologi[sz]\w*|said sorry)\b/i],
  ['set_boundary', /\bboundar\w*/i],
  ['third_party', /\b(therap\w*|counsel\w*|mediat\w*|couples)\b/i],
  ['problem_solve', /\b(compromis\w*|figured out|a plan|solution|split the)\b/i],
  ['validate_first', /\b(validat\w*|acknowledg\w*)\b/i],
  ['find_common_ground', /\b(common ground|both want)\b/i],
  ['agree_to_disagree', /\bagree(d)? to disagree\b/i],
];

/** Human phrasing for each approach, for prompts and notes. */
export const APPROACH_PHRASES: Readonly<Record<ResolutionApproach, string>> = {
  take_a_break: 'taking a break (like a walk) before talking',
  sleep_on_it: 'sleeping on it',
  write_it_out: 'writing it out first',
  seek_to_understand: 'really listening to their side',
  use_i_statements: '"I feel" statements',
  apologize_first: 'apologizing first',
  set_boundary: 'setting a clear boundary',
  third_party: 'getting outside help (like a counselor)',
  problem_solve: 'working out a practical plan together',
  validate_first: 'acknowledging feelings first',
  find_common_ground: 'finding common ground',
  agree_to_disagree: 'agreeing to disagree',
};

export function approachesFromText(text: string): ResolutionApproach[] {
  return APPROACHES.filter(([, re]) => re.test(text)).map(([a]) => a);
}

export function conflictTypeFromText(text: string): ConflictType {
  const t = text.toLowerCase();
  if (/\b(again|keep|always|same (thing|fight|argument))\b/.test(t)) return 'recurring_issue';
  if (/\b(misunderst\w*|miscommunicat\w*|didn'?t mean)\b/.test(t)) return 'miscommunication';
  if (/\b(crossed a line|boundar\w*|disrespect\w*)\b/.test(t)) return 'boundary_violation';
  if (/\b(expect\w*|let (me|them) down|forgot)\b/.test(t)) return 'unmet_expectations';
  if (/\b(stress\w*|work|money|tired|exhausted)\b/.test(t)) return 'external_stress';
  if (/\b(values|beliefs|religion|politics)\b/.test(t)) return 'values_clash';
  return 'disagreement';
}

/** What the friction is about ("chores", "money"), from "about X" phrasing. */
export function triggerFromText(text: string): string | null {
  const m = text
    .toLowerCase()
    .match(
      /\b(?:about|over)\s+(?:the\s+|their\s+|our\s+|his\s+|her\s+)?([a-z][a-z' -]{2,30}?)(?:[.,;!?]|\s+(?:and|but|again|last|this|after|before|which|so)\b|$)/
    );
  return m ? m[1].trim() : null;
}
