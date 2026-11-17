/**
 * CRISIS_GUIDED_LINE_FLOOR: a crisis guide's reply always names its line, said by code when the
 * model leaves it out; every other reply is the same stream, untouched. All lines are fictional.
 */
import { describe, expect, it } from 'vitest';
import { ReadableStream } from 'node:stream/web';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SOFT_CRISIS_CHECK } from '../crisis-agreement.js';
import { AFTER_CHECK_GUIDANCE } from '../crisis-confirmed-risk.js';
import { GROUNDED_LIGHT_TOUCH } from '../crisis-grounded-release.js';
import {
  SCREEN_GENTLE_OFFER,
  withMissingEnding,
  withScreenQuestion,
} from '../crisis-grounded-screen.js';
import {
  CALL_911_ES,
  CALL_911_FOR_THEM,
  FOR_THEM_988,
  LATE_911_LINE,
  TALK_TO_988,
  TALK_TO_988_ES,
} from '../crisis-guard-replies.js';
import { guideLineOf, withGuidedLine, type GuideLine } from '../crisis-guided-line-floor.js';
import { offersCrisisLine } from '../crisis-line-speech.js';

const ON = { CRISIS_GUIDED_LINE_FLOOR: 'on' };
const OFF = { CRISIS_GUIDED_LINE_FLOOR: 'off' };

const streamOf = (...chunks: string[]): ReadableStream<string> =>
  new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

/** A model stream that sends `chunks`, then fails with `error`. */
/**
 * A model stream that hands over its chunks, one per read, then fails. Not error() in start():
 * that empties the queue, so no chunk would ever be read. `readBeforeError()` is how many chunks
 * the reader had taken when it failed (pull runs only on an empty queue), or null if it never
 * failed on an empty queue: each row asserts it as its precondition.
 */
const failingAfter = (error: Error, ...chunks: string[]) => {
  const left = [...chunks];
  let read = 0;
  let readBeforeError: number | null = null;
  const stream = new ReadableStream<string>({
    pull(controller) {
      const chunk = left.shift();
      if (chunk !== undefined) {
        read += 1;
        controller.enqueue(chunk);
        return;
      }
      if (controller.desiredSize === 1) readBeforeError = read; // the queue is empty: all read
      controller.error(error);
    },
  });
  return Object.assign(stream, { readBeforeError: () => readBeforeError });
};

async function said(stream: ReadableStream<unknown> | null): Promise<string | null> {
  if (!stream) return null;
  let text = '';
  for await (const chunk of stream as unknown as AsyncIterable<string>) text += chunk;
  return text;
}

const SELF: GuideLine = { who: 'self', urgent: false, lang: 'en' };
const SELF_ES: GuideLine = { who: 'self', urgent: false, lang: 'es' };
const IMMINENT: GuideLine = { who: 'self', urgent: true, lang: 'en' };
const IMMINENT_ES: GuideLine = { who: 'self', urgent: true, lang: 'es' };
const THEM: GuideLine = { who: 'them', urgent: false, lang: 'en' };
const EMERGENCY: GuideLine = { who: 'them', urgent: true, lang: 'en' };

const REPLY = "That sounds so heavy. I'm right here with you.";

/** Each kind: what code says after a reply that names no line, in order. */
const KINDS: ReadonlyArray<[string, GuideLine, string]> = [
  ["the caller's own crisis", SELF, TALK_TO_988],
  ["the caller's own crisis, Spanish", SELF_ES, TALK_TO_988_ES],
  ['imminent: 911, then 988', IMMINENT, `${LATE_911_LINE} ${TALK_TO_988}`],
  ['imminent, Spanish: 911, then 988', IMMINENT_ES, `${CALL_911_ES} ${TALK_TO_988_ES}`],
  ['someone the caller is worried about', THEM, FOR_THEM_988],
  ['an emergency for someone else: 911 for them, no 988', EMERGENCY, CALL_911_FOR_THEM],
];

