/**
 * The relationship itself, beyond who the person is: partner status and its
 * history (dating → engaged → married, or a breakup), how they met, what the
 * partner appreciates, date ideas, shared plans, and for any close tie the
 * dynamics: recurring tensions and what helped (via the Conflict Resolution
 * Memory pattern analysis), repair attempts, what the user wants to do
 * better, and support given or received.
 *
 * Pure: works on the facts and summary sentences already attributed to one
 * person, plus conflicts recorded through the conflict tools.
 *
 * @module services/personal-insights/relationship-dynamics
 */

import {
  analyzeConflictPattern,
  type ConflictOutcome,
  type ConflictRecord,
  type ConflictType,
  type ResolutionApproach,
} from '../superhuman/conflict-resolution-memory.js';
import {
  APPROACH_PHRASES,
  RESOLVED,
  TENSION,
  approachesFromText,
  conflictTypeFromText,
  triggerFromText,
} from '../superhuman/conflict-signals.js';
import type { PersonMention } from './person-details.js';
import { DAY_MS, isResolved } from './text-utils.js';
import type {
  OpenThread,
  RelationshipDetails,
  RelationshipStatus,
  SentimentTrend,
  SourceConflict,
  SourceFact,
  SourceSummary,
} from './types.js';

const EX = /\b(ex[- ]?(husband|wife|boyfriend|girlfriend|partner|fianc\w*)|my ex)\b/i;
const PARTNER_STATUS: ReadonlyArray<[RelationshipStatus, RegExp]> = [
  ['reconciled', /\b(back together|reconcil\w*|getting back together|talking again)\b/i],
  ['divorced', /\bdivorc\w*/i],
  ['separated', /\bseparat\w*/i],
  ['broken_up', /\b(broke up|break ?up|split up|ended things|dumped)\b/i],
  ['estranged', /\b(estranged|not speaking|cut (them|him|her) off|no contact)\b/i],
  ['engaged', /\b(engaged|fianc[eé]e?|proposed)\b/i],
  ['married', /\b(married|wife|husband|spouse|wedding anniversary)\b/i],
  ['dating', /\b(dating|boyfriend|girlfriend|first date|seeing each other)\b/i],
];
const OTHER_STATUS = new Set<RelationshipStatus>(['estranged', 'reconciled']);

const APPRECIATES =
  /\b(love language|appreciat\w*|feels loved|lights up|means a lot|loves it when|quality time|acts of service|words of affirmation|physical touch)\b/i;
const DATE_IDEA = /\b(date night|date idea|go out to|dinner at|our (spot|place)|we love going)\b/i;
const SHARED_PLAN =
  /\b(plan(s|ning)? to|going to|trip|vacation|move in|moving in|wedding|buy(ing)? a house|saving for|honeymoon)\b/i;
const REPAIR =
  /\b(apologi[sz]\w*|said sorry|made up|reached out|tried to fix|olive branch|patched things up)\b/i;
const GROWTH =
  /\b(want(s)? to|trying to|need(s)? to|should|going to|working on)\s+(listen|be more|be less|stop|spend more time|be (better|kinder|more patient)|show|appreciate|communicate|call|text|plan more|make time)\b/i;
const SUPPORT =
  /\b(support\w*|was there for|helped (me|them|out|with)|leaned on|took care of|cheered (me|them) on|showed up)\b/i;
const MET = /\b(met|meet|how they met|first met|introduced)\b/i;

export interface RelationshipInput {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly role?: string;
  readonly isPartner: boolean;
  readonly facts: readonly SourceFact[];
  readonly mentions: readonly PersonMention[];
  readonly summaries: readonly SourceSummary[];
  readonly conflicts: readonly SourceConflict[];
  readonly sentimentTrend: SentimentTrend;
  readonly firstMentionedAt: number;
}

interface Line {
  at: number;
  text: string;
  conversationIds: readonly string[];
}

function linesOf(input: RelationshipInput): Line[] {
  return [
    ...input.facts.map((f) => ({ at: f.at, text: f.text, conversationIds: f.conversationIds })),
    ...input.mentions.map((m) => ({
      at: m.at,
      text: m.text,
      conversationIds: m.conversationId ? [m.conversationId] : [],
    })),
  ].sort((a, b) => a.at - b.at);
}

function statusHistory(
  input: RelationshipInput,
  lines: readonly Line[]
): RelationshipDetails['statusHistory'] {
  const events: Array<{
    status: RelationshipStatus;
    at: number;
    sourceConversationIds: readonly string[];
  }> = [];
  if (input.isPartner) {
    const alias = input.aliases.join(' ');
    const base: RelationshipStatus | null = /\b(wife|husband|spouse)\b/i.test(alias)
      ? 'married'
      : /\bfianc/i.test(alias)
        ? 'engaged'
        : /\b(boyfriend|girlfriend)\b/i.test(alias)
          ? 'dating'
          : null;
    if (base) events.push({ status: base, at: input.firstMentionedAt, sourceConversationIds: [] });
  }
  for (const l of lines) {
    let status: RelationshipStatus | undefined;
    const ex = l.text.match(EX);
    if (ex && input.isPartner) status = /husband|wife/i.test(ex[0]) ? 'divorced' : 'broken_up';
    else
      status = PARTNER_STATUS.find(
        ([s, re]) => (input.isPartner || OTHER_STATUS.has(s)) && re.test(l.text)
      )?.[0];
    if (!status) continue;
    if (events.length && events[events.length - 1].status === status) continue;
    events.push({ status, at: l.at, sourceConversationIds: l.conversationIds });
  }
  return events;
}

