/**
 * Person profiles: the durable people model built on top of resolution.
 * Each profile has its aliases, relationship to the user, key facts,
 * important dates, open threads, mention history and a sentiment trend,
 * all with provenance (`sourceConversationIds`, `sourceFactIds`).
 *
 * @module services/personal-insights/people-model
 */

import { detectDatesInFact, daysUntil } from './date-detection.js';
import { resolvePeople, type ResolvedPerson } from './people-resolution.js';
import { relationshipDetails } from './relationship-dynamics.js';
import {
  connectionDetails,
  isMemorial,
  looksLikePet,
  petDetails,
  type PersonMention,
} from './person-details.js';
import {
  DAY_MS,
  isResolved,
  mentions,
  roleGroup,
  roleIsUnique,
  roleLabel,
  roleWords,
  sentimentScore,
  stableId,
} from './text-utils.js';
import type {
  DetectedDate,
  OpenThread,
  PersonFact,
  PersonProfile,
  SentimentTrend,
  SourceFact,
  SourceSummary,
  UserMemorySources,
} from './types.js';

const OPEN_THREAD_WINDOW_DAYS = 45;
const MAX_FACTS_PER_PERSON = 8;
const MAX_THREADS_PER_PERSON = 3;

function summaryText(s: SourceSummary): string {
  return [...s.mainTopics, ...s.keyPoints, ...s.followUps].join('. ');
}

/** Terms that mean "this person" in free text: names, and role words when the role is theirs alone. */
export function personMatchTerms(
  person: Pick<PersonProfile, 'aliases' | 'relationship'>,
  roleIsShared: boolean
): string[] {
  const terms = new Set<string>();
  for (const a of person.aliases) {
    const stripped = a.replace(/^(my|our|the)\s+/i, '').trim();
    if (stripped.length >= 2) terms.add(stripped);
  }
  if (person.relationship && !roleIsShared)
    for (const w of roleWords(person.relationship)) terms.add(w);
  return [...terms];
}

export function textMentionsPerson(text: string, terms: readonly string[]): boolean {
  return terms.some((t) => mentions(text, t));
}

function dedupeThreads(items: readonly OpenThread[]): OpenThread[] {
  const seen = new Map<string, OpenThread>();
  for (const t of items) if (!seen.has(t.text.toLowerCase())) seen.set(t.text.toLowerCase(), t);
  return [...seen.values()];
}

function trendOf(points: Array<{ at: number; score: number }>): SentimentTrend {
  const scored = points.filter((p) => p.score !== 0).sort((a, b) => a.at - b.at);
  if (scored.length < 3) return 'unknown';
  const half = Math.floor(scored.length / 2);
  const mean = (xs: typeof scored) => xs.reduce((s, p) => s + p.score, 0) / xs.length;
  const diff = mean(scored.slice(half)) - mean(scored.slice(0, half));
  return diff > 0.3 ? 'improving' : diff < -0.3 ? 'declining' : 'steady';
}

function displayName(p: ResolvedPerson): string {
  if (p.names.length > 0) return p.names[0];
  if (!p.role) return p.surfaces[0] ?? 'someone';
  const label = roleLabel(p.role);
  return roleIsUnique(p.role) ? label.charAt(0).toUpperCase() + label.slice(1) : `your ${label}`;
}

function personIdFor(p: ResolvedPerson): string {
  if (p.role && roleIsUnique(p.role)) return stableId('person', `role:${p.role}`);
  if (p.names.length > 0) return stableId('person', `name:${p.names[0].split(/\s+/)[0]}`);
  return stableId('person', `role:${p.role ?? p.surfaces[0] ?? 'unknown'}`);
}

export interface PeopleModel {
  readonly people: readonly PersonProfile[];
  /** Every important date found, for the important-dates store. */
  readonly dates: readonly DetectedDate[];
}

/**
 * Build person profiles from a user's memory. Pure: no I/O.
 * `excludedIds` are person ids the user deleted (tombstoned).
 */
