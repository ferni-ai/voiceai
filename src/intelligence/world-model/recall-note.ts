/**
 * The world model as the live recall hook uses it (memory-recall-hook.ts).
 *
 * Who is in the caller's life, what they are working toward and what not to
 * bring up go into one short note, once a call. It is the single source for
 * those: per-turn recall then leaves out facts that only restate one of them,
 * and never surfaces a fact that touches something they asked to avoid.
 * Mood is not here (REVIVED_INTELLIGENCE owns it), nor facts (recall owns them).
 *
 * @module intelligence/world-model/recall-note
 */

import type { WorldModelSnapshot } from './types.js';

/** True when WORLD_MODEL_SNAPSHOT=on. */
export function isWorldModelSnapshotOn(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.WORLD_MODEL_SNAPSHOT === 'on';
}

/** ~120 tokens, once a call; per-turn recall notes are 4 facts at most. */
export const WORLD_NOTE_MAX_CHARS = 480;

/** The slice of a recall fact this needs (session-recall.ts RecallFact). */
export interface FactLike {
  entity: string;
  key: string;
  value: string;
}

export interface WorldNoteCounts {
  people: number;
  relations: number;
  goals: number;
  avoids: number;
}

const SELF = /^(?:user|me|speaker|i)$/i;
const STOP = new Set(
  'the a an and or of to in on at for with about my their his her our your me them they it is was be not no do dont don t please bring up talk mention any'.split(
    ' '
  )
);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

/** How a person relates to the caller, from the person or a relation edge. */
function relationOf(snapshot: WorldModelSnapshot, name: string): string | undefined {
  const person = snapshot.people.find((p) => p.name === name);
  if (person?.relation) return person.relation;
  const edge = snapshot.relations.find((r) => r.source === name || r.target === name);
  if (!edge) return undefined;
  if (edge.source === name) {
    return SELF.test(edge.target) ? edge.relation : `${edge.relation} ${edge.target}`;
  }
  return SELF.test(edge.source) ? edge.relation : `${edge.source}'s ${edge.relation}`;
}

function capped(lines: string[], maxChars: number): string[] {
  const out: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length + 1 > maxChars) break;
    out.push(line);
    used += line.length + 1;
  }
  return out;
}

/** The note, and what went into it, or null when the stores had nothing. */
export function formatWorldNote(
  snapshot: WorldModelSnapshot,
  maxChars: number = WORLD_NOTE_MAX_CHARS
): { note: string; counts: WorldNoteCounts } | null {
  const people = snapshot.people.map((p) => {
    const rel = relationOf(snapshot, p.name);
    return rel ? `${p.name} (${rel})` : p.name;
  });
  const goals = [...new Map(snapshot.goals.map((g) => [g.text.toLowerCase(), g.text])).values()];
  const hard = snapshot.negatives.filter((n) => n.source === 'user').map((n) => n.text);
  const soft = snapshot.negatives.filter((n) => n.source !== 'user').map((n) => n.text);
  if (people.length + goals.length + hard.length + soft.length === 0) return null;

  const lines = ['[THEIR WORLD]'];
  if (hard.length > 0) lines.push(`Never bring up: ${hard.join('; ')}.`);
  if (soft.length > 0) lines.push(`Only if they raise it: ${soft.join('; ')}.`);
  if (people.length > 0) lines.push(`People in their life: ${people.join(', ')}.`);
  if (goals.length > 0) lines.push(`Working toward: ${goals.join('; ')}.`);
  lines.push('Use these the way a friend who knows them would, only when it fits. Never list them.');
  // Avoidances go first so a tight budget never drops them.
  const kept = capped(lines, maxChars);
  const text = kept.join('\n');
  const inText = (items: string[]) => items.filter((i) => text.includes(i)).length;
  return {
    note: text,
    counts: {
      people: inText(snapshot.people.map((p) => p.name)),
      relations: snapshot.people.filter((p) => relationOf(snapshot, p.name) && text.includes(p.name))
        .length,
      goals: inText(goals),
      avoids: inText([...hard, ...soft]),
    },
  };
}

function touches(factWords: Set<string>, topic: string): boolean {
  const topicWords = [...new Set(words(topic))];
  if (topicWords.length === 0) return false;
  const hits = topicWords.filter((w) => factWords.has(w)).length;
  return hits >= Math.min(2, topicWords.length);
}

/**
 * Recall facts without what the world note already says: a person's
 * relationship to the caller, a goal it lists, and anything about a topic
 * they asked not to bring up. Recall must never surface those, so once one
 * fact about someone touches an avoided topic ("Jake | relationship = ex"),
 * every fact about them goes ("Jake | still_texts = sometimes").
 */
export function withoutWorldDuplicates<T extends FactLike>(
  facts: readonly T[],
  snapshot: WorldModelSnapshot
): T[] {
  const people = new Set(snapshot.people.map((p) => p.name.toLowerCase()));
  const avoided = (fact: FactLike) => {
    const all = new Set(words(`${fact.entity} ${fact.key} ${fact.value}`));
    return snapshot.negatives.some((n) => touches(all, n.text));
  };
  const tainted = new Set(
    facts.filter((f) => !SELF.test(f.entity) && avoided(f)).map((f) => f.entity.toLowerCase())
  );
  return facts.filter((fact) => {
    if (tainted.has(fact.entity.toLowerCase()) || avoided(fact)) return false;
    const key = fact.key.toLowerCase();
    if (people.has(fact.entity.toLowerCase()) && /relation|^role$|^is$/.test(key)) return false;
    if (/goal|dream|plan|aspiration/.test(key)) {
      const value = new Set(words(fact.value));
      if (snapshot.goals.some((g) => touches(value, g.text))) return false;
    }
    return true;
  });
}
