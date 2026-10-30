/**
 * Who on the team helps with what, on each request, while TEAM_BY_NEED is on.
 *
 * With every teammate open from the first call (services/social/team-unlocks.ts),
 * nobody is introduced because a caller earned them. A teammate comes up when the
 * conversation calls for one: "want Alex for that talk with your manager?". So each
 * request carries one line (turn-request.ts) naming the teammates with what each
 * helps with, and the rule: offer one only when the caller's need clearly matches,
 * at most once a call each, ask before transferring, never push. When the caller's
 * words clearly match a teammate who hasn't come up yet this call, the line says so.
 *
 * The investing legends are open too, but are listed only when the caller is talking
 * about investing; elsewhere they're reached only when asked for.
 *
 * One line, not a tool per teammate: tool count is request cost
 * (docs/perf/llm-request-cost.md). The "when" phrases follow each persona bundle's
 * team.role_description (src/personas/bundles/{id}/persona.manifest.json).
 *
 * @module tools/handoff/team-by-need-note
 */

import { isTeamByNeedEnabled } from '../../config/team-by-need-flag.js';
import { ALIAS_TO_CANONICAL } from '../../personas/persona-ids.js';
import { chiefOfStaffWhen } from './chief-of-staff-note.js';

interface Teammate {
  readonly id: string;
  readonly name: string;
  /** What they help with, a few words. */
  readonly when: string;
  /** Words that clearly call for them. Whole words and phrases only: "meaning" alone
   * would match "I've been meaning to call", which needs no sage. */
  readonly need?: RegExp;
}

export const BY_NEED_TEAMMATES: readonly Teammate[] = [
  {
    id: 'maya-santos',
    name: 'Maya',
    when: 'habits and routines that stick',
    need: /\b(habits?|routines?|work ?outs?|exercis(e|ing)|sleep schedule|budget(s|ing)?|stick (to|with) (it|a|my))\b/,
  },
  {
    id: 'peter-john',
    name: 'Peter',
    when: 'patterns in their life, time and spending',
    need: /\b(patterns?|trends?|where (does|did) (my|all my) (money|time) go|my (spending|data|numbers))\b/,
  },
  {
    id: 'alex-chen',
    name: 'Alex',
    when: 'hard conversations, email, texts and calendar',
    need: /\b((hard|difficult|tough|awkward) (talk|conversation|chat)s?|(my|the) (manager|boss|coworker|co-worker)|confront\w*|set(ting)? (a )?boundar(y|ies)|(write|draft|send) (an? |the )?(email|text|message)|my calendar|schedule (a |the )?(meeting|call))\b/,
  },
  {
    id: 'jordan-taylor',
    name: 'Jordan',
    when: 'trips, moves and big life plans',
    need: /\b(vacation|wedding|bucket list|big move|moving (to|across|out)|plan(ning)? (a |my |our |the )?(trip|vacation|wedding|move|year|retirement|party)|life plan)\b/,
  },
  {
    id: 'nayan-patel',
    name: 'Nayan',
    when: 'meaning, purpose and the long view',
    need: /\b(meaning (of|in) (my |their )?life|(my|life's|a) purpose|sense of purpose|what'?s the point|meditat(e|ion|ing)|inner peace|bigger picture)\b/,
  },
];

const LEGENDS: readonly Teammate[] = [
  { id: 'john-bogle', name: 'Henry Caldwell', when: 'index funds and staying the course' },
  { id: 'peter-lynch', name: 'Tom Brannigan', when: 'picking companies' },
  { id: 'joel-dickson', name: 'Nate Holloway', when: 'money and life decisions' },
];

const INVESTING =
  /\b(invest(ing|ment|ments|or)?|stocks?|stock market|index funds?|mutual funds?|etfs?|portfolio|401 ?k|roth|brokerage)\b/;

const canonical = (id: string): string => {
  const key = id.trim().toLowerCase();
  return Object.hasOwn(ALIAS_TO_CANONICAL, key) ? ALIAS_TO_CANONICAL[key] : key;
};

/**
 * The caller's words are about the speaker's own beat: Maya asked about a habit, Peter about
 * their spending, a legend about investing (turn-substance.ts). False for Ferni, who has none.
 */
export function onOwnBeat(speaker: string, callerWords: string): boolean {
  const self = canonical(speaker);
  const words = callerWords.toLowerCase();
  if (LEGENDS.some((m) => m.id === self)) return INVESTING.test(words);
  return BY_NEED_TEAMMATES.find((m) => m.id === self)?.need?.test(words) ?? false;
}

/** Has the agent already named `name` on this call? Then it's been offered. */
const alreadyOffered = (name: string, agentWords: string): boolean =>
  new RegExp(`\\b${name}\\b`, 'i').test(agentWords);

/**
 * The team line for one request; '' while TEAM_BY_NEED is off.
 *
 * @param speaker - the persona answering (it isn't offered to itself)
 * @param callerWords - what the caller said since the agent last spoke
 * @param agentWords - what the agents have said on this call, to offer each teammate once
 */
export function teamByNeedNote(speaker: string, callerWords: string, agentWords = ''): string {
  if (!isTeamByNeedEnabled()) return '';
  const self = canonical(speaker);
  const words = callerWords.toLowerCase();
  // ALEX_CHIEF_OF_STAFF=on: Alex is named for planning too (chief-of-staff-note.ts)
  const team = BY_NEED_TEAMMATES.filter((m) => m.id !== self).map((m) => ({
    ...m,
    when: chiefOfStaffWhen(m.id, m.when),
  }));
  const investing = INVESTING.test(words);
  const legends = investing ? LEGENDS.filter((m) => m.id !== self) : [];

  const parts = [
    `Teammates you can bring in: ${team.map((m) => `${m.name} for ${m.when}`).join('; ')}.`,
    legends.length > 0
      ? `For investing, the legends can join too: ${legends.map((m) => `${m.name} for ${m.when}`).join('; ')}.`
      : '',
    'Offer one only when what the caller needs clearly matches, at most once a call each; ask before transferring, and never push.',
  ];
  const fits = team.find((m) => m.need?.test(words) && !alreadyOffered(m.name, agentWords));
  if (fits) {
    parts.push(
      `What they just said fits ${fits.name}: if it helps, ask whether they'd like ${fits.name} to join.`
    );
  }
  return parts.filter(Boolean).join(' ');
}

/** What the agents have said on this call, from the request's messages. */
export function agentWordsIn(
  items: ReadonlyArray<{ type: string; role?: string; textContent?: string }>
): string {
  return items
    .filter((item) => item.type === 'message' && item.role === 'assistant')
    .map((item) => item.textContent ?? '')
    .join(' ');
}
