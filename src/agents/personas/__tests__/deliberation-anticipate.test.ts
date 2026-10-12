import { describe, expect, it, vi } from 'vitest';

const logInfo = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (...args: Parameters<typeof real.createLogger>) => {
      const logger = real.createLogger(...args);
      return new Proxy(logger, {
        get: (target, prop, receiver) =>
          prop === 'info'
            ? (...a: unknown[]) => logInfo(...a)
            : (Reflect.get(target, prop, receiver) as unknown),
      });
    },
  };
});

import { Deliberator, DELIBERATION_SYSTEM, type ThinkFn } from '../deliberation.js';
import {
  ANTICIPATE_SYSTEM,
  deliberationMode,
  keptAfterSimulation,
  parseAnticipation,
} from '../deliberation-anticipate.js';
import type { Line } from '../director-notes.js';

const SAID =
  "I got the Denver offer, it's the job I always wanted, but my mom just moved in with us and I keep not bringing it up with her.";
const NOTE = 'What does your mom think you should do, if you asked her straight?';
const MIND = '[HOW THEY ARE]\nThey tend to: jokes when anxious, then wants practical help.';

const reply = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    kind: 'question',
    note: NOTE,
    confidence: 0.8,
    whyNow: 'the decision hangs on her',
    doNotUseIf: 'they changed topic',
    options: [
      { kind: 'reframe', reaction: 'brushes_off', fit: 2 },
      { kind: 'question', reaction: 'opens_up', fit: 4 },
    ],
    chose: 1,
    because: 'invites_more',
    ...over,
  });

const lines: Line[] = [
  { speaker: 'user', text: SAID },
  { speaker: 'ferni', text: 'Huh. Denver.' },
];

function deliberator(text: string, mode: 'anticipate' | 'reflect' = 'anticipate') {
  const think = vi.fn<ThinkFn>(async () => ({ text }));
  return { d: new Deliberator({ sessionId: 's', think, mode }), think };
}

describe('deliberation mode', () => {
  it('is reflect unless DELIBERATION_MODE=anticipate', () => {
    expect(deliberationMode({})).toBe('reflect');
    expect(deliberationMode({ DELIBERATION_MODE: 'other' })).toBe('reflect');
    expect(deliberationMode({ DELIBERATION_MODE: 'anticipate' })).toBe('anticipate');
  });
});

describe('parseAnticipation', () => {
  it('reads two weighed options, the choice and a reason label', () => {
    expect(parseAnticipation(reply())).toEqual({
      options: [
        { kind: 'reframe', reaction: 'brushes_off', fit: 2 },
        { kind: 'question', reaction: 'opens_up', fit: 4 },
      ],
      chose: 1,
      because: 'invites_more',
    });
  });

  it('rejects anything outside the label sets (so no free text reaches the log)', () => {
    const bad = [
      { options: [{ kind: 'question', reaction: 'opens_up', fit: 4 }] },
      {
        options: [
          { kind: 'question', reaction: 'loves it', fit: 4 },
          { kind: 'reframe', reaction: 'neutral', fit: 2 },
        ],
      },
      {
        options: [
          { kind: 'question', reaction: 'opens_up', fit: 9 },
          { kind: 'reframe', reaction: 'neutral', fit: 2 },
        ],
      },
      { chose: 2 },
      { because: 'she said she misses Denver' },
    ];
    for (const over of bad) expect(parseAnticipation(reply(over))).toBeNull();
    expect(parseAnticipation('{"kind":"none"}')).toBeNull();
  });

  it('keeps only the chosen, simulated thought that should not land badly', () => {
    const t = { kind: 'question' };
    expect(keptAfterSimulation(t, parseAnticipation(reply()))).toBe(t);
    expect(keptAfterSimulation(t, null)).toBeNull();
    expect(keptAfterSimulation({ kind: 'insight' }, parseAnticipation(reply()))).toBeNull();
  });
});

describe('Deliberator, anticipate mode', () => {
  it('asks the simulating prompt with how they tend to be; reflect mode keeps its prompt and leaves the mind note out', async () => {
    const a = deliberator(reply());
    await a.d.observe(lines, null, 'Mom moved in in March.', MIND);
    expect(a.think.mock.calls[0]![0]).toBe(ANTICIPATE_SYSTEM);
    expect(a.think.mock.calls[0]![1]).toContain('jokes when anxious');
    expect(a.think.mock.calls[0]![1]).toContain('Mom moved in in March.');

    const r = deliberator(reply(), 'reflect');
    await r.d.observe(lines, null, 'Mom moved in in March.', MIND);
    expect(r.think.mock.calls[0]![0]).toBe(DELIBERATION_SYSTEM);
    expect(r.think.mock.calls[0]![1]).not.toContain('jokes when anxious');
  });

  it('offers the option the simulation expects this caller to take better', async () => {
    const { d } = deliberator(reply());
    await d.observe(lines, null);
    expect(d.noteFor('Anyway.', false)).toContain(NOTE);
  });

  it('drops a choice the simulation expects to land badly, and counts it', async () => {
    const { d } = deliberator(
      reply({
        options: [
          { kind: 'reframe', reaction: 'neutral', fit: 3 },
          { kind: 'question', reaction: 'defensive', fit: 4 },
        ],
      })
    );
    await d.observe(lines, null);
    expect(d.noteFor('Anyway.', false)).toBe('');
    expect(d.summary()).toMatchObject({ runs: 1, none: 1, landsBadly: 1 });
  });

  it('drops a thought that was not weighed, or is not the one it chose', async () => {
    const unweighed = deliberator(reply({ options: undefined, chose: undefined }));
    await unweighed.d.observe(lines, null);
    expect(unweighed.d.noteFor('Anyway.', false)).toBe('');
    expect(unweighed.d.summary()).toMatchObject({ none: 1, failed: 0 });
    const mismatched = deliberator(reply({ chose: 0 }));
    await mismatched.d.observe(lines, null);
    expect(mismatched.d.noteFor('Anyway.', false)).toBe('');
  });

  it('keeps the crisis hold', async () => {
    const { d } = deliberator(reply());
    await d.observe(lines, null);
    d.hold();
    expect(d.noteFor('Anyway.', false)).toBe('');
  });

  it('logs what won and why as labels, never the words', async () => {
    logInfo.mockClear();
    const { d } = deliberator(reply());
    await d.observe(lines, null, '', MIND);
    const [fields, msg] = logInfo.mock.calls.find((c) => c[1] === 'DELIBERATION')!;
    expect(msg).toBe('DELIBERATION');
    expect(fields).toMatchObject({
      mode: 'anticipate',
      anticipated: true,
      chose: 1,
      because: 'invites_more',
      choseBestFit: true,
      landsBadly: false,
    });
    const logged = JSON.stringify(logInfo.mock.calls);
    for (const words of [NOTE, 'Denver', 'mom', 'jokes when anxious', 'the decision hangs on her'])
      expect(logged).not.toContain(words);
  });
});
