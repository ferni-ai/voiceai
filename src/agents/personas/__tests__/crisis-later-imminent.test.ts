/**
 * The pattern read stops at its first plain match. A suicidal line ahead of an imminent one in the
 * same turn must not hide the imminent one: the reply leads with 911, whatever the classifier
 * does (off, too slow, or saying none). Softened, negated or someone else's later lines don't.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { detectCrisis } from '../../../services/safety/crisis-guard.js';
import { gatedReply } from '../crisis-gate.js';
import { readTypedMessageForCrisis } from '../crisis-gate-text.js';

/** Suicidal words first, then means taken or in hand; and the reverse order. */
const LATER_IMMINENT = [
  'i want to die. i just took all my pills',
  'i want to die, i overdosed',
  'i want to kill myself. i have a gun to my head',
  "i'm suicidal and i swallowed all the pills in the cabinet",
  "i want to end it all. i'm standing on the ledge",
  'i just took all my pills. i want to die',
];
/** A plain suicidal line, and a later imminent one the words around it soften. */
const SOFTENED_LATER = [
  'i want to die. i took all my pills years ago',
  "i want to die. i'm not standing on the ledge",
];

const BASE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_TIMEOUT_MS: '40' };
const CLASSIFIER: ReadonlyArray<
  readonly [string, Record<string, string>, CrisisGenerateFn | undefined]
> = [
  ['off', { ...BASE, CRISIS_CLASSIFIER_MODE: 'off' }, undefined],
  [
    'too slow',
    { ...BASE, CRISIS_CLASSIFIER_MODE: 'live' },
    (_prompt, _content, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  ],
  [
    'saying none',
    { ...BASE, CRISIS_CLASSIFIER_MODE: 'live' },
    async () => '{"risk":"none","subject":"self"}',
  ],
];

const leads911 = (reply: string) => {
  const at911 = reply.search(/\b911\b/);
  const at988 = reply.search(/\b988\b/);
  return at911 >= 0 && (at988 < 0 || at911 < at988);
};

/** What the voice gate speaks for one caller line: the script, or the model's own reply. */
async function spoken(
  line: string,
  env: Record<string, string>,
  generate?: CrisisGenerateFn
): Promise<string> {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'user', content: line });
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.42);
  const model = async () =>
    new ReadableStream<unknown>({
      start(controller) {
        controller.enqueue('Sounds good.');
        controller.close();
      },
    });
  const opener = { wrap: (stream: ReadableStream<unknown>) => stream };
  const reply = await gatedReply(ctx, { userData: undefined }, model as never, opener as never, {
    env,
    generate,
  });
  let said = '';
  if (reply) for await (const chunk of reply as unknown as AsyncIterable<string>) said += chunk;
  random.mockRestore();
  return said;
}

beforeEach(() => resetCrisisClassifierCache());

describe('a later imminent line in the same turn: 911 first', () => {
  it.each(LATER_IMMINENT)('the pattern read: %s', (line) => {
    const read = detectCrisis(line);
    expect(read.isCrisis).toBe(true);
    expect(read.indicators).toContain('imminent_danger');
    expect(leads911(read.suggestedResponse ?? '')).toBe(true);
  });

  for (const [how, env, generate] of CLASSIFIER)
    it.each(LATER_IMMINENT)(`classifier ${how}: %s`, async (line) => {
      expect(leads911(await spoken(line, env, generate))).toBe(true);
      const typed = await readTypedMessageForCrisis(line, [], { env, generate });
      expect(typed.action).toBe('replace');
      expect(typed.action === 'replace' && leads911(typed.reply)).toBe(true);
    });
});

describe('a later line the words around it soften: the crisis read, no 911', () => {
  it.each(SOFTENED_LATER)('%s', (line) => {
    const read = detectCrisis(line);
    expect(read.isCrisis).toBe(true);
    expect(read.indicators).toContain('explicit_crisis_language');
    expect(read.indicators).not.toContain('imminent_danger');
  });

  it('two plain suicidal lines and no means: the crisis read, no 911', () => {
    const read = detectCrisis("i want to die. i'm better off dead");
    expect(read.indicators).toContain('explicit_crisis_language');
    expect(read.indicators).not.toContain('imminent_danger');
  });

  it('negated throughout: no crisis', () => {
    const read = detectCrisis("i don't want to die. i'm not standing on the ledge");
    expect(read.indicators).not.toContain('imminent_danger');
    expect(read.indicators).not.toContain('explicit_crisis_language');
  });
});
