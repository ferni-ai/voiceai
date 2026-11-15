/**
 * TTS monitoring records no piece of Ferni's reply anywhere but dev.
 *
 * A reply echoes callers' words, and the asterisk / parenthesis / bracket patterns match
 * whatever sits between the delimiters. The monitor feeds three places: its log line, its
 * in-memory stats, and the admin route that serves them. Each holds the matching pattern's
 * fixed label and the reply's length; only a dev process holds the matched text. A database
 * name that is neither prod's nor dev's (a misspelling) is not dev.
 *
 * The dev-or-not decision is the real one (config/firestore-database.ts, read at call
 * time), driven by FIRESTORE_DATABASE set per case. The logger is this file's own mock, so
 * the assertions read exactly what the module handed it.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  createLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const sent = vi.hoisted(() => [] as unknown[]);
vi.mock('../../../api/helpers.js', () => ({
  handleCorsPreflightIfNeeded: () => false,
  sendError: vi.fn(),
  sendJSON: (_res: unknown, body: unknown) => sent.push(body),
}));
vi.mock('../../../api/auth-middleware.js', () => ({
  rateLimit: () => false,
  requireAuth: async () => ({ uid: 'admin' }),
}));

import { handleAdminTTSMonitoringRoutes } from '../../../api/v1/admin/tts-monitoring.js';
import { isKnownDevDatabase } from '../../../config/firestore-database.js';
import { checkTTSText, getTTSStats, resetTTSStats, trackTTSCheck } from '../tts-monitoring.js';

// Invented reply that trips every pattern. Planted tokens sit where open text is matched.
const STAR = 'zqxstarword';
const PAREN = 'zqxparenword';
const BRACKET = 'zqxbracketword';
const END_BRACKET = 'zqxendword';
const REPLY =
  `Hello there *${STAR}* and (${PAREN}ly) then [${BRACKET}] more, she laughs softly, ` +
  `so playful, with a warm smile, then trails off. Bye [${END_BRACKET}]`;
const TOKENS = [STAR, PAREN, BRACKET, END_BRACKET, 'Hello there', 'laughs', 'softly'];

const LABELS_FOR_REPLY = [
  'action word',
  'action word',
  'asterisk direction',
  'parenthetical direction',
  'bracket direction',
  'tone adverb',
  'tone adjective',
  'manner phrase',
  'stage phrase',
  'unknown bracket notation',
  'unknown bracket notation',
];

interface RouteBody {
  topPatterns: Array<{ pattern: string; count: number }>;
  lastIssue: Record<string, unknown> | null;
}

function checkAndTrack(text: string): void {
  trackTTSCheck(checkTTSText(text));
}

async function getRouteStats(): Promise<RouteBody> {
  sent.length = 0;
  const handled = await handleAdminTTSMonitoringRoutes(
    { method: 'GET' } as IncomingMessage,
    {} as ServerResponse,
    '/api/v1/admin/tts-monitoring/stats',
    new URL('http://localhost/api/v1/admin/tts-monitoring/stats')
  );
  expect(handled).toBe(true);
  expect(sent).toHaveLength(1);
  return sent[0] as RouteBody;
}

/** The route's lastIssue, which these tests always expect to be set. */
function lastIssueOf(body: RouteBody): Record<string, unknown> {
  expect(body.lastIssue).not.toBeNull();
  return body.lastIssue ?? {};
}

/** The issues field of every warn call the monitor made. */
function loggedIssues(): unknown[] {
  return warn.mock.calls.map(([fields]) => (fields as { issues: unknown }).issues);
}

function withDatabase(value: string | undefined): void {
  const saved = process.env.FIRESTORE_DATABASE;
  beforeEach(() => {
    if (value === undefined) delete process.env.FIRESTORE_DATABASE;
    else process.env.FIRESTORE_DATABASE = value;
    warn.mockClear();
    resetTTSStats();
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.FIRESTORE_DATABASE;
    else process.env.FIRESTORE_DATABASE = saved;
  });
}

