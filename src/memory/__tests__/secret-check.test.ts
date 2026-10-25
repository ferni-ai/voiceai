/**
 * readSecret (secret-check.ts, #2514 round 3): the model's yes or no on a
 * remembered fact. Only a clear no is 'clear'; a timeout, an error, an unusable
 * reply or no model is 'failed', and what it logs never carries the fact.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as string[]);
vi.mock('../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../utils/safe-logger.js')>();
  const keep = (...args: unknown[]) => void logged.push(JSON.stringify(args));
  return { ...real, createLogger: () => ({ info: keep, warn: keep, error: keep, debug: keep }) };
});

import {
  parseSecretReply,
  readSecret,
  SECRET_CHECK_PROMPT,
  useSecretModel,
  type SecretModel,
} from '../secret-check.js';

const FACT = 'the back gate opens with 6 1 9 4';
const answers = (reply: string): SecretModel => vi.fn(async () => reply);

afterEach(() => {
  useSecretModel(null);
  logged.length = 0;
});

describe('readSecret', () => {
  it('a yes is secret, a no is clear', async () => {
    expect(await readSecret(FACT, { model: answers('{"secret":true}') })).toBe('secret');
    expect(await readSecret('I ran 5k today', { model: answers('{"secret": false}') })).toBe('clear'); // prettier-ignore
  });

  it('sends the one question and the fact as JSON', async () => {
    const model = answers('{"secret":false}');
    await readSecret(FACT, { model });
    expect(model).toHaveBeenCalledWith(SECRET_CHECK_PROMPT, JSON.stringify({ text: FACT }), expect.any(AbortSignal)); // prettier-ignore
  });

  it.each([
    ['garbage', 'sure, happy to help'],
    ['no JSON verdict', '{"answer":"no"}'],
    ['a string, not a boolean', '{"secret":"false"}'],
    ['broken JSON', '{"secret":fal'],
    ['empty (Gemini not configured)', ''],
  ])('%s fails closed', async (_why, reply) => {
    expect(await readSecret(FACT, { model: answers(reply) })).toBe('failed');
  });

  it('an error fails closed and logs its class, never the fact or the message', async () => {
    const model: SecretModel = async () => {
      throw new TypeError(`could not parse ${FACT}`);
    };
    expect(await readSecret(FACT, { model })).toBe('failed');
    expect(logged.join('\n')).toContain('TypeError');
    expect(logged.join('\n')).not.toContain('6 1 9 4');
  });

  it('a timeout fails closed and aborts the call', async () => {
    let aborted = false;
    const model: SecretModel = async (_p, _c, signal) =>
      new Promise((resolve) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          setTimeout(() => resolve('{"secret":false}'), 5); // a late no is not used
        });
      });
    expect(await readSecret(FACT, { model, timeoutMs: 20 })).toBe('failed');
    expect(aborted).toBe(true);
    expect(logged.join('\n')).not.toContain('6 1 9 4');
  });

  it('no model registered fails closed; a registered one is used', async () => {
    expect(await readSecret(FACT)).toBe('failed');
    useSecretModel(answers('{"secret":false}'));
    expect(await readSecret(FACT)).toBe('clear');
  });
});

describe('parseSecretReply', () => {
  it.each([
    ['{"secret":true}', true],
    ['```json\n{"secret": false}\n```', false],
    ['{"secret":null}', null],
    ['no', null],
  ])('%j → %s', (reply, read) => {
    expect(parseSecretReply(reply)).toBe(read);
  });
});