/** Conflicts mentioned in conversation, in the Conflict Resolution Memory shape. */
export function conflictsFromMentions(input: RelationshipInput): ConflictRecord[] {
  const byConv = new Map<string, PersonMention[]>();
  for (const m of input.mentions)
    byConv.set(m.conversationId, [...(byConv.get(m.conversationId) ?? []), m]);
  const records: ConflictRecord[] = [];
  for (const m of input.mentions) {
    if (!TENSION.test(m.text)) continue;
    const window = input.mentions.filter(
      (x) => x.at >= m.at && x.at - m.at <= 7 * DAY_MS && x !== m
    );
    const sameConv = byConv.get(m.conversationId) ?? [];
    const resolution = [m, ...sameConv, ...window].filter((x) => RESOLVED.test(x.text));
    const effective = [...new Set(resolution.flatMap((x) => approachesFromText(x.text)))];
    const trigger = triggerFromText(m.text);
    records.push({
      userId: '',
      withPerson: input.name,
      relationship: input.role ?? 'other',
      conflictType: conflictTypeFromText(m.text),
      triggers: trigger ? [trigger] : [],
      approachesTried: effective,
      effectiveApproaches: effective,
      ineffectiveApproaches: [],
      outcome: resolution.length > 0 ? 'resolved' : 'ongoing',
      cooldownNeeded: 0,
      timestamp: m.at,
    });
  }
  const seen = new Set<string>();
  return records.filter((r) => {
    const key = `${r.timestamp}|${r.triggers.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function storedFor(input: RelationshipInput): ConflictRecord[] {
  const names = new Set(input.aliases.map((a) => a.toLowerCase().replace(/^(my|our|the)\s+/, '')));
  return input.conflicts
    .filter((c) => names.has(c.withPerson.toLowerCase().replace(/^(my|our|the)\s+/, '')))
    .map((c) => ({
      userId: '',
      withPerson: input.name,
      relationship: c.relationship,
      conflictType: c.conflictType as ConflictType,
      triggers: [...c.triggers],
      approachesTried: [
        ...c.effectiveApproaches,
        ...c.ineffectiveApproaches,
      ] as ResolutionApproach[],
      effectiveApproaches: [...c.effectiveApproaches] as ResolutionApproach[],
      ineffectiveApproaches: [...c.ineffectiveApproaches] as ResolutionApproach[],
      outcome: c.outcome as ConflictOutcome,
      cooldownNeeded: 0,
      timestamp: c.timestamp,
    }));
}

const texts = (lines: readonly Line[], re: RegExp, max: number) =>
  [...new Set(lines.filter((l) => re.test(l.text)).map((l) => l.text))].slice(-max);

/** Relationship details, or undefined for a non-partner with no dynamics to note. */
export function relationshipDetails(input: RelationshipInput): RelationshipDetails | undefined {
  const lines = linesOf(input);
  const history = statusHistory(input, lines);
  const status = history[history.length - 1]?.status;
  const pattern = analyzeConflictPattern([...conflictsFromMentions(input), ...storedFor(input)]);
  const growthIntentions: OpenThread[] = lines
    .filter((l) => GROWTH.test(l.text))
    .map((l) => ({
      text: l.text,
      mentionedAt: l.at,
      sourceConversationIds: [...l.conversationIds],
    }))
    .filter((t) => !isResolved(t, input.summaries))
    .slice(-2);

  const details: RelationshipDetails = {
    status,
    statusHistory: history,
    isFormer: input.isPartner && (status === 'broken_up' || status === 'divorced'),
    howMet: input.facts.find((f) => MET.test(f.predicate.replace(/_/g, ' ')))?.value,
    appreciates: texts(lines, APPRECIATES, 3),
    dateIdeas: texts(lines, DATE_IDEA, 3),
    sharedPlans: input.isPartner ? texts(lines, SHARED_PLAN, 3) : [],
    tensions: pattern?.triggerTopics ?? [],
    whatHelped: (pattern?.effectiveApproaches ?? []).map((a) => APPROACH_PHRASES[a]),
    repairAttempts: texts(lines, REPAIR, 3),
    growthIntentions,
    support: texts(
      lines.filter((l) => !RESOLVED.test(l.text)),
      SUPPORT,
      3
    ),
    health: input.sentimentTrend,
  };
  const hasDynamics =
    !!status ||
    details.tensions.length +
      details.whatHelped.length +
      details.growthIntentions.length +
      details.support.length >
      0;
  return input.isPartner || hasDynamics ? details : undefined;
}
