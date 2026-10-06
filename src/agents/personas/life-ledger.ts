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
 * LIFE_LEDGER=off turns it off.
 *
 * @module agents/personas/life-ledger
 */

import { createHash } from 'node:crypto';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'LifeLedger' });

export function lifeLedgerEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.LIFE_LEDGER !== 'off';
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
const contentWords = (t: string): Set<string> =>
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
    'This is your life: stay consistent with it, and if it fits, pick a thread back up the way a friend would ("the goat got out again"). Don\'t repeat these back or list them.',
  ].join('\n');
}

const EXTRACT_PROMPT = (name: string) =>
  `Below are things ${name} said on a phone call. List the concrete things ${name} said about ${name}'s OWN life: what happened to them, people and pets in their life, places, habits, opinions and plans. One per line, under 15 words, in the third person ("${name}'s wife teases him about his coffee"). Leave out anything about the other person, advice, and generic small talk. If there is nothing, reply NONE.`;

const defaultExtractor: FactExtractor = async (name, lines) => {
  const { getGenerativeModel } = await import('../../config/generative-model.js');
  const model = await getGenerativeModel({
    model: process.env.LIFE_LEDGER_MODEL || 'gemini-3.5-flash-lite',
    systemInstruction: EXTRACT_PROMPT(name),
    generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
  });
  if (!model) return [];
  const result = await model.generateContent(lines.map((l) => `- ${l}`).join('\n'));
  const text = result.response.text().trim();
  return /^none\b/i.test(text) ? [] : text.split('\n');
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
  deps: { store?: LedgerStore; extract?: FactExtractor; now?: () => number } = {}
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
          const facts = groundedFacts(raw, said).map((fact) => ({ personaId, fact, saidAt }));
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
