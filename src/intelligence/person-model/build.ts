/**
 * Builds the code-computed sections of the person model from store snapshots
 * the caller already loaded. Pure: no Firestore, no clock, no flags.
 *
 * Privacy is applied here, not in the prompt (design sec. 3):
 * - facts arrive through loadRecallSnapshot, so forget marks, forgotten
 *   topics and low confidence are filtered by the same code recall uses;
 * - every other text is checked against the forgotten topics (isForgotten),
 *   summaries are read undisputed() and threads only with CALLER_PROVENANCE;
 * - forgotten topics that could not be read (null) fail closed: no text at all;
 * - nothing that looks like a phone number or an email enters the doc.
 * Mood, sentiment and "what changed" are LLM work (PR 4): left dirty for now.
 *
 * @module intelligence/person-model/build
 */
import { isSensitiveThread, peopleOf, type RecallFact } from '../../memory/index.js';
import { buildFollowThrough, buildRhythms } from './stats.js';
import * as T from './types.js';
import { buildUnfinished } from './unfinished.js';
import { arr, DAY, dirty, iso, keep, ms, prov, str, type Doc } from './util.js';

export interface PersonModelInputs {
  userId: string;
  /** Root `timezone` (IANA); hours and days are read in UTC without one. */
  timezone: string | null;
  /** Their own quiet window in minutes after midnight, on top of the 21:00-08:00 floor. */
  quiet?: { startMin: number; endMin: number };
  /** summaries, newest first. */
  summaries: Doc[];
  temporalSnapshots: Doc[];
  /** loadRecallSnapshot(...).facts: the recall filters already applied. */
  facts: RecallFact[];
  relationshipNetwork: Doc[];
  /** Root `familyMembers`. */
  familyMembers: Doc[];
  commitments: Doc[];
  ferniCommitments: Doc[];
  followThrough: Doc[];
  worldFacts: Doc[];
  topicPatterns: Doc[];
  /** memory_state/forgotten topics; null when they could not be read. */
  forgotten: string[] | null;
  forgetGeneration: number;
}

function buildTopics(i: PersonModelInputs, forgotten: string[]): T.Topics {
  const label = (x: unknown) => keep(x, forgotten, 60)?.toLowerCase() ?? null;
  // One set of topics per call, newest first; topic_patterns adds to its own session's call.
  const calls = i.summaries.map((s) => {
    const more = i.topicPatterns.filter((p) => p.sessionId && p.sessionId === s.sessionId);
    const all = [...arr(s.mainTopics), ...more.flatMap((p) => arr(p.topics))].map(label);
    return new Set(all.filter((l): l is string => l !== null));
  });
  const count = (from: number, to: number) => {
    const c = new Map<string, number>();
    for (const set of calls.slice(from, to)) for (const l of set) c.set(l, (c.get(l) ?? 0) + 1);
    return c;
  };
  const older = count(2, calls.length);
  const last5 = count(0, 5);
  return {
    recurring: [...count(0, 10)]
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, n]) => ({ label, calls: n })),
    // With two calls or fewer everything is new, which says nothing.
    new: calls.length > 2 ? [...count(0, 2).keys()].filter((l) => !older.has(l)).slice(0, 4) : [],
    fading: [...count(5, calls.length)]
      .filter(([l, n]) => n >= 3 && !last5.has(l))
      .map(([l]) => l)
      .slice(0, 4),
  };
}

type Draft = T.Person & { notes: string[] };