describe('CRISIS_GUIDED_LINE_FLOOR: what a crisis guide reply always names', () => {
  for (const [kind, line, ending] of KINDS) {
    it(`${kind}: a reply naming no line gets it after`, async () => {
      expect(await said(withGuidedLine(streamOf(REPLY), { line }, OFF))).toBe(REPLY);
      expect(await said(withGuidedLine(streamOf(REPLY), { line }, ON))).toBe(`${REPLY} ${ending}`);
    });

    it(`${kind}: no reply at all gets the line alone`, async () => {
      expect(await said(withGuidedLine(null, { line }, OFF))).toBeNull();
      expect(await said(withGuidedLine(null, { line }, ON))).toBe(ending);
      expect(await said(withGuidedLine(streamOf(''), { line }, ON))).toBe(ending);
    });
  }

  it('a reply that already names the line is never added to, in digits or spoken', async () => {
    const named: ReadonlyArray<[GuideLine, string]> = [
      [SELF, 'You can call or text 988 any time.'],
      [SELF, 'You can call nine eight eight any time.'],
      [SELF_ES, 'Puedes llamar al 988.'],
      [IMMINENT, 'Please call 911 now, or 988.'],
      [THEM, 'You could call 988 together.'],
      [EMERGENCY, 'Call 911 right now.'],
    ];
    for (const [line, reply] of named) {
      expect(await said(withGuidedLine(streamOf(reply), { line }, ON)), reply).toBe(reply);
    }
  });

  // Model replies write the line every way crisis-line-speech.ts later turns into speech at TTS,
  // after the floor; the floor reads them with the same reader (names988 / names911).
  it.each<[string, GuideLine]>([
    ['You can call or text 9-8-8 any time.', SELF],
    ['You can call or text 9 8 8 any time.', SELF],
    ['Please call ninety-eight-eight tonight.', SELF],
    ['You can call nine-eighty-eight tonight.', SELF],
    ['You can chat at 988lifeline.org any time.', SELF],
    ['Puedes llamar al nueve ocho ocho.', SELF_ES],
    ['We could call 9-8-8 together for them.', THEM],
    ['Please call nine one one now, or 988.', IMMINENT],
    ['Call nine one one right now.', EMERGENCY],
    ['Llama al nueve uno uno ahora, o al 988.', IMMINENT_ES],
  ])('a reply already naming its line in written form is unchanged: %s', async (reply, line) => {
    expect(await said(withGuidedLine(streamOf(reply), { line }, ON))).toBe(reply);
  });

  it('imminent: only the missing one of 911 and 988 is said, 911 first', async () => {
    const has911 = 'Please call 911.';
    const has988 = 'You can call 988.';
    expect(await said(withGuidedLine(streamOf(has911), { line: IMMINENT }, ON))).toBe(
      `${has911} ${TALK_TO_988}`
    );
    expect(await said(withGuidedLine(streamOf(has988), { line: IMMINENT }, ON))).toBe(
      `${has988} ${LATE_911_LINE}`
    );
  });

  it('an emergency for someone else never adds 988', async () => {
    const spoken = (await said(withGuidedLine(streamOf(REPLY), { line: EMERGENCY }, ON))) ?? '';
    expect(spoken).toContain('911');
    expect(spoken).not.toContain('988');
  });

  it('the line reads the whole reply, not one chunk: 988 split across chunks counts', async () => {
    const split = withGuidedLine(streamOf('You can call 9', '88 any time.'), { line: SELF }, ON);
    expect(await said(split)).toBe('You can call 988 any time.');
  });

  it('a 988 inside a longer number is not the line', async () => {
    const reply = 'My number is 19885.';
    expect(await said(withGuidedLine(streamOf(reply), { line: SELF }, ON))).toBe(
      `${reply} ${TALK_TO_988}`
    );
  });
});

describe('CRISIS_GUIDED_LINE_FLOOR: every guide without a line is untouched', () => {
  const UNLINED = {
    'soft check-in': SOFT_CRISIS_CHECK,
    'grounded light touch': GROUNDED_LIGHT_TOUCH,
    'after-check ease': AFTER_CHECK_GUIDANCE,
    'gentle offer': SCREEN_GENTLE_OFFER,
  };
  for (const [name, guidance] of Object.entries(UNLINED)) {
    it(`${name}: flag on is the same stream as flag off, null stays null`, async () => {
      const reply = streamOf(REPLY);
      const decision: { guidance: string; line?: GuideLine } = { guidance };
      expect(withGuidedLine(reply, decision, ON)).toBe(reply);
      expect(withGuidedLine(null, decision, ON)).toBeNull();
    });
  }

  it('a crisis guide with the flag off is the same stream', () => {
    const reply = streamOf(REPLY);
    expect(withGuidedLine(reply, { line: SELF }, OFF)).toBe(reply);
    expect(withGuidedLine(reply, { line: SELF }, {})).toBe(reply); // off by default
  });
});

