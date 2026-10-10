/**
 * After a call: read what became common ground (common-ground.ts) and keep
 * it under the caller, at bogle_users/{uid}/common_ground/current. Runs as an
 * after-call task, off the reply path; never throws.
 *
 * @module agents/personas/common-ground-after-call
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  commonGroundEnabled,
  EMPTY_GROUND,
  guardReading,
  mergeGround,
  type CallTurn,
  type CommonGround,
  type GroundReading,
} from './common-ground.js';

const log = createLogger({ module: 'CommonGround' });

/** The slice of storage this needs; injected so tests need no database. */
export interface GroundStore {
  load(userId: string): Promise<CommonGround>;
  save(userId: string, ground: CommonGround): Promise<void>;
}

/** Reads one call; injected so tests need no model. */
export type GroundReader = (transcript: string, known: CommonGround) => Promise<string>;

const PROMPT = `You read a phone call between Ferni (FERNI) and a caller (CALLER) and list what became common ground between them. Reply with JSON only:
{"told":[{"kind":"opinion"|"advice","text":"..."}],"references":[{"phrase":"...","meaning":"..."}]}
- told: opinions Ferni gave and advice Ferni gave this caller, third person, under 15 words ("Ferni suggested the two-minute rule for starting chores"). Not facts about Ferni's own life (kept elsewhere), not small talk.
- references: a short phrase (2 to 6 words) that BOTH of them used for something particular in this call, so it became shorthand between them ("the spreadsheet goblin"), with what it refers to in under 15 words. Not jokes, not ordinary words for ordinary things.
Reuse the wording of anything already known (below) when it comes up again. Never invent; if there is nothing, return empty lists.`;

const defaultReader: GroundReader = async (transcript, known) => {
  const { getGenerativeModel } = await import('../../config/generative-model.js');
  const model = await getGenerativeModel({
    model: process.env.COMMON_GROUND_MODEL || 'gemini-3.5-flash-lite',
    systemInstruction: PROMPT,
    generationConfig: { temperature: 0.2, maxOutputTokens: 800, responseMimeType: 'application/json' },
  });
  if (!model) return '';
  const knownText = JSON.stringify({
    told: known.told.map((t) => t.text),
    references: known.references.map((r) => r.phrase),
  });
  const result = await model.generateContent(`Already known: ${knownText}\n\nCall:\n${transcript}`);
  return result.response.text();
};

/** A reply the reader gave, as a reading; anything malformed is left out. */
export function parseReading(reply: string): GroundReading {
  try {
    const raw = JSON.parse(reply.replace(/^```(?:json)?|```$/gm, '')) as Partial<Record<string, unknown>>;
    const list = (v: unknown): Array<Record<string, unknown>> =>
      Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];
    return {
      told: list(raw.told)
        .filter((t) => typeof t.kind === 'string' && typeof t.text === 'string')
        .map((t) => ({ kind: String(t.kind), text: String(t.text).replace(/^[\s\-*\d.)]+/, '') })),
      references: list(raw.references)
        .filter((r) => typeof r.phrase === 'string' && typeof r.meaning === 'string')
        .map((r) => ({ phrase: String(r.phrase).replace(/^["']|["']$/g, ''), meaning: String(r.meaning) })),
    };
  } catch {
    return { told: [], references: [] };
  }
}

export const firestoreGroundStore: GroundStore = {
  async load(userId) {
    const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
    const doc = await getFirestoreDb()
      ?.collection('bogle_users')
      .doc(userId)
      .collection('common_ground')
      .doc('current')
      .get();
    const data = doc?.data() as Partial<CommonGround> | undefined;
    return { told: data?.told ?? [], references: data?.references ?? [] };
  },
  async save(userId, ground) {
    const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
    await getFirestoreDb()
      ?.collection('bogle_users')
      .doc(userId)
      .collection('common_ground')
      .doc('current')
      .set(ground);
  },
};

export interface GroundUpdateInput {
  userId: string;
  turns: readonly CallTurn[];
  at?: Date;
}

/** Read one finished call into the caller's common ground. Returns what was saved, or null. */
export async function updateCommonGroundAfterCall(
  input: GroundUpdateInput,
  deps: { store?: GroundStore; read?: GroundReader; env?: Record<string, string | undefined> } = {}
): Promise<CommonGround | null> {
  if (!commonGroundEnabled(deps.env)) return null;
  const turns = input.turns.filter((t) => t.content.trim());
  // Common ground needs both of them talking.
  if (turns.filter((t) => t.role === 'user').length < 2 || !turns.some((t) => t.role === 'assistant')) {
    return null;
  }
  const store = deps.store ?? firestoreGroundStore;
  try {
    const known = await store.load(input.userId).catch(() => EMPTY_GROUND);
    const transcript = turns
      .map((t) => `${t.role === 'assistant' ? 'FERNI' : 'CALLER'}: ${t.content}`)
      .join('\n');
    const reading = guardReading(parseReading(await (deps.read ?? defaultReader)(transcript, known)), turns);
    if (reading.told.length + reading.references.length === 0) return null;
    const ground = mergeGround(known, reading, (input.at ?? new Date()).toISOString());
    await store.save(input.userId, ground);
    log.info(
      { told: reading.told.length, references: reading.references.length },
      'COMMON_GROUND_SAVED'
    );
    return ground;
  } catch (error) {
    log.warn({ error: String(error) }, 'Common ground not saved');
    return null;
  }
}
