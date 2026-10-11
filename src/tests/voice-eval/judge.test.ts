import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs script, no types
import {
  aiDisclosureOf,
  armOf,
  CANDOR_KINDS,
  candorTurnsOf,
  combine,
  DIMENSIONS,
  ferniBiography,
  parseArgs,
  parseJudgeJson,
  promptFor,
  providersFrom,
  verdictFile,
  wordsPerReply,
} from '../../../scripts/voice-eval/judge.mjs';

const run = (events: Array<[string, string]>) => ({
  userSpeech: [[1000, 2000]],
  events: [
    { t: 50, who: 'agent', text: 'Hey Sam.' },
    ...events.map(([who, text], i) => ({ t: 1000 + i * 100, who, text })),
  ],
});

describe('voice-eval judge', () => {
  it('runs only Gemini unless JUDGE_PROVIDERS adds Claude, and keeps each judge in its own file', () => {
    expect(providersFrom({})).toEqual(['gemini']);
    expect(providersFrom({ JUDGE_PROVIDERS: 'gemini, claude' })).toEqual(['gemini', 'claude']);
    expect(() => providersFrom({ JUDGE_PROVIDERS: 'gemini,gpt' })).toThrow(
      /unknown judge provider gpt/
    );
    expect(verdictFile('out/story-1.json', 'gemini')).toBe('out/story-1.judge.json');
    expect(verdictFile('out/story-1.json', 'claude')).toBe('out/story-1.judge.claude.json');
  });

  it('lists and asks for the dimensions in the given order, with the same text', () => {
    const call = run([['user', 'Hi']]);
    const order = [
      'candor',
      'understanding',
      ...Object.keys(DIMENSIONS).filter((k) => !['candor', 'understanding'].includes(k)),
    ];
    const p = promptFor(call, null, order);
    expect(p.indexOf('- candor:')).toBeLessThan(p.indexOf('- understanding:'));
    expect(p).toContain('{"scores": {"candor": <1-5 or null>, "understanding": <1-5 or null>');
    expect(promptFor(call, null).indexOf('- understanding:')).toBeLessThan(
      promptFor(call, null).indexOf('- candor:')
    );
    expect(p.replace(/\n.*scores.*\n/, '')).toHaveLength(
      promptFor(call, null).replace(/\n.*scores.*\n/, '').length
    );
  });

  it('never counts a truthful, prompted AI disclosure against Ferni', () => {
    expect(DIMENSIONS.conduct).not.toMatch(/offering help, saying it is an AI/);
    expect(DIMENSIONS.conduct).toMatch(/when the caller asks, or at the start of the call/);
    expect(DIMENSIONS.conduct).toMatch(
      /neutral and never lowers this or any other score, or humanLikelihood/
    );
    expect(DIMENSIONS.conduct).toMatch(/Only volunteering it unprompted mid-conversation/);
    const p = promptFor(run([['user', 'Wait, are you an AI?']]), null);
    expect(p).toContain('"aiDisclosure": [{"turn": <n>, "prompted":');
    // A judge reply (fenced, as Claude may send it) that logs a prompted disclosure.
    const reply = parseJudgeJson(
      '```json\n{"scores": {"conduct": 4}, "aiDisclosure": [{"turn": 2, "prompted": true}]}\n```'
    );
    const v = combine([reply]);
    expect(v.aiDisclosure).toEqual({ prompted: 1, unprompted: 0 });
    expect(v.scores.conduct).toBe(4);
    expect(
      aiDisclosureOf([{ aiDisclosure: [{ turn: 9, prompted: false }] }, { aiDisclosure: [] }])
    ).toEqual({
      prompted: 0,
      unprompted: 0.5,
    });
    expect(aiDisclosureOf([{ aiDisclosure: [{ turn: 3 }] }])).toEqual({
      prompted: 0,
      unprompted: 1,
    });
    expect(aiDisclosureOf([{}])).toBeNull();
  });

  it('parses a judge reply wrapped in prose or a fence, and fails loudly without JSON', () => {
    expect(parseJudgeJson('Here you go:\n{"scores": {"empathy": 3}}\nThanks')).toEqual({
      scores: { empathy: 3 },
    });
    expect(() => parseJudgeJson('I cannot judge this.')).toThrow(/no JSON/);
  });

  it('measures words per Ferni reply and assigns runs to arms by whole label parts', () => {
    const call = run([
      ['user', 'How was it?'],
      ['agent', 'It was great, honestly.'],
      ['user', 'Nice.'],
      ['agent', 'Yeah.'],
    ]);
    expect(wordsPerReply(call)).toBe(2.5);
    expect(armOf('model-r1', ['dice', 'model'])).toBe('model');
    expect(armOf('dice_2', ['dice', 'model'])).toBe('dice');
    expect(armOf('modeling-1', ['dice', 'model'])).toBeNull();
  });

  it('reads summary options', () => {
    const o = parseArgs([
      '--summary',
      '--primary',
      'empathy',
      '--baseline',
      '3.2',
      '--arms',
      'dice,model',
      'a.json',
    ]);
    expect(o).toMatchObject({
      summary: true,
      primary: 'empathy',
      baseline: 3.2,
      arms: ['dice', 'model'],
      files: ['a.json'],
    });
    expect(() => parseArgs(['--summary', '--primary', 'charm'])).toThrow(
      /--primary must be one of/
    );
  });

  it('averages judge samples and skips null (not applicable) scores', () => {
    const v = combine([
      { scores: { recall: null, empathy: 4 }, humanLikelihood: 0.8, inventedHistory: ['a'] },
      { scores: { recall: null, empathy: 3 }, humanLikelihood: 0.6, inventedHistory: ['a', 'b'] },
    ]);
    expect(v.scores.recall).toBeNull();
    expect(v.scores.empathy).toBe(3.5);
    expect(v.humanLikelihood).toBe(0.7);
    expect(v.inventedHistory).toEqual(['a', 'b']);
  });

  it('shows every dimension, the transcript, and the earlier call when there is one', () => {
    const call = run([
      ['user', 'Guess how Monday went?'],
      ['agent', 'The Stripe interview?'],
    ]);
    const seed = run([
      ['user', 'I have an interview at Stripe on Monday.'],
      ['agent', 'Oh, nice.'],
    ]);
    const withSeed = promptFor(call, seed);
    for (const k of Object.keys(DIMENSIONS)) expect(withSeed).toContain(`- ${k}:`);
    expect(withSeed).toContain('2. FERNI: The Stripe interview?');
    expect(withSeed).toContain('CALLER: I have an interview at Stripe on Monday.');
    expect(promptFor(call, null)).toContain('There was no earlier call');
  });

  it("gives the judge Ferni's canonical background so its stories are judged against it", () => {
    expect(ferniBiography()).toMatch(/Wyoming/);
    expect(ferniBiography()).toMatch(/Japan/);
    const p = promptFor({ userSpeech: [[0, 1]], events: [] }, null);
    expect(p).toContain("FERNI'S BACKGROUND");
    expect(ferniBiography('/no/such/file')).toBe('');
  });

  it('tells the judge that fair inferences from what the caller said are not invented', () => {
    const p = promptFor({ userSpeech: [[0, 1]], events: [] }, null);
    expect(p).toMatch(/can't be fairly inferred from what they did say/);
  });

  it('scores candor 1-5 like the rest, and asks for a tally of candid and sycophantic turns', () => {
    expect(DIMENSIONS.candor).toMatch(/I don't know/);
    expect(DIMENSIONS.candor).toMatch(/support first/);
    const p = promptFor({ userSpeech: [[0, 1]], events: [] }, null);
    expect(p).toContain('- candor:');
    expect(p).toContain('"candor": <1-5 or null>');
    for (const k of CANDOR_KINDS) expect(p).toContain(`"${k}":`);
  });

  it('averages candor scores and per-kind turn counts over samples, skipping missing or bad ones', () => {
    const v = combine([
      { scores: { candor: 4 }, candorTurns: { disagreed: 2, caved: 0, fakedKnowledge: 1 } },
      { scores: { candor: 3 }, candorTurns: { disagreed: 1, caved: 'some', fakedKnowledge: -1 } },
      { scores: { candor: null } },
    ]);
    expect(v.scores.candor).toBe(3.5);
    expect(v.candorTurns).toEqual({
      disagreed: 1.5,
      ownedUncertainty: null,
      caved: 0,
      fakedKnowledge: 1,
      flattered: null,
    });
    expect(candorTurnsOf([])).toEqual(
      Object.fromEntries(CANDOR_KINDS.map((k: string) => [k, null]))
    );
  });
});