function buildPeople(i: PersonModelInputs, now: Date, forgotten: string[]): T.Person[] {
  const since = now.getTime() - 90 * DAY;
  const byName = new Map<string, Draft>();
  const person = (name: string, relation: string | null): Draft => {
    const k = name.toLowerCase();
    const p = byName.get(k) ?? {
      ...{ name, relation, mentions90d: 0, lastMentioned: null, openThread: null },
      ...{ sentiment: 'unknown' as const, sensitive: false, notes: [] },
    };
    p.relation ??= relation;
    byName.set(k, p);
    return p;
  };
  const seen = (p: Draft, at: number | null) => {
    if (at === null) return;
    if (at >= since) p.mentions90d++;
    if (!p.lastMentioned || at > Date.parse(p.lastMentioned)) p.lastMentioned = iso(at);
  };
  // Who is who comes from RECALL_PEOPLE's roster (never guessed), then relations from their profile.
  for (const r of peopleOf(i.facts)) person(r.name, r.relation);
  for (const m of i.familyMembers)
    if (str(m.name)) person(str(m.name), str(m.relationship).toLowerCase() || null);
  // relationship_network: mentions and aliases; a name only it knows has no relation.
  for (const n of i.relationshipNetwork) {
    const names = [str(n.name), ...arr(n.aliases).map(str)].filter(Boolean);
    const known = names.map((x) => byName.get(x.toLowerCase())).find(Boolean);
    const p = known ?? (names[0] ? person(names[0], null) : null);
    if (!p) continue;
    if (!p.lastMentioned || (ms(n.lastMentioned) ?? 0) > Date.parse(p.lastMentioned))
      p.lastMentioned = iso(ms(n.lastMentioned));
    for (const m of arr(n.recentMentions) as Doc[]) {
      if ((ms(m.date) ?? 0) >= since) p.mentions90d++;
      p.notes.push(str(m.context));
    }
  }
  for (const f of i.facts) {
    const p = byName.get(f.entity.trim().toLowerCase());
    if (!p) continue;
    seen(p, ms(f.extractedAt));
    p.notes.push(`${f.key} ${f.value}`);
  }
  return [...byName.values()]
    .filter((p) => keep(p.name, forgotten, 60) === p.name)
    .map(({ notes, ...p }) => ({ ...p, sensitive: notes.some(isSensitiveThread) }))
    .sort(
      (a, b) =>
        b.mentions90d - a.mentions90d ||
        (b.lastMentioned ?? '').localeCompare(a.lastMentioned ?? '')
    )
    .slice(0, 8);
}

const total = (...lists: unknown[][]) => lists.reduce((n, l) => n + l.length, 0);
/** Not built yet (PR 4): dirty, so readers derive it live. */
const later = <V>(value: V): T.Section<V> => ({ value, prov: dirty() });

/** The person model's code sections. `rendered` is filled by render.ts. */
export function buildPersonModel(i: PersonModelInputs, now: Date): T.PersonModel {
  const closed = i.forgotten === null; // can't tell what was forgotten: keep no text
  const forgotten = i.forgotten ?? [];
  const section = <V>(value: V, sources: string[], docs: number): T.Section<V> => ({
    value,
    prov: prov(now, sources, docs),
  });
  return {
    v: T.PERSON_MODEL_VERSION,
    userId: i.userId,
    builtAt: now.toISOString(),
    throughSessionId: str(i.summaries[0]?.sessionId) || str(i.summaries[0]?.id) || null,
    forgetGeneration: i.forgetGeneration,
    rendered: '',
    rhythms: buildRhythms(i, now),
    followThrough: buildFollowThrough(i, now),
    mood: later({ points: [], trend: 'unknown', vsBaseline: null, note: null }),
    people: section(
      closed ? [] : buildPeople(i, now, forgotten),
      ['dynamic_facts', 'familyMembers', 'relationship_network'],
      total(i.facts, i.familyMembers, i.relationshipNetwork)
    ),
    unfinished: section(
      closed
        ? { openLoops: [], upcomingDates: [], ferniOwes: [] }
        : buildUnfinished(i, now, forgotten),
      ['follow_through', 'summaries', 'world_facts', 'ferni_commitments'],
      total(i.followThrough, i.summaries, i.worldFacts, i.ferniCommitments)
    ),
    topics: section(
      closed ? { recurring: [], new: [], fading: [] } : buildTopics(i, forgotten),
      ['summaries', 'topic_patterns'],
      total(i.summaries, i.topicPatterns)
    ),
    changed: { value: [], prov: dirty('llm') },
  };
}
