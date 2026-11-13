/**
 * normalize() (crisis-modifiers.ts) reads look-alike and hidden-mark text as the plain words, so
 * every pattern reader in detectCrisis does too: fullwidth letters (NFKC), and the zero-width
 * space, non-joiner, joiner, word joiner, byte-order mark and soft hyphen (stripped). A first-
 * person ingestion said with any of them still gets the 911-first script. Every line is written
 * here (fictional); no eval set is loaded.
 */
import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it } from 'vitest';

import { gatedReply } from '../../../agents/personas/crisis-gate.js';
import { resetCrisisCallRisk } from '../crisis-call-risk.js';
import { resetCrisisClassifierCache } from '../crisis-classifier.js';
import { detectCrisis, sessionSeverityOf } from '../crisis-guard.js';
import { resetCallRiskSnapshots } from '../crisis-lone-imminent.js';
import { normalize } from '../crisis-modifiers.js';

/** One hidden mark in the middle of the line's longest word. */
const midWord = (mark: string) => (line: string) => {
  const word = line.split(' ').reduce((a, b) => (b.length > a.length ? b : a));
  const at = Math.floor(word.length / 2);
  return line.replace(word, `${word.slice(0, at)}${mark}${word.slice(at)}`);
};
/** Printable ASCII as its fullwidth form (U+FF01-U+FF5E), spaces as the ideographic space. */
const fullwidth = (line: string) =>
  [...line]
    .map((ch) =>
      ch === ' '
        ? '\u3000'
        : ch >= '!' && ch <= '~'
          ? String.fromCharCode(ch.charCodeAt(0) + 0xfee0)
          : ch
    )
    .join('');
/** The same mark in the middle of every word of two letters or more. */
const everyWord = (mark: string) => (line: string) =>
  line
    .split(' ')
    .map((word) => (word.length < 2 ? word : midWord(mark)(word)))
    .join(' ');
/** The same mark between every two letters of every word. */
const everyLetter = (mark: string) => (line: string) =>
  line
    .split(' ')
    .map((word) => [...word].join(mark))
    .join(' ');
// Always inside a word: a leading byte-order mark is already gone with trim().
const MARKS = [
  ['zero-width space', '\u200b'],
  ['zero-width non-joiner', '\u200c'],
  ['zero-width joiner', '\u200d'],
  ['word joiner', '\u2060'],
  ['soft hyphen', '\u00ad'],
  ['byte-order mark', '\ufeff'],
] as const;
// One mark per line, one in every word, and one between every two letters: a reader that strips
// only the first mark it finds fails the last two.
const VARIANTS: ReadonlyArray<readonly [string, (line: string) => string]> = [
  ...MARKS.flatMap(([name, mark]) => [
    [name, midWord(mark)] as const,
    [`${name} in every word`, everyWord(mark)] as const,
    [`${name} between every letter`, everyLetter(mark)] as const,
  ]),
  ['fullwidth letters', fullwidth],
  ['fullwidth and a zero-width space', (line) => fullwidth(midWord('\u200b')(line))],
];

const FAMILIES = {
  'a first-person ingestion, done': [
    'i just swallowed a whole bottle of sleeping pills',
    'i just took all my pills',
  ],
  'wanting to die': ['i want to kill myself', 'i wish i was dead'],
  'an ending tonight': ["i'm going to end my life tonight"],
  'hurting myself': ['i cut myself again tonight'],
} as const;
const CONTROLS = [
  'i just took all my vitamins',
  'this traffic is killing me',
  'i want to end this meeting early',
  'i cut the onions for tonight',
];

const read = (line: string) => {
  const d = detectCrisis(line);
  return {
    isCrisis: d.isCrisis,
    severity: d.severity,
    subject: d.subject,
    indicators: [...d.indicators].sort(),
    session: sessionSeverityOf(line),
  };
};

describe('normalize: hidden marks and look-alike letters read as the plain words', () => {
  it.each(VARIANTS)('%s', (_, mark) => {
    for (const line of [...Object.values(FAMILIES).flat(), ...CONTROLS])
      expect(normalize(mark(line))).toBe(normalize(line));
  });
});

describe.each(Object.entries(FAMILIES))('%s: every variant reads as the plain line', (_, lines) => {
  it.each(VARIANTS)('%s', (_v, mark) => {
    for (const line of lines) {
      expect(read(line).isCrisis).toBe(true);
      expect(mark(line)).not.toBe(line);
      expect(read(mark(line))).toEqual(read(line));
    }
  });
});

describe('everyday lines stay quiet with the same marks', () => {
  it.each(VARIANTS)('%s', (_, mark) => {
    for (const line of CONTROLS)
      expect(read(mark(line))).toEqual({ ...read(line), isCrisis: false });
  });
});

describe('the reply: a done ingestion with hidden marks gets the 911-first script', () => {
  const env = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
  beforeEach(() => {
    resetCrisisClassifierCache();
    resetCrisisCallRisk();
    resetCallRiskSnapshots();
  });
  let n = 0;
  const spoken = async (line: string) => {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: line });
    const reply = await gatedReply(
      ctx,
      Object.assign(new EventEmitter(), { userData: { services: { sessionId: `hm${++n}` } } }),
      (async () =>
        new ReadableStream<unknown>({
          start(c) {
            c.enqueue('MODEL.');
            c.close();
          },
        })) as never,
      { wrap: (s: ReadableStream<unknown>) => s } as never,
      { env }
    );
    const out: unknown[] = [];
    if (reply)
      for await (const chunk of reply as unknown as AsyncIterable<unknown>) out.push(chunk);
    return out.join('');
  };

  it.each(VARIANTS)('%s', async (_, mark) => {
    for (const line of FAMILIES['a first-person ingestion, done']) {
      const text = await spoken(mark(line));
      const at911 = text.search(/\b911\b/);
      const at988 = text.search(/\b988\b/);
      expect(at911).toBeGreaterThanOrEqual(0);
      expect(at988 === -1 || at911 < at988).toBe(true);
    }
  });
});