describe('CRISIS_GUIDED_LINE_FLOOR: fails closed', () => {
  it('a presence test that throws counts as the line missing', async () => {
    const throws = {
      present: (): boolean => {
        throw new Error('reader broke');
      },
      words: TALK_TO_988,
    };
    expect(await said(withMissingEnding(streamOf(REPLY), [throws]))).toBe(
      `${REPLY} ${TALK_TO_988}`
    );
    expect(await said(withMissingEnding(null, [throws]))).toBe(TALK_TO_988);
  });
});

describe('CRISIS_GUIDED_LINE_FLOOR: a model stream that fails part-way still names the line', () => {
  const broke = new Error('model stream broke');

  it('a partial reply, then a failure: the partial, then the missing line, and a clean end', async () => {
    const partial = "That sounds so heavy, I'm";
    for (const [, line, ending] of KINDS) {
      const model = failingAfter(broke, partial);
      const out = await said(withGuidedLine(model, { line }, ON));
      expect(model.readBeforeError()).toBe(1); // the partial was read, then the failure
      expect(out).toBe(`${partial} ${ending}`);
    }
  });

  it('a failure before any words: the line alone', async () => {
    const model = failingAfter(broke);
    const out = await said(withGuidedLine(model, { line: SELF }, ON));
    expect(model.readBeforeError()).toBe(0);
    expect(out).toBe(TALK_TO_988);
  });

  it('a partial that already named 988 gets nothing more', async () => {
    const partial = 'You can call or text 988 any';
    const model = failingAfter(broke, partial);
    const out = await said(withGuidedLine(model, { line: SELF }, ON));
    expect(model.readBeforeError()).toBe(1);
    expect(out).toBe(partial);
  });

  it('an abort (the caller talking over it) still fails, with nothing said into it', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const model = failingAfter(abort, 'So');
    await expect(said(withGuidedLine(model, { line: SELF }, ON))).rejects.toBe(abort);
    expect(model.readBeforeError()).toBe(1);
  });

  it("the grounded screen's question keeps main's failure: a failed stream still rejects there", async () => {
    // withScreenQuestion takes withReplyEnding's pipeThrough path (no endOnError): unchanged
    const model = failingAfter(broke, 'So');
    await expect(said(withScreenQuestion(model))).rejects.toBe(broke);
    expect(model.readBeforeError()).toBe(1);
  });

  it('flag off: the failure reaches the caller of the stream, as on main', async () => {
    const model = failingAfter(broke, 'So');
    await expect(said(withGuidedLine(model, { line: SELF }, OFF))).rejects.toBe(broke);
    expect(model.readBeforeError()).toBe(1);
  });
});

