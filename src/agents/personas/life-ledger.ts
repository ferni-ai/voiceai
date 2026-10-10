/**
 * What Ferni has told this caller about his own life, kept across calls.
 *
 * A friend's life holds still between calls: the goat that got out last week
 * gets out again, the wife who teases about the coffee is the same wife. Ferni
 * improvised a new life every call (dev, 2026-10-05: a neighbor's runaway goat
 * ate his wife's marigolds; the next call a crow and a pizza; the next his
 * second cup of coffee) and nothing remembered what he had said to whom, so
 * details could contradict each other and nothing could become a running
 * thread.
 *
 * During a call his committed replies are collected. When it ends, a small
 * model lists the concrete things he said about himself; each must share a
 * word with what he actually said (no invented facts), and they are stored
 * under the caller. On the next call the first recall note carries the most
 * recent ones, so he stays consistent and can pick a thread back up.
 *
 * LIFE_LEDGER=off turns it off. FERNI_SELF_MEMORY=on keeps only his life:
 * jokes, hypotheticals and remarks about the call itself are dropped, and the
 * extractor sees his core biography and leaves out anything that contradicts
 * it, so an improvised detail can't become a lasting "fact" against who he is.
 *
 * @module agents/personas/life-ledger
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'LifeLedger' });

export function lifeLedgerEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.LIFE_LEDGER !== 'off';
}

export function selfMemoryEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.FERNI_SELF_MEMORY === 'on';
}

export interface LedgerFact {
  personaId: string;
  fact: string;
  /** ISO time the call ended. */
  saidAt: string;
}

/** The slice of storage this needs; injected so tests need no database. */
export interface LedgerStore {
  save(userId: string, facts: LedgerFact[]): Promise<void>;
  recent(userId: string, personaId: string, limit: number): Promise<LedgerFact[]>;
}

/** Lists what was said about himself, from his lines; injected so tests need no model. */
export type FactExtractor = (personaName: string, lines: string[]) => Promise<string[]>;

