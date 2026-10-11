import { afterEach, describe, expect, it, vi } from 'vitest';

const forget = vi.hoisted(() =>
  vi.fn(async (): Promise<{ kind: string; marked?: number }> => ({ kind: 'forgotten', marked: 2 }))
);
vi.mock('../../../../memory/recall/forget.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../memory/recall/forget.js')>()),
  forgetForCaller: forget,
}));

import { forgetMemoryDef } from '../tools.js';

type Execute = (
  args: { whatToForget: string; confirmDeletion: boolean },
  opts: unknown
) => Promise<string>;
const execute = (_userData: Record<string, unknown>) =>
  (forgetMemoryDef.create({ agentId: 'ferni' } as never) as unknown as { execute: Execute })
    .execute;

afterEach(() => forget.mockClear());

describe('forgetMemory (the live tool)', () => {
  it('deletes the topic from stored memory once the caller confirms', async () => {
    const userData = { userId: 'u-1', keyMoments: ['my divorce was hard', 'Biscuit learned sit'] };
    const run = execute(userData);
    expect(
      await run({ whatToForget: 'my divorce', confirmDeletion: false }, { ctx: { userData } })
    ).toMatch(/confirm/);
    expect(forget).not.toHaveBeenCalled();

    expect(
      await run({ whatToForget: 'my divorce', confirmDeletion: true }, { ctx: { userData } })
    ).toBe('');
    expect(forget).toHaveBeenCalledWith('u-1', 'my divorce');
    expect(userData.keyMoments).toEqual(['Biscuit learned sit']);
  });

  it('never says it forgot when the delete failed', async () => {
    forget.mockResolvedValueOnce({ kind: 'failed' });
    const userData = { userId: 'u-1' };
    const reply = await execute(userData)(
      { whatToForget: 'my divorce', confirmDeletion: true },
      { ctx: { userData } }
    );
    expect(reply).toMatch(/couldn't remove/);
  });

  it('asks to narrow a topic that covers too much, instead of forgetting it', async () => {
    forget.mockResolvedValueOnce({ kind: 'too-broad' });
    const userData = { userId: 'u-1' };
    const reply = await execute(userData)(
      { whatToForget: 'my family', confirmDeletion: true },
      { ctx: { userData } }
    );
    expect(reply).toMatch(/Which part should I forget/);
  });
});
