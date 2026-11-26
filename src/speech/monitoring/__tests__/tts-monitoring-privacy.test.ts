/**
 * TTS monitoring records no piece of Ferni's reply anywhere but dev.
 *
 * A reply echoes callers' words, and the asterisk / parenthesis / bracket patterns match
 * whatever sits between the delimiters. The monitor's log line holds the matching
 * pattern's fixed label and the reply's length; only a dev process logs the matched text.
 * A database name that is neither prod's nor dev's (a misspelling) is not dev.
 *
 * The dev-or-not decision is the real one (config/firestore-database.ts, read at call
 * time), driven by FIRESTORE_DATABASE set per case. The logger is this file's own mock, so
 * the assertions read exactly what the module handed it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  createLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { isKnownDevDatabase } from '../../../config/firestore-database.js';
import { checkTTSText } from '../tts-monitoring.js';

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

  it('labels even the closed-vocabulary words', () => {
    checkTTSText('She smiles softly at you');
    expect(loggedIssues()).toEqual([['action word', 'tone adverb']]);
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

  it('logs the matched text', () => {
    expect(isKnownDevDatabase()).toBe(true);
    checkTTSText(REPLY);

    const [logged] = loggedIssues() as string[][];
    expect(logged).toContain(`*${STAR}*`);
    expect(logged).toContain(`(${PAREN}ly)`);
    expect(logged).toContain(`Unknown bracket notation: [${END_BRACKET}]`);
    expect(logged).toContain('laughs');
  });
});
