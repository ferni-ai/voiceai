/**
 * keepForRecall reads MEMORY_TOOLS_HONEST once, when it starts. The secret check and the
 * embedding are awaited before the forgotten-topics check; if the call ends meanwhile and the
 * next caller's flags are applied (cohort-flags.ts), the honest write must still fail closed
 * on a forgotten topic, as it would have for the caller who asked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const forgetting = vi.hoisted(() => ({
  within: vi.fn(async () => (text: string) => text.includes('Denver')),
  check: vi.fn(async () => null),
}));
vi.mock('../../recall/forget-every-reader.js', async (orig) => ({
  ...(await orig<object>()),
  forgottenWithin: forgetting.within,
  forgottenCheck: forgetting.check,
}));

import { keepForRecall, type FactDocWrite } from '../remembered-facts.js';
import { useSecretModel } from '../../secret-check.js';

const create = vi.fn(async (_u: string, docs: FactDocWrite[]) => docs.length);
const deps = { store: { create }, contactData: () => false };

beforeEach(() => {
  create.mockClear();
  forgetting.within.mockClear();
  forgetting.check.mockClear();
  vi.stubEnv('FORGET_EVERY_READER', '');
  vi.stubEnv('REMEMBER_TO_RECALL', '');
  vi.stubEnv('MEMORY_TOOLS_HONEST', 'on');
});
afterEach(() => {
  useSecretModel(null);
  vi.unstubAllEnvs();
});

describe('keepForRecall under MEMORY_TOOLS_HONEST', () => {
  it("keeps the honest forgotten check when the next caller's flags land mid-write", async () => {
    useSecretModel(async () => {
      vi.stubEnv('MEMORY_TOOLS_HONEST', 'off'); // the next call's start, during the secret check
      return '{"secret":false}';
    });
    const got = await keepForRecall('uid-read-once', { fact: 'my sister moves to Denver' }, deps);
    expect(got).toEqual({ kind: 'refused', reason: 'forgotten' });
    expect(forgetting.within).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('with the flag steady, a fact on no forgotten topic is kept', async () => {
    useSecretModel(async () => '{"secret":false}');
    const got = await keepForRecall('uid-read-once', { fact: 'my sister moves to Boise' }, deps);
    expect(got.kind).toBe('kept');
    expect(create).toHaveBeenCalledTimes(1);
  });
});
