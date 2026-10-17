/**
 * rememberAboutUser never returns '' and never claims more than it did
 * (remember-results.ts): both live versions, every branch.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const write = vi.hoisted(() =>
  vi.fn(async (): Promise<{ success: boolean; memoryId?: string }> => ({ success: true, memoryId: 'm1' }))
); // prettier-ignore
vi.mock('../../../../services/unified-memory-service.js', () => ({
  getUnifiedMemoryService: () => ({ write }),
}));

import { REMEMBERED, REMEMBERED_THIS_CALL } from '../remember-results.js';
import { rememberAboutUserDef } from '../tools.js';
import { rememberAboutUserUnifiedDef } from '../tools-unified.js';

type Args = { fact: string; category: string; importance: string };
type Execute = (args: Args, opts: unknown) => Promise<string>;
const run = (def: { create: (ctx: never) => unknown }, userData: Record<string, unknown>) =>
  (def.create({ agentId: 'ferni' } as never) as { execute: Execute }).execute(
    { fact: 'has two kids', category: 'personal', importance: 'high' },
    { ctx: { userData } }
  );

afterEach(() => write.mockClear());

describe('rememberAboutUser (tools.ts)', () => {
  it('says noted for next time when it hands the fact to the learning engine', async () => {
    const captureInsight = vi.fn();
    const userData: Record<string, unknown> = { services: { captureInsight } };
    expect(await run(rememberAboutUserDef, userData)).toBe(REMEMBERED);
    expect(captureInsight).toHaveBeenCalledWith('relationship', 'explicit_memory_personal', 'has two kids', 0.9); // prettier-ignore
    expect(userData.keyMoments).toEqual(['[personal] has two kids']);
  });

  it('says this call only when there is nothing to keep it for later', async () => {
    const userData: Record<string, unknown> = {};
    expect(await run(rememberAboutUserDef, userData)).toBe(REMEMBERED_THIS_CALL);
    expect(userData.keyMoments).toEqual(['[personal] has two kids']);
  });
});

describe('rememberAboutUser (tools-unified.ts)', () => {
  it('says noted for next time only when the write succeeded', async () => {
    expect(await run(rememberAboutUserUnifiedDef, { userId: 'u1' })).toBe(REMEMBERED);
    write.mockResolvedValueOnce({ success: false });
    expect(await run(rememberAboutUserUnifiedDef, { userId: 'u1' })).toBe(REMEMBERED_THIS_CALL);
  });

  it('with no caller id, still notes it for this call, as it says, and writes nothing', async () => {
    const userData: Record<string, unknown> = {};
    expect(await run(rememberAboutUserUnifiedDef, userData)).toBe(REMEMBERED_THIS_CALL);
    expect(userData.keyMoments).toEqual(['[personal] has two kids']);
    expect(write).not.toHaveBeenCalled();
  });
});
