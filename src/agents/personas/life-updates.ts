/**
 * Ferni's own life moves on between calls.
 *
 * The life ledger (life-ledger.ts) keeps what he told a caller about himself,
 * so he can pick a thread back up. But the thread never advances: the basil he
 * was trying to save last week is still dying this week. A friend's life moves
 * on between calls.
 *
 * When a call starts and the ledger holds something ongoing that he told at
 * least a day ago (a plant, a trip being planned, a project, a book), a small
 * model writes one or two mundane developments since then ("The basil didn't
 * make it; you've started a rosemary instead."). They go in the first recall
 * note as [SINCE YOU LAST TALKED], to mention only if it comes up.
 *
 * They are not written to the ledger: a development only becomes something he
 * told once he says it, and the ledger's own capture records that. Until then
 * it is kept under the caller as a pending update, and the next call reuses it
 * instead of inventing another one that could contradict it.
 *
 * LIFE_MOVES_ON=on turns it on (off by default).
 *
 * @module agents/personas/life-updates
 */

import { createHash } from 'node:crypto';
import { createLogger } from '../../utils/safe-logger.js';
import { contentWords, type LedgerFact } from './life-ledger.js';

const log = createLogger({ module: 'LifeUpdates' });

export function lifeMovesOnEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.LIFE_MOVES_ON === 'on';
}

export interface LifeUpdate {
  personaId: string;
  update: string;
  /** ISO time it was written. */
  createdAt: string;
}

/** Where pending updates are kept per caller; injected so tests need no database. */
export interface LifeUpdateStore {
  save: (userId: string, updates: LifeUpdate[]) => Promise<void>;
  recent: (userId: string, personaId: string, limit: number) => Promise<LifeUpdate[]>;
}

/** Writes what happened since, from dated facts; injected so tests need no model. */
export type DevelopmentWriter = (personaName: string, facts: string[]) => Promise<string[]>;

export interface LifeUpdateDeps {
  store?: LifeUpdateStore;
  write?: DevelopmentWriter;
  now?: () => number;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

const DAY_MS = 86_400_000;
const MAX_UPDATES = 2;
const MAX_UPDATE_WORDS = 22;
/** An unspoken update this old is dropped and his life can move on again. */
const PENDING_MAX_DAYS = 21;
const TIMEOUT_MS = 2_500;

/** Something still in progress when he told it. Whole words only. */
const ONGOING =
  /\b(trying|planning|plans?|reading|building|learning|working on|started|starting|growing|fixing|restoring|training|saving up|thinking about|hoping|going to|project|book|novel|trip|garden|gardening|plants?|seedlings?|basil|tomato(es)?|sourdough|puzzle|class|course|renovating|repainting|practicing)\b/i;

/** Nothing heavy: these are small, warm, low-stakes developments. */
const UNSAFE =
  /\b(died|dies|dying|death|dead|passed away|funeral|hospital|sick|illness|ill|cancer|surgery|injur(y|ed|ies)|accident|divorce|broke up|breakup|fired|laid off|lost (his|her|my|your) job|vet|emergency|diagnos\w*|debt|evicted|fight|argument)\b/i;

/** Clean the model's lines: short, safe, once each, at most two. */
export function safeUpdates(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw) {
    const text = line.replace(/^[\s\-*\d.)]+/, '').trim();
    if (!text || /^none\b/i.test(text) || text.split(/\s+/).length > MAX_UPDATE_WORDS) continue;
    if (UNSAFE.test(text) || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
  }
  return out.slice(0, MAX_UPDATES);
}

/** The line added to the first recall note, or null when there is nothing. */
export function formatLifeUpdates(updates: LifeUpdate[]): string | null {
  if (updates.length === 0) return null;
  return [
    '[SINCE YOU LAST TALKED]',
    ...updates.map((u) => `- ${u.update}`),
    "Only if they ask how you've been, and one at a time. When they're telling you about their own day, stay with them; don't bring these up.",
  ].join('\n');
}

const DEVELOP_PROMPT = (name: string): string =>
  `${name} is a warm, ordinary person. Below are things ${name} told a friend on earlier calls, with how long ago. For at most two of them that were still ongoing (a plant, a trip being planned, a project, a book), write what has happened since, one short line each, speaking to ${name} as "you" ("The basil didn't make it; you've started a rosemary instead."). Keep it mundane, warm and low-stakes, and consistent with every fact listed. No illness, injury, death of people or pets, money trouble, breakups or other drama. Under 20 words each. If nothing was ongoing, reply NONE.`;

