/**
 * The crisis adjudicator replay's inputs, shared by the replay script
 * (adjudicator-eval.ts) and its CI test: the 2026-10-17 fixture with a
 * schema check, the everyday context a case without one gets, and the
 * script's flags. No network, no side effects on import.
 */

import { readFileSync } from 'node:fs';
import { DEFAULT_CRISIS_ADJUDICATOR_TIMEOUT_MS } from '../../src/services/safety/crisis-adjudicator.js';

export const ADJUDICATOR_FIXTURE_PATH =
  'src/agents/__tests__/fixtures/crisis-adjudicator-2026-10-17.json';

export const FIXTURE_KINDS = [
  'verifier_context',
  'verifier_standalone',
  'everyday_call_flow',
  'cascade_after_false_alarm',
  'relay1484_risk',
  'relay1484_benign',
  'relay1484_goodbye',
] as const;

export interface AdjudicatorFixtureRow {
  text: string;
  label: 'block' | 'crisis' | 'none';
  kind: (typeof FIXTURE_KINDS)[number];
  earlier?: string[];
  companion?: string;
  /** The classifier's read, when a case pins one; otherwise crisis. */
  read?: 'imminent' | 'crisis';
}

const KEYS = new Set(['text', 'label', 'kind', 'earlier', 'companion', 'read']);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** The fixture rows, or a throw naming the first row that breaks the schema. */
export function parseAdjudicatorFixture(raw: unknown): AdjudicatorFixtureRow[] {
  if (!Array.isArray(raw)) throw new Error('fixture: not an array');
  return raw.map((row: unknown, i): AdjudicatorFixtureRow => {
    const fail = (why: string): never => {
      throw new Error(`fixture row ${i}: ${why}`);
    };
    if (typeof row !== 'object' || row === null) return fail('not an object');
    const r = row as Record<string, unknown>;
    const extra = Object.keys(r).filter((k) => !KEYS.has(k));
    if (extra.length) fail(`unknown keys ${extra.join(',')}`);
    if (!isText(r.text)) fail('text must be a non-empty string');
    if (r.label !== 'block' && r.label !== 'crisis' && r.label !== 'none') fail('bad label');
    if (!FIXTURE_KINDS.includes(r.kind as AdjudicatorFixtureRow['kind'])) fail('bad kind');
    if (r.earlier !== undefined && !(Array.isArray(r.earlier) && r.earlier.every(isText)))
      fail('earlier must be non-empty strings');
    if (r.companion !== undefined && !isText(r.companion)) fail('companion must be text');
    if (r.read !== undefined && r.read !== 'imminent' && r.read !== 'crisis') fail('bad read');
    const positive = r.label !== 'none';
    const riskKind = String(r.kind).startsWith('verifier') || r.kind === 'relay1484_risk';
    if (positive !== riskKind) fail(`label ${String(r.label)} does not fit kind ${String(r.kind)}`);
    return r as unknown as AdjudicatorFixtureRow;
  });
}

export function loadAdjudicatorFixture(path = ADJUDICATOR_FIXTURE_PATH): AdjudicatorFixtureRow[] {
  return parseAdjudicatorFixture(JSON.parse(readFileSync(path, 'utf8')) as unknown);
}

/** For cases with no earlier caller line: everyday openers, the call-my-mom shape among them. */
export const NEUTRAL_EARLIER = ['hey ferni', 'Can you call my mom for me?', 'work was fine today'];
/** For cases with no Ferni line. */
export const NEUTRAL = [
  "Hey, good to hear from you. What's going on today?",
  'Sure, I can do that. Who should I call?',
  'Got it. Anything else?',
];

export interface EvalTurn {
  latest: string;
  earlier: string[];
  companion?: string;
}

/**
 * The turn as the replay sends it: a missing earlier caller line or Ferni line
 * gets an everyday one, rotated by read, so the model (not the context rule)
 * has to catch the case.
 */
export function withEverydayContext(turn: EvalTurn, rep: number): EvalTurn {
  // Never the caller's own line: transcriptFrom drops an earlier line equal to
  // the latest, which would leave no context and escalate without a read.
  const opener = [0, 1, 2]
    .map((i) => NEUTRAL_EARLIER[(rep + i) % NEUTRAL_EARLIER.length])
    .find((line) => line.trim().toLowerCase() !== turn.latest.trim().toLowerCase());
  return {
    latest: turn.latest,
    earlier: turn.earlier.length ? turn.earlier : [opener ?? NEUTRAL_EARLIER[0]],
    companion: turn.companion || NEUTRAL[rep % NEUTRAL.length],
  };
}

export interface EvalArgs {
  /** Per-read adjudicator timeout; production's (1.2 s) unless --timeout-ms is given. */
  timeoutMs: number;
  /** Optional JSONL of private false alarms. */
  privateFile?: string;
}

/** `[--timeout-ms=<ms>] [private.jsonl]`. */
export function parseEvalArgs(argv: readonly string[]): EvalArgs {
  let timeoutMs = DEFAULT_CRISIS_ADJUDICATOR_TIMEOUT_MS;
  let privateFile: string | undefined;
  for (const arg of argv) {
    const flag = /^--timeout-ms=(.*)$/.exec(arg);
    if (flag) {
      const ms = Number(flag[1]);
      if (!Number.isFinite(ms) || ms <= 0) throw new Error(`bad --timeout-ms: ${flag[1]}`);
      timeoutMs = ms;
    } else if (arg.startsWith('--')) {
      throw new Error(`unknown flag ${arg}`);
    } else {
      privateFile = arg;
    }
  }
  return { timeoutMs, privateFile };
}
