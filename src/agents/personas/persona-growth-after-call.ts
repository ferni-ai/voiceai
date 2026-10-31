/**
 * After a call (PERSONA_GROWTH): did the caller say something that changed
 * how Ferni sees a topic? If so, keep it in the persona growth profile
 * (services/trust-systems/persona-growth.ts), under the unified trust profile
 * that session start loads and persona-growth-recall.ts offers from.
 *
 * Before this, growth was detected only by a builder in the legacy registry,
 * which no call runs (L5 audit 2026-10-30): 0 records in 90 calls. This reads
 * the whole call once, off the reply path, and keeps a growth only when its
 * quote is the caller's own words from this call. Never throws.
 *
 * @module agents/personas/persona-growth-after-call
 */

import type { AfterCallContext } from '../../services/session/after-call-tasks.js';
import { envForCaller, type CohortStore } from '../../services/platform/cohort-flags.js';
import {
  getPersonaGrowthForPersistence,
  loadPersonaGrowthProfile,
  loadUnifiedProfile,
  recordPersonaGrowth,
  saveSystemData,
  type GrowthType,
  type PersonaGrowthProfile,
  type PersonaGrowthRecord,
} from '../../services/trust-systems/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import { isCrisisCall } from '../../services/wellbeing-tracking/after-call.js';
import { writeHeld } from '../../utils/minor-care.js';
import { onlyPersonaOnCall, personaGrowthEnabled } from './persona-growth-recall.js';

const log = createLogger({ module: 'PersonaGrowth' });

export const GROWTH_TASK = 'persona-growth';
/** The transcript labels Ferni's lines FERNI; another persona's call isn't his growth. */
const PERSONA = 'ferni';

/** The slice of storage this needs; injected so tests need no database. */
export interface GrowthStore {
  load(userId: string, personaId: string): Promise<PersonaGrowthProfile | null>;
  save(userId: string, personaId: string, profile: PersonaGrowthProfile): Promise<void>;
}

/** Reads one call; injected so tests need no model. */
type GrowthReader = (transcript: string) => Promise<string>;

export interface GrowthReading {
  type: GrowthType;
  topic: string;
  quote: string;
  after: string;
}

const TYPES: readonly GrowthType[] = [
  'perspective_shift',
  'learned_from_user',
  'reconsidered',
  'expanded_view',
  'softened_stance',
];

const PROMPT = `You read a phone call between Ferni (FERNI), a friend, and a caller (CALLER). Find at most one moment where the caller said something that could really change how Ferni sees a topic: their own take, an approach that works for them, something life taught them, or a pushback on what Ferni said. Most calls have none. Reply with JSON only:
{"growth":null} or {"growth":{"type":"perspective_shift"|"learned_from_user"|"reconsidered"|"expanded_view"|"softened_stance","topic":"2 to 6 words","quote":"the caller's exact words, copied from one CALLER line, 6 to 40 words","after":"how Ferni sees the topic now, under 20 words"}}
- Only a view or a way of handling something. Not facts about their life, not plans, not small talk, not praise for Ferni.
- On a call about a crisis, a loss or a health scare, return {"growth":null}.
- Copy the quote exactly. Never invent; if unsure, return {"growth":null}.`;

const defaultReader: GrowthReader = async (transcript) => {
  const { getGenerativeModel } = await import('../../config/generative-model.js');
  const model = await getGenerativeModel({
    model: process.env.PERSONA_GROWTH_MODEL || 'gemini-3.5-flash-lite',
    systemInstruction: PROMPT,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 300,
      responseMimeType: 'application/json',
    },
  });
  if (!model) return '';
  return (await model.generateContent(`Call:\n${transcript}`)).response.text();
};

const norm = (t: string): string =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const words = (t: string): number => t.trim().split(/\s+/).filter(Boolean).length;

/** A reply the reader gave, as a reading, or null when it found none or is malformed. */
export function parseGrowthReading(reply: string): GrowthReading | null {
  try {
    const raw = JSON.parse(reply.replace(/^```(?:json)?|```$/gm, '')) as { growth?: unknown };
    const g = raw.growth as Partial<Record<keyof GrowthReading, unknown>> | null | undefined;
    if (!g || typeof g !== 'object') return null;
    const { type, topic, quote, after } = g;
    if (typeof type !== 'string' || !TYPES.includes(type as GrowthType)) return null;
    if (typeof topic !== 'string' || typeof quote !== 'string' || typeof after !== 'string')
      return null;
    return {
      type: type as GrowthType,
      topic: topic.trim(),
      quote: quote.trim(),
      after: after.trim(),
    };
  } catch {
    return null;
  }
}