const MAX_FACTS_PER_CALL = 8;
const MAX_FACT_WORDS = 20;
const RECALL_LIMIT = 10;
const STOP = new Set(
  "that this they them their with what have from about your just like been were when then there some would could should into only also very really honestly actually ferni ferni's peter maya alex jordan nayan".split(
    ' '
  )
);
export const contentWords = (t: string): Set<string> =>
  new Set((t.toLowerCase().match(/[a-z']{4,}/g) ?? []).filter((w) => !STOP.has(w)));

/** Keep facts that are short and grounded in what he actually said, once each. */
export function groundedFacts(facts: string[], lines: string[]): string[] {
  const said = contentWords(lines.join(' '));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of facts) {
    const fact = raw.replace(/^[\s\-*\d.)]+/, '').trim();
    if (!fact || fact.split(/\s+/).length > MAX_FACT_WORDS) continue;
    const words = [...contentWords(fact)];
    // Most of a fact's words must come from his lines: no invented details.
    if (words.length === 0 || words.filter((w) => said.has(w)).length / words.length < 0.5)
      continue;
    const key = fact.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(fact);
  }
  return out.slice(0, MAX_FACTS_PER_CALL);
}

/**
 * Not his life: "Ferni would end up eating his own wallet by Tuesday" (a joke),
 * "Ferni got mixed up and confused the tea talk" (the call itself). Both were
 * saved for a prod caller on 2026-10-10, half of that call's ledger.
 */
const HYPOTHETICAL = /^[\w-]+(?:'s)?\s+(?:would|wouldn't|could|couldn't|might)\b/i;
const ABOUT_THE_CALL =
  /\b(?:the|this|our) (?:conversation|call|chat|topic)\b|\b(?:mixed up|confused|misheard|misunderstood)\b.*\b(?:talk|conversation|question|said)\b/i;

/** Drop the lines that aren't about his life (FERNI_SELF_MEMORY). */
export function lifeFactsOnly(facts: string[]): string[] {
  return facts.filter((f) => {
    const fact = f.replace(/^[\s\-*\d.)]+/, '').trim();
    return !HYPOTHETICAL.test(fact) && !ABOUT_THE_CALL.test(fact);
  });
}

export function factDocId(f: LedgerFact): string {
  return `${f.personaId}_${createHash('sha1').update(f.fact.toLowerCase()).digest('hex').slice(0, 16)}`;
}

/** The note for the first turn of a call, or null when there is nothing. */
export function formatLedger(
  facts: LedgerFact[],
  userName?: string,
  now: number = Date.now()
): string | null {
  if (facts.length === 0) return null;
  const who = userName || 'them';
  const lines = facts.map((f) => {
    const days = Math.floor((now - Date.parse(f.saidAt)) / 86_400_000);
    const when = Number.isNaN(days)
      ? ''
      : days < 1
        ? ' [told today]'
        : days === 1
          ? ' [told yesterday]'
          : ` [told ${days} days ago]`;
    return `- ${f.fact}${when}`;
  });
  return [
    `[WHAT YOU'VE TOLD ${who.toUpperCase()} ABOUT YOUR OWN LIFE ON EARLIER CALLS]`,
    ...lines,
    'This is your life: stay consistent with it, and if it fits, pick a thread back up the way a friend would ("the goat got out again"). When they ask about something you told them, it is one of these; never make up a different event in its place. Don\'t repeat these back or list them.',
  ].join('\n');
}

const EXTRACT_PROMPT = (name: string) =>
  `Below are things ${name} said on a phone call. List the concrete things ${name} said about ${name}'s OWN life: what happened to them, people and pets in their life, places, habits, opinions and plans. One per line, under 15 words, in the third person ("${name}'s wife teases him about his coffee"). Only what ${name} states about ${name} ("I", "my", "we"): a remark about a situation in general ("a slow week can be nice") is a reaction to the other person, not part of ${name}'s life. Leave out anything about the other person, advice, and generic small talk. If there is nothing, reply NONE.`;

/** With FERNI_SELF_MEMORY: only real claims about his life. */
const SELF_MEMORY_PROMPT = (name: string) =>
  `${EXTRACT_PROMPT(name)} Leave out jokes, hypotheticals ("${name} would end up...") and remarks about the call itself.`;

/**
 * A second, narrower question: which facts conflict with his biography. Asked
 * inside the extraction prompt, gemini-3.5-flash-lite either kept "Ferni is
 * an only child" / "grew up in Ohio" (6/6 runs) or, told to drop
 * contradictions, dropped everything the biography doesn't mention (4/4).
 */
const CONFLICT_PROMPT = (name: string, biography: string) =>
  `Here is ${name}'s biography, in his voice:\n"""\n${biography.trim()}\n"""\nBelow are numbered facts about ${name}. Which of them conflict with the biography, giving him a different hometown, family, history or life than the one it describes? A fact the biography doesn't mention does not conflict. Reply with the numbers of the conflicting facts separated by commas, or NONE.`;

const biographies = new Map<string, Promise<string>>();
/**
 * The persona's core biography, or '' when it has none (warned once). Looked
 * up where the bundle loader looks, by working directory (src/ locally,
 * dist/personas/bundles/ in the image), not next to this module: in the
 * esbuild agent bundle this module lives at dist/agents/, so a path relative
 * to it would miss.
 */
export function biographyCore(personaId: string): Promise<string> {
  let bio = biographies.get(personaId);
  if (!bio) {
    bio = (async () => {
      const { getBundleSearchPaths } = await import('../../personas/bundles/loader.js');
      for (const root of getBundleSearchPaths()) {
        const text = await readFile(join(root, personaId, 'identity', 'biography-core.md'), 'utf8').catch(() => '');
        if (text) return text;
      }
      log.warn({ personaId }, 'No biography-core.md found; the biography check is skipped');
      return '';
    })();
    biographies.set(personaId, bio);
  }
  return bio;
}

async function askModel(systemInstruction: string, input: string): Promise<string> {
  const { getGenerativeModel } = await import('../../config/generative-model.js');
  const model = await getGenerativeModel({
    model: process.env.LIFE_LEDGER_MODEL || 'gemini-3.5-flash-lite',
    systemInstruction,
    generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
  });
  if (!model) return '';
  return (await model.generateContent(input)).response.text().trim();
}

/** The facts that don't conflict with the persona's biography. Keeps all if it can't tell. */
export async function consistentWithBiography(
  name: string,
  facts: string[],
  biography: string,
  ask: (system: string, input: string) => Promise<string> = askModel
): Promise<string[]> {
  if (!biography || facts.length === 0) return facts;
  const numbered = facts.map((f, i) => `${i + 1}. ${f}`).join('\n');
  const reply = await ask(CONFLICT_PROMPT(name, biography), numbered).catch((error: unknown) => {
    log.warn({ error: String(error) }, 'Biography check failed; keeping the facts');
    return 'NONE';
  });
  const conflicting = new Set((reply.match(/\d+/g) ?? []).map(Number));
  return facts.filter((_, i) => !conflicting.has(i + 1));
}

const defaultExtractor: FactExtractor = async (name, lines) => {
  const prompt = selfMemoryEnabled() ? SELF_MEMORY_PROMPT(name) : EXTRACT_PROMPT(name);
  const text = await askModel(prompt, lines.map((l) => `- ${l}`).join('\n'));
  return !text || /^none\b/i.test(text) ? [] : text.split('\n');
};

export const firestoreLedgerStore: LedgerStore = {
  async save(userId, facts) {
    const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return;
    const col = db.collection('bogle_users').doc(userId).collection('persona_told');
    const batch = db.batch();
    for (const f of facts) batch.set(col.doc(factDocId(f)), f, { merge: true });
    await batch.commit();
  },
  async recent(userId, personaId, limit) {
    const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('persona_told')
      .orderBy('saidAt', 'desc')
      .limit(limit * 3)
      .get();
    return snap.docs
      .map((d) => d.data() as LedgerFact)
      .filter((f) => f.personaId === personaId)
      .slice(0, limit);
  },
};

/** What a persona has told this user before, newest first. Never throws. */
export async function loadLedger(
  userId: string,
  personaId = 'ferni',
  store: LedgerStore = firestoreLedgerStore
): Promise<LedgerFact[]> {
  if (!lifeLedgerEnabled()) return [];
  return store.recent(userId, personaId, RECALL_LIMIT).catch((error: unknown) => {
    log.warn({ error: String(error) }, 'Life ledger not loaded');
    return [];
  });
}

/** Collects a call's replies per persona; flush() stores what was said about himself. */
export function createLedgerRecorder(
  userId: string,
  deps: {
    store?: LedgerStore;
    extract?: FactExtractor;
    now?: () => number;
    env?: Record<string, string | undefined>;
    /** The biography check's model; injected so tests need none. */
    ask?: (system: string, input: string) => Promise<string>;
  } = {}
) {
  const lines = new Map<string, string[]>();
  let flushed = false;
  return {
    add(personaId: string, text: string): void {
      if (flushed || !text.trim()) return;
      const list = lines.get(personaId) ?? [];
      list.push(text.trim());
      lines.set(personaId, list);
    },
    async flush(): Promise<number> {
      if (flushed || !lifeLedgerEnabled()) return 0;
      flushed = true;
      const saidAt = new Date((deps.now ?? Date.now)()).toISOString();
      let saved = 0;
      for (const [personaId, said] of lines) {
        try {
          const name = personaId === 'ferni' ? 'Ferni' : personaId.split('-')[0];
          const raw = await (deps.extract ?? defaultExtractor)(name, said);
          const strict = selfMemoryEnabled(deps.env);
          const grounded = groundedFacts(strict ? lifeFactsOnly(raw) : raw, said);
          const own = strict
            ? await consistentWithBiography(name, grounded, await biographyCore(personaId), deps.ask)
            : grounded;
          if (strict) {
            log.info({ personaId, extracted: raw.length, kept: own.length }, 'LIFE_LEDGER_SELF_MEMORY');
          }
          const facts = own.map((fact) => ({ personaId, fact, saidAt }));
          if (facts.length === 0) continue;
          await (deps.store ?? firestoreLedgerStore).save(userId, facts);
          saved += facts.length;
        } catch (error) {
          log.warn({ error: String(error), personaId }, 'Life ledger not saved');
        }
      }
      if (saved > 0) log.info({ facts: saved }, 'LIFE_LEDGER_SAVED');
      return saved;
    },
  };
}
