/**
 * After a call, read what the caller said as a whole and keep the facts the
 * line-by-line extractor missed.
 *
 * The extractor reads one utterance at a time, and only after a regex gate
 * (fast-capture.ts) finds a name, a date or a topic in it. On Seth's real
 * calls (memory benchmark, 2026-10-11) that kept the fact a question needed
 * for 5 to 10 of 29 questions, though he had said it for 24. Of the misses,
 * most were a fact spread over several lines ("could you call my brother?",
 * "his name is Pete", "it's uh 435 555 0188"), then lines the gate dropped,
 * then a line that names its subject only as "he" or "that". Showing the
 * extractor earlier lines (EXTRACTION_CONTEXT) still extracts per line.
 *
 * So once a call ends, its caller lines are read in a few overlapping
 * windows, each with one model call that joins what was said across lines,
 * reads through fillers and speech-to-text slips, and names people as they
 * were named. Facts already stored are listed so they aren't repeated, and
 * a fact whose document already exists is never overwritten. New facts go
 * to dynamic_facts like any other, so recall, supersession and forgetting
 * treat them the same.
 *
 * Off by default; FACT_SWEEP=on turns it on.
 *
 * @module memory/dynamic/fact-sweep
 */
import { createLogger } from '../../utils/safe-logger.js';
import { callMomentLine } from '../operations/call-moment.js';
import type { ExtractedFact } from './deep-extraction-worker.js';
import { buildExtractionFirestoreWritePayloads, factDocId } from './extraction-firestore-docs.js';
import { isValidFact } from './extraction-vector-docs.js';

const log = createLogger({ module: 'fact-sweep' });

export function factSweepEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.FACT_SWEEP === 'on';
}

/** Lines per window and how far each moves on, so a fact across a boundary is read whole once. */
const WINDOW = 14;
const STRIDE = 11;
/** A long call is read in at most this many windows (its last lines are the freshest). */
const MAX_WINDOWS = 6;
/** Stored facts listed so the model doesn't repeat them; the prompt stays small. */
const MAX_KNOWN = 80;
const FACT_TYPES = new Set(['attribute', 'event', 'relationship', 'state', 'preference']);

export interface SweepWindow {
  /** Index of the window's first line among the caller's lines. */
  start: number;
  lines: string[];
}

/** Overlapping windows of the caller's lines; the last MAX_WINDOWS when the call is long. */
export function sweepWindows(lines: readonly string[]): SweepWindow[] {
  const kept = lines.map((l) => l.trim()).filter((l) => l.split(/\s+/).length >= 2);
  const out: SweepWindow[] = [];
  for (let start = 0; start < kept.length; start += STRIDE) {
    out.push({ start, lines: kept.slice(start, start + WINDOW) });
    if (start + WINDOW >= kept.length) break;
  }
  return out.slice(-MAX_WINDOWS);
}

export function sweepPrompt(window: SweepWindow, known: readonly string[], moment: string): string {
  return [
    'Below is what a caller said on one phone call with an AI friend, transcribed by speech-to-text. It has fillers, restarts and transcription slips, and one thing is often said over several lines ("could you call my brother?" / "his name is Pete" / "it\'s uh 435 555 0188").',
    moment,
    "List every specific detail about the caller's life a friend would want to remember on a later call, even one said in passing: people (by name, and how they relate to the caller), numbers, places, work, plans and when, health, pets, things that happened, opinions and preferences.",
    '- Read through fillers, restarts and slips; join a fact said across lines into one fact.',
    '- Name people and things as they were named, never "he", "she", "him", "it" or "they". Use "User" for the caller.',
    '- Only what the caller said or clearly meant. Skip requests to the assistant, small talk, and anything already known (below).',
    known.length > 0
      ? `Already known:\n${known.map((k) => `- ${k}`).join('\n')}`
      : 'Already known: nothing yet.',
    `What the caller said:\n${window.lines.map((l) => `- ${l}`).join('\n')}`,
    'Reply with a JSON array only, each item {"entityName", "factType" (attribute|event|relationship|state|preference), "key", "value", "confidence" (0-1), "temporalContext"}. Reply [] if there is nothing new.',
  ].join('\n');
}

/** The model's facts, valid ones only; [] for anything unreadable. */
export function parseSweep(reply: string | null): ExtractedFact[] {
  const json = reply?.match(/\[[\s\S]*\]/)?.[0];
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidFact).map((f) => ({
    entityName: String(f.entityName).trim(),
    factType: FACT_TYPES.has(f.factType) ? f.factType : 'attribute',
    key: String(f.key).trim(),
    value: String(f.value).trim(),
    confidence: typeof f.confidence === 'number' ? Math.max(0, Math.min(1, f.confidence)) : 0.7,
    ...(typeof f.temporalContext === 'string' && { temporalContext: f.temporalContext }),
  }));
}

export interface StoredFactRow {
  entityName: string;
  key: string;
  value: string;
}

export interface SweepStore {
  /** The caller's stored facts, newest first. */
  facts: (userId: string) => Promise<StoredFactRow[]>;
  /** Writes each new fact document; an id that already exists is left as it is. */
  add: (
    userId: string,
    docs: ReadonlyArray<{ id: string; data: Record<string, unknown> }>
  ) => Promise<number>;
}

export type SweepLLM = (prompt: string) => Promise<string | null>;

/**
 * Reads the call's caller lines in windows and stores the facts not already
 * known. Returns how many were added. Windows run one after another, each
 * seeing the facts the earlier ones found.
 */
export async function sweepCall(
  call: {
    userId: string;
    sessionId: string;
    startedAt: Date;
    lines: readonly string[];
    timeZone?: string;
  },
  deps: { llm: SweepLLM; store: SweepStore; now?: Date }
): Promise<number> {
  const { store } = deps;
  const windows = sweepWindows(call.lines);
  if (windows.length === 0) return 0;
  const stored = await store.facts(call.userId);
  const seen = new Set(stored.map((f) => factDocId(f.entityName, f.key, f.value)));
  const known = stored.slice(0, MAX_KNOWN).map((f) => `${f.entityName} | ${f.key} = ${f.value}`);
  const moment = callMomentLine(call.startedAt, call.timeZone);
  const at = (deps.now ?? new Date()).toISOString();
  let added = 0;
  for (const window of windows) {
    // One window at a time, so each sees what the earlier ones found.
    // eslint-disable-next-line no-await-in-loop
    const found = parseSweep(await deps.llm(sweepPrompt(window, known, moment)));
    const { facts } = buildExtractionFirestoreWritePayloads(
      call.userId,
      { entities: [], facts: found, relationships: [] },
      { sessionId: call.sessionId, turnNumber: window.start, writer: 'sweep' },
      at,
      log
    );
    const docs = facts
      .map((data) => ({
        id: factDocId(String(data.entityName), String(data.key), String(data.value)),
        data: { ...data, source: 'call_sweep' } as Record<string, unknown>,
      }))
      .filter((d) => !seen.has(d.id));
    for (const d of docs) seen.add(d.id);
    // Later windows see what earlier ones found.
    known.push(...found.map((f) => `${f.entityName} | ${f.key} = ${f.value}`));
    // eslint-disable-next-line no-await-in-loop
    if (docs.length > 0) added += await store.add(call.userId, docs);
  }
  if (added > 0)
    log.info({ userId: call.userId.slice(0, 8), added, windows: windows.length }, 'Call swept');
  return added;
}