export function buildPeopleModel(
  sources: UserMemorySources,
  nowMs: number,
  excludedIds: ReadonlySet<string> = new Set()
): PeopleModel {
  const resolved = resolvePeople(sources);
  const roleHolders = new Map<string, number>();
  for (const p of resolved) if (p.role) roleHolders.set(p.role, (roleHolders.get(p.role) ?? 0) + 1);

  const factById = new Map(sources.facts.map((f) => [f.id, f]));
  const summaries = [...sources.summaries].sort((a, b) => a.at - b.at);
  const people: PersonProfile[] = [];
  const dates: DetectedDate[] = [];

  for (const r of resolved) {
    const id = personIdFor(r);
    if (excludedIds.has(id)) continue;
    const name = displayName(r);
    const aliases = [...new Set([name, ...r.surfaces])];
    const shared = !!r.role && (roleHolders.get(r.role) ?? 0) > 1;
    const terms = personMatchTerms({ aliases, relationship: r.role }, shared);

    const conversationIds = new Set<string>();
    const times: number[] = [];
    const mentionConvs = new Set<string>();
    for (const ev of r.evidence) {
      ev.conversationIds.forEach((c) => {
        conversationIds.add(c);
        mentionConvs.add(c);
      });
      times.push(ev.at);
    }

    // Key facts and dates
    const keyFacts: PersonFact[] = [];
    const personFacts: SourceFact[] = [];
    const personDates: DetectedDate[] = [];
    for (const fid of r.factIds) {
      const f = factById.get(fid);
      if (!f) continue;
      personFacts.push(f);
      keyFacts.push({ text: f.text, factId: f.id, sourceConversationIds: [...f.conversationIds] });
      personDates.push(...detectDatesInFact(f, { personId: id, name }, nowMs));
    }
    keyFacts.sort((a, b) => (factById.get(b.factId)?.at ?? 0) - (factById.get(a.factId)?.at ?? 0));

    // Summary mentions: timeline, sentiment, open threads
    const sentiment: Array<{ at: number; score: number }> = [];
    const mentionLines: PersonMention[] = [];
    const threads: OpenThread[] = [];
    for (const s of summaries) {
      const text = summaryText(s);
      if (!textMentionsPerson(text, terms)) continue;
      mentionConvs.add(s.conversationId);
      conversationIds.add(s.conversationId);
      times.push(s.at);
      const sentences = text.split(/(?<=[.!?])\s+/).filter((x) => textMentionsPerson(x, terms));
      sentences.forEach((x) =>
        mentionLines.push({ at: s.at, text: x, conversationId: s.conversationId })
      );
      sentiment.push({ at: s.at, score: sentimentScore(sentences.join(' ')) });
      if (nowMs - s.at > OPEN_THREAD_WINDOW_DAYS * DAY_MS) continue;
      for (const item of s.followUps) {
        if (!textMentionsPerson(item, terms)) continue;
        threads.push({ text: item, mentionedAt: s.at, sourceConversationIds: [s.conversationId] });
      }
    }
    for (const d of personDates) {
      const days = daysUntil(d.date, nowMs);
      if (!d.recurring && days !== null && days <= OPEN_THREAD_WINDOW_DAYS) {
        threads.push({
          text: `${d.title} (${d.date})`,
          mentionedAt: nowMs,
          sourceConversationIds: d.sourceConversationIds,
        });
      }
    }

    const memorial = isMemorial([
      ...personFacts.map((f) => f.text),
      ...mentionLines.map((m) => m.text),
    ]);
    const isPet = looksLikePet(personFacts, roleGroup(r.role) === 'pet');
    const mentionCount = mentionConvs.size || r.evidence.length;
    const sentimentTrend = trendOf(sentiment);
    const relationshipDetailsOf = isPet
      ? undefined
      : relationshipDetails({
          name,
          aliases,
          role: r.role,
          isPartner: roleGroup(r.role) === 'partner',
          facts: personFacts,
          mentions: mentionLines,
          summaries,
          conflicts: sources.conflicts ?? [],
          sentimentTrend,
          firstMentionedAt: times.length ? Math.min(...times) : nowMs,
        });
    // A former partner keeps their history but is no longer "your partner".
    const former = relationshipDetailsOf?.isFormer ?? false;
    const group = isPet ? 'pet' : former ? 'other' : roleGroup(r.role);
    const connection =
      !isPet && !former && (group === 'friend' || group === 'work' || group === 'other')
        ? connectionDetails({
            role: r.role,
            facts: personFacts,
            mentions: mentionLines,
            mentionCount,
            sentiment: sentiment.length
              ? sentiment.reduce((a, p) => a + p.score, 0) / sentiment.length
              : 0,
            summaries,
            nowMs,
          })
        : undefined;
    // A friend's fresh news and the user's own intentions are open threads too.
    if (connection) {
      for (const e of connection.lifeEvents)
        if (nowMs - e.mentionedAt <= 14 * DAY_MS) threads.push(e);
      threads.push(...connection.intentions);
    }
    const openThreads =
      memorial || former
        ? [] // never "how is X?" about someone who has died, nor about an ex
        : dedupeThreads(threads.filter((t) => !isResolved(t, summaries)))
            .sort((a, b) => b.mentionedAt - a.mentionedAt)
            .slice(0, MAX_THREADS_PER_PERSON);

    dates.push(...personDates);
    people.push({
      id,
      kind: isPet ? 'pet' : 'person',
      memorial,
      pet: isPet ? petDetails(personFacts, r.role) : undefined,
      connection,
      relationshipDetails: relationshipDetailsOf,
      name,
      aliases,
      relationship: former ? 'ex' : (r.role ?? (isPet ? 'pet' : undefined)),
      group,
      keyFacts: keyFacts.slice(0, MAX_FACTS_PER_PERSON),
      importantDates: personDates,
      openThreads,
      mentionCount,
      firstMentionedAt: times.length ? Math.min(...times) : nowMs,
      lastMentionedAt: times.length ? Math.max(...times) : nowMs,
      sentimentTrend,
      sourceConversationIds: [...conversationIds],
      sourceFactIds: [...r.factIds],
      updatedAt: nowMs,
    });
  }

  // The user's own dates (their birthday, their interview) are not about a person.
  const personFactIds = new Set(resolved.flatMap((p) => p.factIds));
  for (const f of sources.facts) {
    if (!personFactIds.has(f.id)) dates.push(...detectDatesInFact(f));
  }

  people.sort((a, b) => b.lastMentionedAt - a.lastMentionedAt || b.mentionCount - a.mentionCount);
  return { people, dates: dedupeDates(dates) };
}

