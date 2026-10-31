/**
 * Marks remembered facts that newer facts have made untrue.
 *
 * The fact extractor sees one utterance and nothing already stored, so a
 * change never retires what it replaces: "Works as a baker at Rise and
 * Grind" stayed next to "current employer = Northwind", and asked where he
 * works now, Ferni said the bakery (memory benchmark, 2026-10-11). The two
 * rarely share a key or even an entity name ("book club" / "The book club",
 * "Relocation to Austin" / "The move"), so matching them takes a reading,
 * not a rule.
 *
 * After a call, the facts written since the last run are read against the
 * caller's older facts that could be about the same thing, and one model
 * call names the older ones a newer fact replaces. Those are marked
 * supersededAt / supersededBy, never deleted; recall leaves them out
 * (session-recall.ts). A cursor per caller covers facts whose extraction
 * finished after the call ended: they are read on the next run.
 *
 * Off by default; FACT_SUPERSESSION=on turns it on.
 *
 * @module memory/dynamic/fact-supersession
 */
import { createLogger } from '../../utils/safe-logger.js';
import { isCallerName } from '../domain/person-key.js';
import { contentWords } from '../recall/session-recall.js';

const log = createLogger({ module: 'fact-supersession' });

export function factSupersessionEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.FACT_SUPERSESSION === 'on';
}

export interface StoredFact {
  id: string;
  entityName: string;
  key: string;
  value: string;
  extractedAt: string;
  supersededAt?: string;
}

export interface SupersessionStore {
  /** The caller's facts, newest first. */
  facts: (userId: string) => Promise<StoredFact[]>;
  markSuperseded: (
    userId: string,
    marks: Array<{ id: string; by: string }>,
    at: string
  ) => Promise<void>;
  cursor: (userId: string) => Promise<string | undefined>;
  setCursor: (userId: string, at: string) => Promise<void>;
}

export type SupersessionLLM = (prompt: string) => Promise<string | null>;

/** Older facts read against the new ones at most, so the prompt stays small. */
const MAX_OLDER = 60;
const MAX_NEWER = 40;

/** "The book club" and "book club" are one subject; so are "User" and "Speaker". */
function subject(entity: string): string {
  const e = entity.trim().toLowerCase();
  return isCallerName(e) ? 'self' : e.replace(/^(?:the|a|an|my|their) /, '');
}

const line = (f: StoredFact) => `${f.entityName} | ${f.key.replace(/_/g, ' ')} = ${f.value}`;

/** Where they live and where they are right now (right-moment memory §5.3): one never
 * replaces the other, whatever the model replies. Whole keys, any case, space or underscore. */
const PLACE_KEYS = new Set(['home', 'current location']);
const keyOf = (f: StoredFact) =>
  f.key
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, ' ');
const otherPlace = (a: StoredFact, b: StoredFact): boolean =>
  keyOf(a) !== keyOf(b) && PLACE_KEYS.has(keyOf(a)) && PLACE_KEYS.has(keyOf(b));

/**
 * Older facts that could be about the same thing as a newer one: the same
 * subject, or a content word in common, and not the other place key (home and
 * current location). The rest can't be replaced by them.
 */
export function candidates(
  newer: readonly StoredFact[],
  older: readonly StoredFact[]
): StoredFact[] {
  const keyed = newer.map((n) => ({
    n,
    subject: subject(n.entityName),
    words: contentWords(line(n)),
  }));
  return older
    .filter((f) => {
      const words = [...contentWords(line(f))];
      return keyed.some(
        (k) =>
          !otherPlace(k.n, f) &&
          (k.subject === subject(f.entityName) || words.some((w) => k.words.has(w)))
      );
    })
    .slice(0, MAX_OLDER);
}

export function supersessionPrompt(
  newer: readonly StoredFact[],
  older: readonly StoredFact[]
): string {
  return [
    'A friend keeps notes about someone. NEWER notes were just written; OLDER notes were written before.',
    'Which OLDER notes are no longer true because a NEWER note replaces them? A note is replaced only when the same thing has changed: a job, a home, a plan, a date, a relationship, a status, what they are doing now.',
    'A newer note that adds detail, or is about something else, replaces nothing. When unsure, leave it.',
    '',
    'NEWER:',
    ...newer.map((f, i) => `N${i + 1}. ${line(f)} (${f.extractedAt.slice(0, 10)})`),
    '',
    'OLDER:',
    ...older.map((f, i) => `O${i + 1}. ${line(f)} (${f.extractedAt.slice(0, 10)})`),
    '',
    'Reply with only a JSON array of pairs, e.g. [{"older": "O3", "newer": "N1"}], or [] if none.',
  ].join('\n');
}

/** The (older, newer) pairs a reply names, keeping only labels that exist. */
export function parseSupersession(
  raw: string | null,
  newer: readonly StoredFact[],
  older: readonly StoredFact[]
): Array<{ id: string; by: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse((raw ?? '').replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const index = (
    label: unknown,
    prefix: string,
    list: readonly StoredFact[]
  ): StoredFact | undefined => {
    const m = String(label).match(new RegExp(`^${prefix}(\\d+)$`));
    return m ? list[Number(m[1]) - 1] : undefined;
  };
  const marks = new Map<string, string>();
  for (const p of parsed as Array<{ older?: unknown; newer?: unknown }>) {
    const o = index(p.older, 'O', older);
    const n = index(p.newer, 'N', newer);
    if (o && n && !otherPlace(o, n)) marks.set(o.id, n.id);
  }
  return [...marks].map(([id, by]) => ({ id, by }));
}

/**
 * Reads the facts written since the last run against older ones and marks
 * those replaced. `since` stands in for a missing cursor (the first run):
 * facts from the call that just ended. Returns how many were marked.
 */
export async function supersedeNewFacts(
  userId: string,
  deps: { store: SupersessionStore; llm: SupersessionLLM; since: Date; now?: Date }
): Promise<number> {
  const { store } = deps;
  const cursor = (await store.cursor(userId)) ?? deps.since.toISOString();
  const live = (await store.facts(userId)).filter((f) => !f.supersededAt && f.extractedAt);
  const newer = live.filter((f) => f.extractedAt > cursor).slice(0, MAX_NEWER);
  if (newer.length === 0) return 0;
  const oldestNew = newer.reduce(
    (m, f) => (f.extractedAt < m ? f.extractedAt : m),
    newer[0]!.extractedAt
  );
  const older = candidates(
    newer,
    live.filter((f) => f.extractedAt < oldestNew)
  );
  const latest = newer.reduce((m, f) => (f.extractedAt > m ? f.extractedAt : m), cursor);
  if (older.length > 0) {
    const marks = parseSupersession(await deps.llm(supersessionPrompt(newer, older)), newer, older);
    if (marks.length > 0) {
      await store.markSuperseded(userId, marks, (deps.now ?? new Date()).toISOString());
      log.info(
        {
          userId: userId.slice(0, 8),
          marked: marks.length,
          newer: newer.length,
          older: older.length,
        },
        'Facts superseded'
      );
    }
    await store.setCursor(userId, latest);
    return marks.length;
  }
  await store.setCursor(userId, latest);
  return 0;
}
