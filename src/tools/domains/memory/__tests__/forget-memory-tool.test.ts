import { afterEach, describe, expect, it, vi } from 'vitest';

const forget = vi.hoisted(() =>
  vi.fn(
    async (): Promise<{ kind: string; marked?: number; deleted?: number; hidden?: number }> => ({
      kind: 'forgotten',
      marked: 2,
    })
  )
);
vi.mock('../../../../memory/recall/forget.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../memory/recall/forget.js')>()),
  forgetForCaller: forget,
}));

import { forgetMemoryDef } from '../tools.js';
import { getToolDescription } from '../../../utils/tool-descriptions.js';

type Execute = (
  args: { whatToForget: string; confirmDeletion: boolean },
  opts: unknown
) => Promise<string>;
const execute = (_userData: Record<string, unknown>) =>
  (forgetMemoryDef.create({ agentId: 'ferni' } as never) as unknown as { execute: Execute })
    .execute;

afterEach(() => forget.mockClear());

describe('forgetMemory (the live tool)', () => {
  it('forgets the topic in stored memory once the caller confirms', async () => {
    const userData = { userId: 'u-1', keyMoments: ['my divorce was hard', 'Biscuit learned sit'] };
    const run = execute(userData);
    expect(
      await run({ whatToForget: 'my divorce', confirmDeletion: false }, { ctx: { userData } })
    ).toMatch(/confirm/);
    expect(forget).not.toHaveBeenCalled();

    const reply = await run(
      { whatToForget: 'my divorce', confirmDeletion: true },
      { ctx: { userData } }
    );
    expect(forget).toHaveBeenCalledWith('u-1', 'my divorce');
    expect(userData.keyMoments).toEqual(['Biscuit learned sit']);
    // Hidden, not erased: he says only that he won't bring it up (FORGET_DELETES off)
    expect(reply).toContain('"I won\'t bring that up again."');
    expect(reply).toMatch(/Don't say you've forgotten, deleted or erased it/);
  });

  it('says it deleted the facts only when every one was deleted (FORGET_DELETES on)', async () => {
    const userData = { userId: 'u-1' };
    const run = execute(userData);
    const confirm = { whatToForget: 'my divorce', confirmDeletion: true };
    forget.mockResolvedValueOnce({ kind: 'forgotten', marked: 2, deleted: 2, hidden: 0 });
    expect(await run(confirm, { ctx: { userData } })).toContain(
      "\"I've deleted the facts I'd saved about that, and I won't bring it up again.\""
    );
    forget.mockResolvedValueOnce({ kind: 'forgotten', marked: 2, deleted: 1, hidden: 1 });
    const partly = await run(confirm, { ctx: { userData } });
    expect(partly).not.toMatch(/deleted the facts/);
    expect(partly).toContain('"I won\'t bring that up again."');
  });

  it("tells the model what it does, not that it deletes", () => {
    const description = getToolDescription('forgetMemory');
    expect(description).toMatch(/not erased/);
    expect(description).not.toMatch(/delete memories/i);
    expect(forgetMemoryDef.description).not.toMatch(/remove|delete/i);
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