/** Kept only when the call shows it: the quote ends a sentence of one of the caller's own lines. */
export function guardGrowthReading(
  reading: GrowthReading | null,
  callerLines: readonly string[]
): GrowthReading | null {
  if (!reading) return null;
  const q = norm(reading.quote);
  const fits =
    words(reading.topic) >= 1 &&
    words(reading.topic) <= 6 &&
    words(reading.quote) >= 6 &&
    words(reading.quote) <= 40 &&
    words(reading.after) >= 3 &&
    words(reading.after) <= 20 &&
    callerLines.some((line) => endsASentence(line, q));
  return fits ? reading : null;
}

/**
 * The quote is a whole sentence or clause of the caller's line, or its end: a
 * piece cut off before "but not when..." or "..., not after" can mean the
 * opposite of what they said.
 */
function endsASentence(line: string, quote: string): boolean {
  return line
    .split(/[.!?;]+/)
    .map(norm)
    .some((s) => s === quote || s.endsWith(` ${quote}`));
}

const unifiedGrowthStore: GrowthStore = {
  async load(userId, personaId) {
    const all = (await loadUnifiedProfile(userId))?.systems.personaGrowth as
      Record<string, PersonaGrowthProfile> | undefined;
    return all?.[personaId] ?? null;
  },
  async save(userId, personaId, profile) {
    // Keep the other personas' growth: the system holds one profile per persona.
    const all = ((await loadUnifiedProfile(userId))?.systems.personaGrowth ?? {}) as Record<
      string,
      unknown
    >;
    await saveSystemData(
      userId,
      'personaGrowth',
      { ...all, [personaId]: profile },
      { immediate: true }
    );
  },
};

export interface GrowthDeps {
  store?: GrowthStore;
  read?: GrowthReader;
  env?: NodeJS.ProcessEnv;
  cohorts?: CohortStore;
  /** Crisis risk noted on the call (crisis-call-risk.ts); injected for tests. */
  crisisRisk?: (sessionId: string) => boolean;
}

/**
 * A member's own account only (never a placeholder or shared id, never a held caller),
 * and Ferni's call with only Ferni on it: after a handoff the lines aren't all his.
 */
function membersFerniOnlyCall(
  ctx: Pick<AfterCallContext, 'userId' | 'sessionId' | 'personaId'>
): boolean {
  if (!isMemberIdentity(ctx.userId) || writeHeld(ctx.userId, ctx.sessionId)) return false;
  if (ctx.personaId && ctx.personaId !== PERSONA) return false;
  return onlyPersonaOnCall(ctx.sessionId) === PERSONA;
}

/** Read one finished call for growth. Returns the kept record, or null. */
export async function recordGrowthAfterCall(
  ctx: Pick<AfterCallContext, 'userId' | 'sessionId' | 'personaId' | 'turns'>,
  deps: GrowthDeps = {}
): Promise<PersonaGrowthRecord | null> {
  if (!membersFerniOnlyCall(ctx)) return null;
  const turns = ctx.turns.filter((t) => t.content.trim());
  const callerLines = turns.filter((t) => t.role === 'user').map((t) => t.content);
  if (callerLines.length < 3 || !turns.some((t) => t.role === 'assistant')) return null;
  // After the call, process.env may already hold the next caller's flags.
  const env = await envForCaller(ctx.userId, { env: deps.env, store: deps.cohorts });
  if (!personaGrowthEnabled(env)) return null;
  // Before any model read: nothing from a call with a crisis signal is kept as growth.
  if (isCrisisCall(ctx, deps.crisisRisk)) {
    log.info({ sessionId: ctx.sessionId }, 'PERSONA_GROWTH_SKIPPED_CRISIS');
    return null;
  }
  const store = deps.store ?? unifiedGrowthStore;
  try {
    const transcript = turns
      .map((t) => `${t.role === 'assistant' ? 'FERNI' : 'CALLER'}: ${t.content}`)
      .join('\n');
    const reading = guardGrowthReading(
      parseGrowthReading(await (deps.read ?? defaultReader)(transcript)),
      callerLines
    );
    if (!reading) return null;
    // Add to the profile in memory (loaded at session start, saved again at cleanup), so the
    // two writers save the same thing; load it first when this process doesn't have it.
    if (!getPersonaGrowthForPersistence(ctx.userId, PERSONA)) {
      const stored = await store.load(ctx.userId, PERSONA);
      if (stored) loadPersonaGrowthProfile(ctx.userId, PERSONA, stored);
    }
    const record = recordPersonaGrowth({
      userId: ctx.userId,
      personaId: PERSONA,
      growthType: reading.type,
      topic: reading.topic,
      beforeThinking: '',
      afterThinking: reading.after,
      userContribution: reading.quote,
      triggerQuote: reading.quote,
    });
    const profile = getPersonaGrowthForPersistence(ctx.userId, PERSONA);
    if (profile) await store.save(ctx.userId, PERSONA, profile);
    log.info({ growthType: record.growthType }, 'PERSONA_GROWTH_SAVED');
    return record;
  } catch (error) {
    log.warn({ error: String(error) }, 'Persona growth not saved');
    return null;
  }
}