function dedupeDates(dates: readonly DetectedDate[]): DetectedDate[] {
  const best = new Map<string, DetectedDate>();
  for (const d of dates) {
    const seen = best.get(d.key);
    if (!seen) best.set(d.key, d);
    else
      best.set(d.key, {
        ...(d.confidence > seen.confidence ? d : seen),
        sourceConversationIds: [
          ...new Set([...seen.sourceConversationIds, ...d.sourceConversationIds]),
        ],
      });
  }
  return [...best.values()];
}

/** Find a person by name or alias ("Mom", "my mother", "linda"). */
export function findPerson(
  people: readonly PersonProfile[],
  nameOrAlias: string
): PersonProfile | null {
  const q = nameOrAlias
    .trim()
    .toLowerCase()
    .replace(/^(my|our|the)\s+/, '');
  if (!q) return null;
  for (const p of people) {
    if (p.id === nameOrAlias) return p;
    if (p.aliases.some((a) => a.toLowerCase().replace(/^(my|our|the)\s+/, '') === q)) return p;
  }
  const byRole = people.filter((p) => p.relationship && roleWords(p.relationship).includes(q));
  if (byRole.length === 1) return byRole[0];
  const byFirst = people.filter((p) => p.name.toLowerCase().split(/\s+/)[0] === q);
  return byFirst.length === 1 ? byFirst[0] : null;
}
