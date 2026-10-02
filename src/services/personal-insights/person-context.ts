/**
 * Per-turn person recall: when the user mentions someone ("my mom", "Linda"),
 * that person's profile is ready for the reply.
 *
 * `createPersonRecall` loads the profiles once at call start and matches each
 * transcript synchronously (no network on the turn path), the same way the
 * memory recall hook does. `getPersonContext` is the async one-shot version
 * for other callers (tools, the memory recall hook).
 *
 * People the user asked Ferni not to bring up (proactive boundaries) are left
 * out entirely.
 *
 * @module services/personal-insights/person-context
 */

import { createLogger } from '../../utils/safe-logger.js';
import { personalInsightsEnabled } from './config.js';
import { filterAllowed } from './integrations.js';
import { personMatchTerms } from './people-model.js';
import { getPeople, getPerson, type PipelineDeps } from './pipeline.js';
import { formatPersonNote } from './session-block.js';
import { mentions } from './text-utils.js';
import type { PersonProfile } from './types.js';

const log = createLogger({ module: 'person-recall' });

/** People a transcript mentions, best match first. */
export function peopleMentioned(
  transcript: string,
  people: readonly PersonProfile[]
): PersonProfile[] {
  const holders = new Map<string, number>();
  for (const p of people)
    if (p.relationship) holders.set(p.relationship, (holders.get(p.relationship) ?? 0) + 1);
  const hits: Array<{ p: PersonProfile; named: boolean }> = [];
  for (const p of people) {
    const shared = !!p.relationship && (holders.get(p.relationship) ?? 0) > 1;
    const terms = personMatchTerms(p, shared);
    const matched = terms.find((t) => mentions(transcript, t));
    if (matched) hits.push({ p, named: /^\p{Lu}/u.test(matched) });
  }
  return hits
    .sort((a, b) => Number(b.named) - Number(a.named) || b.p.mentionCount - a.p.mentionCount)
    .map((h) => h.p);
}

/** The profile note for a mention ("mom", "Linda"), or null. */
export async function getPersonContext(
  userId: string,
  mention: string,
  d: PipelineDeps = {}
): Promise<string | null> {
  if (!personalInsightsEnabled()) return null;
  const direct = await getPerson(userId, mention, d);
  const person = direct ?? peopleMentioned(mention, await getPeople(userId, d))[0];
  if (!person) return null;
  const [allowed] = await filterAllowed(userId, [person], (p) => p.name);
  return allowed ? formatPersonNote(allowed) : null;
}

export interface PersonRecall {
  ready: Promise<void>;
  /** A note for people this transcript mentions that were not surfaced yet. Synchronous. */
  noteFor(transcript: string): string | null;
}

export function createPersonRecall(userId: string, d: PipelineDeps = {}): PersonRecall {
  let people: PersonProfile[] = [];
  const surfaced = new Set<string>();
  const started = Date.now();
  const ready = (async () => {
    if (!personalInsightsEnabled()) return;
    try {
      people = await filterAllowed(userId, await getPeople(userId, d), (p) => p.name);
      log.info({ people: people.length, ms: Date.now() - started }, 'Person recall loaded');
    } catch (error) {
      log.warn({ error: String(error) }, 'Person recall unavailable');
    }
  })();
  return {
    ready,
    noteFor(transcript) {
      const text = transcript.trim();
      if (!text || people.length === 0) return null;
      const person = peopleMentioned(text, people).find((p) => !surfaced.has(p.id));
      if (!person) return null;
      const note = formatPersonNote(person);
      if (!note) return null;
      surfaced.add(person.id);
      return note;
    },
  };
}
