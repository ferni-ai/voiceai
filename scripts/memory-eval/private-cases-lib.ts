/**
 * The pure half of build-private-cases.ts: real calls grouped into
 * histories, a prompt that writes questions from the raw transcripts, and a
 * check that every gold answer quotes what the caller actually said.
 */
import {
  CATEGORIES,
  RunDays,
  callerZone,
  daysBetween,
  localDay,
  type CaseFile,
  type MemoryCategory,
  type MemoryHistory,
} from './longmem-lib.js';

export interface StoredCall {
  id: string;
  /** When the call started (ms). */
  at: number;
  /** The caller's own lines, in order. */
  user: string[];
}

/** A positive integer flag, or the fallback when it is absent. */
export function positiveInt(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1)
    throw new Error(`${name} must be a positive integer: ${value}`);
  return n;
}

/**
 * Consecutive calls, `perHistory` at a time, as histories dated back from the
 * run date. Ages count whole calendar days in the caller's zone, so a call
 * late at night still lands on the day it happened.
 */
export function groupIntoHistories(
  calls: readonly StoredCall[],
  perHistory: number,
  maxHistories: number,
  runDate: string,
  name: string,
  zone: string = callerZone()
): MemoryHistory[] {
  const sorted = [...calls].sort((a, b) => a.at - b.at);
  const histories: MemoryHistory[] = [];
  for (
    let i = 0;
    i + perHistory <= sorted.length && histories.length < maxHistories;
    i += perHistory
  ) {
    histories.push({
      id: `real-${histories.length + 1}`,
      name,
      sessions: sorted.slice(i, i + perHistory).map((c) => ({
        daysAgo: Math.max(1, daysBetween(localDay(c.at, zone), runDate)),
        user: c.user,
      })),
    });
  }
  return histories;
}

/**
 * Categories the generator writes. Restraint needs a judgement of what is
 * sensitive, and opener is a greeting the prompt never describes, so neither is here.
 */
export const GENERATED: readonly MemoryCategory[] = CATEGORIES.filter(
  (c) => c !== 'restraint' && c !== 'opener'
);

/** Ask a model to write questions only the transcripts can answer, each with a quote as evidence. */
export function generationPrompt(
  history: MemoryHistory,
  runDate: string,
  perCategory: number
): string {
  const runDays = new RunDays(runDate);
  const calls = history.sessions
    .map(
      (s, i) =>
        `Call ${i + 1} (${runDays.sessionDay(s.daysAgo)}):\n${s.user.map((u) => `- ${u}`).join('\n')}`
    )
    .join('\n\n');
  return [
    `These are everything ${history.name} said on ${history.sessions.length} calls with a friend. Today is ${runDate}.`,
    '',
    calls,
    '',
    `Write up to ${perCategory} test questions per category that ${history.name} might ask the friend later, to check what the friend remembers. Categories:`,
    '- single-session: a fact said once',
    '- multi-session: needs facts from two different calls',
    '- temporal: a date or day (give gold dates as YYYY-MM-DD)',
    '- knowledge-update: something that changed between calls; only the newest is right',
    '- abstention: something plausible that was never said; gold is "never said"',
    '- false-premise: a question that assumes something untrue (wrong name, wrong relation, wrong place); gold says what is actually true or that it was never said',
    '- unprompted: a remark (not a question) after which a friend who remembers would bring something up; gold is what they should bring up',
    'Rules: only use what the transcripts say. Skip a category rather than stretch. Questions are in first person, as the caller would say them.',
    'For every case except abstention, "evidence" lists the exact words from the transcript that support the gold answer, copied character for character.',
    'Reply with only a JSON array: [{"category": "...", "ask": "...", "gold": "...", "evidence": ["..."]}]',
  ].join('\n');
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Whether a quote is really in what the caller said, as whole words. A
 * substring match would take "art" from "party"; a one-word quote is too
 * easy to find by chance, so it must be 3 words or 12 characters.
 */
export function quoteFound(quote: string, said: string): boolean {
  const q = norm(quote);
  if (q.split(' ').length < 3 && q.length < 12) return false;
  return ` ${said} `.includes(` ${q} `);
}

export interface GeneratedCase {
  category: MemoryCategory;
  ask: string;
  gold: string;
  evidence: string[];
}

/** The JSON array in a reply: from the first "[" to the last "]", so a code fence or a sentence around it is ignored. */
function arrayIn(raw: string): unknown[] | null {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end < start) return null;
  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The generated cases whose evidence really is in what the caller said
 * (ignoring case and punctuation). Abstention needs none; every other case
 * needs at least one quote, and every quote must be found. A reply with no
 * JSON array sets parseError, so a failed call is not mistaken for no cases.
 */
export function verifiedCases(
  raw: string,
  history: MemoryHistory
): { kept: GeneratedCase[]; dropped: number; parseError: boolean } {
  const said = norm(history.sessions.flatMap((s) => s.user).join(' '));
  const parsed = arrayIn(raw);
  if (!parsed) return { kept: [], dropped: 0, parseError: true };
  const kept: GeneratedCase[] = [];
  let dropped = 0;
  for (const item of parsed as Array<Partial<GeneratedCase>>) {
    const category = item.category as MemoryCategory;
    const evidence = Array.isArray(item.evidence) ? item.evidence.map(String) : [];
    const ok =
      GENERATED.includes(category) &&
      typeof item.ask === 'string' &&
      item.ask.trim() !== '' &&
      typeof item.gold === 'string' &&
      item.gold.trim() !== '' &&
      (category === 'abstention' ||
        (evidence.length > 0 && evidence.every((q) => quoteFound(q, said))));
    if (ok) kept.push({ category, ask: item.ask!.trim(), gold: item.gold!.trim(), evidence });
    else dropped++;
  }
  return { kept, dropped, parseError: false };
}

export function caseFile(
  runDate: string,
  histories: MemoryHistory[],
  cases: Map<string, GeneratedCase[]>
): CaseFile {
  return {
    runDate,
    histories,
    cases: histories.flatMap((h) =>
      (cases.get(h.id) ?? []).map((c) => ({
        history: h.id,
        category: c.category,
        ask: c.ask,
        gold: c.gold,
      }))
    ),
  };
}