describe('guideLineOf: the line a crisis read guide carries', () => {
  const read = (indicators: string[], extra: object = {}) => ({ indicators, ...extra });

  it("the caller's own read: 988, in its language; imminent adds 911", () => {
    expect(guideLineOf(read(['suicidal_ideation']))).toEqual(SELF);
    expect(guideLineOf(read(['suicidal_ideation'], { language: 'es' }))).toEqual(SELF_ES);
    expect(guideLineOf(read(['imminent_danger']))).toEqual(IMMINENT);
    expect(guideLineOf(read(['imminent_danger'], { language: 'es' }))).toEqual(IMMINENT_ES);
  });

  it('someone else: the for-them line, or 911 for them in an emergency', () => {
    expect(guideLineOf(read(['third_party'], { subject: 'third_party' }))).toEqual(THEM);
    const down = read(['third_party_emergency'], { subject: 'third_party' });
    expect(guideLineOf(down)).toEqual(EMERGENCY);
  });

  it('someone else, in Spanish: none (main has no Spanish for-them words yet)', () => {
    expect(guideLineOf(read(['third_party'], { subject: 'third_party', language: 'es' }))).toBe(
      undefined
    );
  });

  it("a read with no language: the caller's own Spanish crisis words pick Spanish", () => {
    const classifierOnly = read(['suicidal_ideation']); // only Spanish pattern reads set language
    expect(guideLineOf(classifierOnly, false, 'no estoy a salvo esta noche')).toEqual(SELF_ES);
    expect(guideLineOf(read(['imminent_danger']), false, 'no estoy a salvo')).toEqual(IMMINENT_ES);
    expect(guideLineOf(classifierOnly, false, 'i am not safe tonight')).toEqual(SELF);
    // Someone else, in Spanish: none, as for a Spanish read (no Spanish for-them words yet).
    const them = read(['third_party'], { subject: 'third_party' });
    expect(guideLineOf(them, false, 'no estoy a salvo')).toBeUndefined();
  });

  it("a disclosure: the caller's 988 only when they may be at risk themselves", () => {
    expect(guideLineOf(read(['abuse_disclosure']), true)).toBeUndefined();
    expect(guideLineOf(read(['minor_abuse_disclosure']), true)).toBeUndefined();
    expect(guideLineOf(read(['abuse_disclosure', 'abuse_disclosure_self_harm']), true)).toEqual(
      SELF
    );
    const minor = read(['minor_abuse_disclosure', 'minor_abuse_disclosure_self_harm']);
    expect(guideLineOf(minor, true)).toEqual(SELF);
  });
});