describe.each([
  ['FIRESTORE_DATABASE unset', undefined],
  ['FIRESTORE_DATABASE empty', ''],
  ['FIRESTORE_DATABASE=(default)', '(default)'],
  ['FIRESTORE_DATABASE a single space', ' '],
  ["dev's name with a newline after it", 'ferni-dev\n'],
  ["prod's name in another case", '(Default)'],
  ["prod's name without its brackets", 'default'],
  ["dev's name in another case", 'Ferni-Dev'],
  ["dev's name misspelt", 'ferni-dve'],
  ["a longer name that starts with dev's", 'ferni-dev-2'],
])('tts-monitoring anywhere but dev (%s)', (_name, database) => {
  withDatabase(database);

  it('is not dev by the real decision, and the plants are real matches', () => {
    expect(isKnownDevDatabase()).toBe(false);
    const matched = checkTTSText(REPLY).issues.map((issue) => issue.match);
    for (const token of [STAR, PAREN, BRACKET, END_BRACKET]) {
      expect(matched.join(' ')).toContain(token);
    }
  });

  it('logs one fixed label per issue and the length, never the matched text', () => {
    checkTTSText(REPLY);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(loggedIssues()).toEqual([LABELS_FOR_REPLY]);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ textLen: REPLY.length }),
      expect.any(String)
    );
    const logged = JSON.stringify(warn.mock.calls);
    for (const token of TOKENS) expect(logged).not.toContain(token);
  });

  it('counts by label, keeps no preview, and the route serves no preview key', async () => {
    const other = 'A different invented reply, *zqxotherword* here.';
    checkAndTrack(REPLY);
    checkAndTrack(other);

    const stats = getTTSStats();
    expect(stats.topPatterns).toEqual(
      expect.arrayContaining([
        { pattern: 'asterisk direction', count: 2 },
        { pattern: 'action word', count: 2 },
        { pattern: 'unknown bracket notation', count: 2 },
      ])
    );
    const labels = new Set(LABELS_FOR_REPLY);
    for (const { pattern } of stats.topPatterns) expect(labels.has(pattern)).toBe(true);
    expect(Object.keys(stats.lastIssue ?? {}).sort()).toEqual(['textLength', 'time']);

    const body = await getRouteStats();
    const lastIssue = lastIssueOf(body);
    expect(Object.keys(lastIssue).sort()).toEqual(['textLength', 'time', 'timeAgo']);
    expect(lastIssue.textLength).toBe(other.length);

    const everything = JSON.stringify([warn.mock.calls, stats, body]);
    for (const token of [...TOKENS, 'zqxotherword', 'different invented']) {
      expect(everything).not.toContain(token);
    }
  });

  it('labels even the closed-vocabulary words', () => {
    checkAndTrack('She smiles softly at you');
    expect(loggedIssues()).toEqual([['action word', 'tone adverb']]);
    const counted = getTTSStats().topPatterns.map((p) => p.pattern);
    expect(counted.sort()).toEqual(['action word', 'tone adverb']);
  });

  it('the in-process result still carries the matched text for the auto-fix', () => {
    const result = checkTTSText(REPLY);
    expect(result.originalText).toBe(REPLY);
    expect(result.issues.map((issue) => issue.label)).toEqual(LABELS_FOR_REPLY);
    expect(result.suggestedFix).toBeDefined();
    expect(result.suggestedFix).not.toContain(STAR);
  });
});

describe('tts-monitoring on dev (FIRESTORE_DATABASE=ferni-dev)', () => {
  withDatabase('ferni-dev');

  it('logs and counts the matched text, and serves the preview', async () => {
    expect(isKnownDevDatabase()).toBe(true);
    checkAndTrack(REPLY);

    const [logged] = loggedIssues() as string[][];
    expect(logged).toContain(`*${STAR}*`);
    expect(logged).toContain(`(${PAREN}ly)`);
    expect(logged).toContain(`Unknown bracket notation: [${END_BRACKET}]`);
    expect(logged).toContain('laughs');

    const patterns = getTTSStats().topPatterns.map((p) => p.pattern);
    expect(patterns).toContain(`*${STAR}*`);
    expect(patterns).toContain('softly');

    const lastIssue = lastIssueOf(await getRouteStats());
    expect(lastIssue.textPreview).toBe(REPLY.substring(0, 100));
    expect(lastIssue.textLength).toBe(REPLY.length);
  });
});
