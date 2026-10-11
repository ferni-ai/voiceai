/**
 * The pure half of build-private-cases.ts: real calls grouped into
 * histories, a prompt that writes questions from the raw transcripts, and a
 * check that every gold answer quotes what the caller actually said.
 */
import {
  CATEGORIES,
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

const DAY_MS = 86_400_000;

/** Consecutive calls, `perHistory` at a time, as histories dated back from the run date. */
export function groupIntoHistories(
  calls: readonly StoredCall[],
  perHistory: number,
  maxHistories: number,
  runDate: string,
  name: string
): MemoryHistory[] {
  const base = Date.parse(`${runDate}T12:00:00Z`);
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
        daysAgo: Math.max(1, Math.round((base - c.at) / DAY_MS)),
        user: c.user,
      })),
    });
  }
  return histories;
}

/** Categories the generator writes (restraint needs a judgement of what is sensitive, so not here). */
export const GENERATED: readonly MemoryCategory[] = CATEGORIES.filter((c) => c !== 'restraint');

/** Ask a model to write questions only the transcripts can answer, each with a quote as evidence. */
export function generationPrompt(
  history: MemoryHistory,
  runDate: string,
  perCategory: number
): string {
  const day = (daysAgo: number) =>
    new Date(Date.parse(`${runDate}T12:00:00Z`) - daysAgo * DAY_MS).toISOString().slice(0, 10);
  const calls = history.sessions
    .map((s, i) => `Call ${i + 1} (${day(s.daysAgo)}):\n${s.user.map((u) => `- ${u}`).join('\n')}`)
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

export interface GeneratedCase {
  category: MemoryCategory;
  ask: string;
  gold: string;
  evidence: string[];
}

/**
 * The generated cases whose evidence really is in what the caller said
 * (ignoring case and punctuation). Abstention needs none; every other case
 * needs at least one quote, and every quote must be found.
 */
export function verifiedCases(
  raw: string,
  history: MemoryHistory
): { kept: GeneratedCase[]; dropped: number } {
  const said = norm(history.sessions.flatMap((s) => s.user).join(' '));
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return { kept: [], dropped: 0 };
  }
  if (!Array.isArray(parsed)) return { kept: [], dropped: 0 };
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
        (evidence.length > 0 && evidence.every((q) => norm(q) !== '' && said.includes(norm(q)))));
    if (ok) kept.push({ category, ask: item.ask!.trim(), gold: item.gold!.trim(), evidence });
    else dropped++;
  }
  return { kept, dropped };
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
