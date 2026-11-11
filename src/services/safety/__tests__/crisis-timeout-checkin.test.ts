import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';
import { SCREEN_QUESTION, screenReply } from '../crisis-grounded-screen.js';
import { getCrisisResponse } from '../crisis-guard-replies.js';
import {
  checkinWordsIn,
  timeoutCheckin,
  TIMEOUT_CHECKIN,
  withCheckinEnding,
} from '../crisis-timeout-checkin.js';

const ON = { CRISIS_TIMEOUT_CHECKIN: 'on' };
const PASS = { action: 'pass' };

async function spoken(stream: ReadableStream<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const chunk of stream as unknown as AsyncIterable<unknown>) out.push(chunk);
  return out;
}
const streamOf = (...chunks: string[]) =>
  new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

describe('checkinWordsIn', () => {
  it.each([
    'i have a bottle of pills and i want to take them all',
    'i feel unsafe with myself tonight',
    "honestly i don't trust myself right now",
    "i've been cutting myself again",
    "I can't go on anymore",
    'thinking about jumping off the bridge on fifth',
    'I’m scared of what I might do', // curly apostrophe
  ])('reads safety words in "%s"', (line) => {
    expect(checkinWordsIn(line)).toBe('en');
  });

  it.each(['ya no quiero vivir', 'quiero hacerme daño', 'me tomé todas las pastillas'])(
    'reads Spanish safety words in "%s"',
    (line) => {
      expect(checkinWordsIn(line)).toBe('es');
    }
  );

  it.each([
    'what should I cook tonight?',
    'my phone is dead again',
    'can you set a reminder for my pills at 8',
    'i overdosed on netflix this weekend',
    'i want to die my hair pink',
    "i can't go on the trip friday",
    'i feel safe here with you',
    'the bridge was closed so i was late',
    'unsafely', // whole words only
  ])('reads none in "%s"', (line) => {
    expect(checkinWordsIn(line)).toBeNull();
  });
});

describe('timeoutCheckin', () => {
  const turn = { verdict: null, decision: PASS, latest: 'i feel unsafe with myself tonight' };

  it('is the check-in for a failed read, a pattern pass and safety words, with the flag on', () => {
    expect(timeoutCheckin(turn, ON)).toBe(TIMEOUT_CHECKIN);
    expect(TIMEOUT_CHECKIN).toContain('988');
    expect(TIMEOUT_CHECKIN).toContain('are you safe right now?');
  });

  it('is null with the flag off or unset', () => {
    expect(timeoutCheckin(turn, { CRISIS_TIMEOUT_CHECKIN: 'off' })).toBeNull();
    expect(timeoutCheckin(turn, {})).toBeNull();
  });

  it('is null when the classifier answered, the patterns acted, it is a re-ask, or no words', () => {
    expect(timeoutCheckin({ ...turn, verdict: { risk: 'none', subject: 'self' } }, ON)).toBeNull();
    expect(timeoutCheckin({ ...turn, decision: { action: 'guide' } }, ON)).toBeNull();
    expect(timeoutCheckin({ ...turn, reask: true }, ON)).toBeNull();
    expect(timeoutCheckin({ ...turn, latest: 'what should I cook tonight?' }, ON)).toBeNull();
  });
});

describe('withCheckinEnding', () => {
  const said = async (latest: string, ...chunks: string[]) =>
    (await spoken(withCheckinEnding(streamOf(...chunks), { latest }))).join('');

  it('adds nothing when the reply asked about safety and said 988', async () => {
    expect(await said('unsafe', 'Are you safe right now? ', 'Call or text 988.')).toBe(
      'Are you safe right now? Call or text 988.'
    );
    expect(await said('unsafe', 'Are you safe? Nine eight eight is there.')).toBe(
      'Are you safe? Nine eight eight is there.'
    );
  });

  it('never counts another number or the Crisis Text Line as 988', async () => {
    expect(await said('unsafe', 'Are you safe? Text 741741 or call 19880.')).toContain(
      'call or text 988 to talk'
    );
  });
});