const defaultWriter: DevelopmentWriter = async (name, facts) => {
  const { getGenerativeModel } = await import('../../config/generative-model.js');
  const model = await getGenerativeModel({
    model: process.env.LIFE_LEDGER_MODEL || 'gemini-3.5-flash-lite',
    systemInstruction: DEVELOP_PROMPT(name),
    generationConfig: { temperature: 0.7, maxOutputTokens: 120 },
  });
  if (!model) return [];
  const result = await model.generateContent(facts.join('\n'));
  return result.response.text().trim().split('\n');
};

export function updateDocId(u: LifeUpdate): string {
  return `${u.personaId}_${createHash('sha1').update(u.update.toLowerCase()).digest('hex').slice(0, 16)}`;
}

export const firestoreLifeUpdateStore: LifeUpdateStore = {
  async save(userId, updates) {
    const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return;
    const col = db.collection('bogle_users').doc(userId).collection('persona_life_updates');
    const batch = db.batch();
    for (const u of updates) batch.set(col.doc(updateDocId(u)), u, { merge: true });
    await batch.commit();
  },
  async recent(userId, personaId, limit) {
    const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('persona_life_updates')
      .orderBy('createdAt', 'desc')
      .limit(limit * 3)
      .get();
    return snap.docs
      .map((d) => d.data() as LifeUpdate)
      .filter((u) => u.personaId === personaId)
      .slice(0, limit);
  },
};

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * He said it on a later call: a fact told after it shares at least two content
 * words with it. Live, "The basil didn't make it; you've started a rosemary"
 * came back as "basil plant did not survive" + "now has a rosemary plant": a
 * half-the-words match never fired and the update repeated on every call.
 */
function spoken(u: LifeUpdate, told: LedgerFact[]): boolean {
  const said = new Set(
    told
      .filter((f) => Date.parse(f.saidAt) > Date.parse(u.createdAt))
      .flatMap((f) => [...contentWords(f.fact)])
  );
  return [...contentWords(u.update)].filter((w) => said.has(w)).length >= 2;
}

/**
 * What has happened in his life since he last told this caller about it:
 * pending updates if there are any, otherwise freshly written ones. Never
 * throws; any failure or a slow model gives nothing.
 */
export async function loadLifeUpdates(
  userId: string,
  told: LedgerFact[],
  personaId = 'ferni',
  deps: LifeUpdateDeps = {}
): Promise<LifeUpdate[]> {
  if (!lifeMovesOnEnabled(deps.env) || told.length === 0) return [];
  const now = (deps.now ?? Date.now)();
  const store = deps.store ?? firestoreLifeUpdateStore;
  try {
    const stored = await store.recent(userId, personaId, 6);
    const pending = stored.filter(
      (u) => now - Date.parse(u.createdAt) < PENDING_MAX_DAYS * DAY_MS && !spoken(u, told)
    );
    if (pending.length > 0) {
      log.info({ updates: pending.length }, 'LIFE_UPDATES_PENDING');
      return pending.slice(0, MAX_UPDATES);
    }
    // At most one new development a day, however many calls.
    if (stored.some((u) => now - Date.parse(u.createdAt) < DAY_MS)) {
      log.info({ reason: 'written_today' }, 'LIFE_UPDATES_SKIPPED');
      return [];
    }

    const threads = told.filter(
      (f) => now - Date.parse(f.saidAt) >= DAY_MS && ONGOING.test(f.fact)
    );
    if (threads.length === 0) {
      log.info({ reason: 'no_ongoing_thread', told: told.length }, 'LIFE_UPDATES_SKIPPED');
      return [];
    }
    const dated = told.map((f) => {
      const days = Math.floor((now - Date.parse(f.saidAt)) / DAY_MS);
      return `- ${f.fact} (${days < 1 ? 'today' : `${days} days ago`})`;
    });
    const name = personaId === 'ferni' ? 'Ferni' : personaId.split('-')[0];
    const raw = await withTimeout(
      (deps.write ?? defaultWriter)(name, dated),
      deps.timeoutMs ?? TIMEOUT_MS
    );
    const createdAt = new Date(now).toISOString();
    const updates = safeUpdates(raw).map((update) => ({ personaId, update, createdAt }));
    if (updates.length === 0) {
      log.info({ reason: 'none_written', raw: raw.length }, 'LIFE_UPDATES_SKIPPED');
      return [];
    }
    await store.save(userId, updates);
    log.info({ updates: updates.length }, 'LIFE_UPDATES_WRITTEN');
    return updates;
  } catch (error) {
    log.warn({ error: String(error) }, 'Life updates not loaded');
    return [];
  }
}