describe('CRISIS_GUIDED_LINE_FLOOR: one reader, one appender', () => {
  const ROOTS = ['src/services/safety', 'src/agents/personas', 'src/agents/safety'];
  const sources = ROOTS.flatMap((root) =>
    readdirSync(root, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.ts') && !file.includes('__tests__'))
      .map((file) => [join(root, file), readFileSync(join(root, file), 'utf8')] as const)
  );

  it('the 988 and 911 readers are defined once (crisis-line-speech.ts), the appender once', () => {
    const definedIn = (name: string) =>
      sources
        .filter(([, text]) => new RegExp(`export (?:const|function) ${name}\\b`).test(text))
        .map(([file]) => file);
    expect(definedIn('names988')).toEqual(['src/services/safety/crisis-line-speech.ts']);
    expect(definedIn('names911')).toEqual(['src/services/safety/crisis-line-speech.ts']);
    // offersCrisisLine is built on names988, not on a pattern of its own.
    expect(readFileSync('src/services/safety/crisis-line-speech.ts', 'utf8')).toContain(
      'return names988(text) ||'
    );
    // No second copy of a 988 pattern: the earlier digit reader and the check-in's are gone.
    const copies = sources.filter(
      ([, text]) => text.includes('(?<!\\d)988(?!\\d)') || text.includes('nine[\\s,-]+eight')
    );
    expect(copies.map(([file]) => file)).toEqual([]);
    const appenders = sources.filter(([, text]) =>
      /export function withMissingEnding\b/.test(text)
    );
    expect(appenders.map(([file]) => file)).toEqual([
      'src/services/safety/crisis-grounded-screen.ts',
    ]);
  });

  it("crisis-gate.ts sets a guide's line only through crisisGuide, at the three crisis reads", () => {
    const gate = readFileSync('src/agents/personas/crisis-gate.ts', 'utf8');
    // Every guide literal: none names a line. crisisGuide is the one builder that does.
    const literals = gate.match(/\{ action: 'guide'[^}]*\}/g) ?? [];
    expect(literals.length).toBeGreaterThan(0);
    const built = literals.filter((l) => !l.includes('guidance: string')); // not the type
    for (const literal of built.filter((l) => !l.includes('guidance, line'))) {
      expect(literal, literal).not.toMatch(/\bline\b/);
    }
    expect(gate.match(/\{ action: 'guide', guidance, line \}/g)).toHaveLength(1);
    expect(gate.match(/\bcrisisGuide\(/g)).toHaveLength(3);
    expect(gate.match(/guideLineOf\(/g)).toHaveLength(3);
    // The eased path: only a stepped-down crisis read has a line; an after-check ease has none.
    expect(gate).toContain(
      'crisisGuide(eased.guidance, eased.crisis && guideLineOf(eased.crisis, false, latest))'
    );
  });
});

/**
 * FROZEN BASELINE, for the equivalence rows below only: main's offersCrisisLine before it was built
 * on names988, copied unchanged from origin/main's crisis-line-speech.ts (OFFERED + NAMED). Never
 * update it and never read with it anywhere else; it is what the shared reader is compared with.
 */
const mainOffersCrisisLine = (() => {
  const SEP = String.raw`[\s-]+`;
  const SPELLED = String.raw`\b(?:ninety${SEP}eighty?|nine${SEP}eighty)${SEP}eight\b`;
  const DIGITS = String.raw`(?<![\w$€£#]|\d[.,])(?:988|9-8-8|9 8 8)(?![\w%]|[.,]\d)`;
  const LIST_SEP = String.raw`[\s,-]+`;
  const SPOKEN = String.raw`\bnine${LIST_SEP}eight${LIST_SEP}eight\b`;
  const TEXT_LINE_NUMBER = String.raw`(?<![\w$])7[\s-]?4[\s-]?1[\s-]?7[\s-]?4[\s-]?1(?!\w)|\bseven${SEP}four${SEP}one${SEP}seven${SEP}four${SEP}one\b`;
  const OFFERED = new RegExp(`${SPELLED}|${DIGITS}|${SPOKEN}|${TEXT_LINE_NUMBER}`, 'i');
  const NAMED = /\blifeline\b|\b(?:crisis|suicide)\s+(?:text\s+)?(?:hot)?line\b/i;
  return (text: string): boolean => OFFERED.test(text) || NAMED.test(text);
})();

describe('offersCrisisLine on the shared 988 reader: main, plus exactly two intended forms', () => {
  /** The only differences from main allowed: forms main missed, which the new reader adds. */
  const INTENDED = [/\bnueve[\s,-]+ocho[\s,-]+ocho\b/i, /\b988lifeline\b/i];
  const intended = (text: string) => INTENDED.some((form) => form.test(text));

  /** Every written form the floor rows use, then lines around them; `main`: main's reading. */
  const LINES: ReadonlyArray<[string, boolean]> = [
    ['You can call or text 9-8-8 any time.', true],
    ['You can call or text 9 8 8 any time.', true],
    ['Please call ninety-eight-eight tonight.', true],
    ['You can call nine-eighty-eight tonight.', true],
    ['You can call or text 988 any time.', true],
    ['You can call nine eight eight.', true],
    ['You can call nine, eight, eight.', true],
    ['We could call 9-8-8 together for them.', true],
    ['Please call nine one one now, or 988.', true],
    ['Llama al nueve uno uno ahora, o al 988.', true],
    ['text HOME to 741741', true],
    ['the Suicide and Crisis Lifeline', true],
    // Main reads these too (its digit forms need no cue word); unchanged here.
    ['That cost 988 dollars.', true],
    ['Dial 1-988-555-0100 for billing.', true],
    ['The code is 9 8 8 0.', true],
    // Neither reads these.
    ['Call nine one one right now.', false],
    ['That trip cost $988.', false],
    ['She is in room 9880.', false],
    ['Write 198 8 on the form.', false],
    ['nine eight eighty', false],
    ['nueve ocho', false],
    // The two intended differences: main missed them.
    ['You can chat at 988lifeline.org any time.', false],
    ['Their site is 988lifeline.org.', false],
    ['Puedes llamar al nueve ocho ocho.', false],
    ['Nueve, ocho, ocho.', false],
  ];

  it.each(LINES)('%s (main: %s)', (text, main) => {
    expect(mainOffersCrisisLine(text)).toBe(main); // the frozen copy reads as main does
    expect(offersCrisisLine(text)).toBe(main || intended(text));
  });

  it('differs from main only on the intended forms, and there only by reading the line', () => {
    const differs = LINES.filter(
      ([text]) => offersCrisisLine(text) !== mainOffersCrisisLine(text)
    ).map(([text]) => text);
    expect(differs).toEqual([
      'You can chat at 988lifeline.org any time.',
      'Their site is 988lifeline.org.',
      'Puedes llamar al nueve ocho ocho.',
      'Nueve, ocho, ocho.',
    ]);
    for (const text of differs) {
      expect([mainOffersCrisisLine(text), offersCrisisLine(text)], text).toEqual([false, true]);
    }
  });
});