describe('withScreenQuestion on withReplyEnding: the screen is byte-identical', () => {
  it('appends the question as one chunk, skips it when the reply ends on it, says it alone', async () => {
    expect(await spoken(screenReply(streamOf('ok', ' then')))).toEqual([
      'ok',
      ' then',
      ` ${SCREEN_QUESTION}`,
    ]);
    expect(await spoken(screenReply(streamOf(`Hm. ${SCREEN_QUESTION}  `)))).toEqual([
      `Hm. ${SCREEN_QUESTION}  `,
    ]);
    expect(await spoken(screenReply(streamOf()))).toEqual([` ${SCREEN_QUESTION}`]);
    expect(await spoken(screenReply(null))).toEqual([SCREEN_QUESTION]);
  });
});

describe('the Spanish crisis reply keeps its words', () => {
  it('is byte-identical after the 988 line moved to TALK_TO_988_ES', () => {
    expect(getCrisisResponse(0.9, 'self', 'es', false)).toBe(
      `Escucho cuánto dolor sientes ahora, y me alegra mucho que me lo cuentes. Lo que sientes importa, y no tienes que cargar con esto solo.

Puedes llamar al 988 y oprimir 2 para hablar en español, o enviar un mensaje de texto con la palabra AYUDA al 988. Hay consejeros disponibles las 24 horas. Si estás en peligro ahora mismo, llama al 911.

Estoy aquí contigo. ¿Me cuentas qué está pasando?`
    );
  });
});

/** The repo's public non-crisis lines: the word list's false-alarm ceiling (2026-11-10). */
describe('false alarms on the public non-crisis corpora', () => {
  const root = resolve(__dirname, '../../../..');
  const json = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  const lines = (path: string) =>
    readFileSync(resolve(root, path), 'utf8')
      .trim()
      .split('\n')
      .map((row) => JSON.parse(row) as Record<string, string>);
  interface Turns {
    calls: Array<{ turns: Array<{ label: string; text: string }> }>;
  }
  const turnsOf = (path: string, label?: string) =>
    (json(path) as Turns).calls
      .flatMap((call) => call.turns)
      .filter((t) => !label || t.label === label)
      .map((t) => t.text);
  const hits = (texts: string[]) => texts.filter((t) => checkinWordsIn(t) !== null).length;

  it.each([
    [
      'crisis-eval hard negatives',
      () => turnsOf('scripts/crisis-eval/corpus/hard-negatives-2026-10-31.json', 'must-not-alarm'),
      0,
    ],
    [
      'crisis-eval recall hard negatives',
      () => turnsOf('scripts/crisis-eval/corpus/recall-hard-negatives-2026-11-01.json'),
      2,
    ],
    [
      'everyday call (none rows)',
      () =>
        (
          json('src/agents/__tests__/fixtures/crisis-everyday-call-2026-10-17.json') as Array<{
            label: string;
            text: string;
          }>
        )
          .filter((r) => r.label === 'none')
          .map((r) => r.text),
      0,
    ],
    [
      'router hard negatives',
      () => lines('apps/ml-training/router/data/hard_negatives_v6.jsonl').map((r) => r.query ?? ''),
      0,
    ],
    [
      'FTIS hard negatives',
      () => lines('data/ftis-training/hard_negatives.jsonl').map((r) => r.query ?? ''),
      0,
    ],
    [
      'no-tool negatives',
      () =>
        (
          json('scripts/tool-retrieval/fixtures/no-tool-negatives-v1.json') as Array<{
            query: string;
          }>
        ).map((r) => r.query),
      0,
    ],
  ] as const)('%s', (_name, texts, ceiling) => {
    const all = texts();
    expect(all.length).toBeGreaterThan(10);
    expect(hits(all)).toBeLessThanOrEqual(ceiling);
  });
});
