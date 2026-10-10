/**
 * With ASSISTANT_ACTIONS_REAL=on, each shortcut runs its registered target
 * with the user's request mapped onto that tool's parameters, and returns
 * what the target said. The target domains are stubbed here; that they are
 * registered is pinned in shortcut-targets.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../../../registry/types.js';

const ran = vi.hoisted(() => [] as Array<{ id: string; userId?: string; args: unknown }>);
const fakeDomain = (id: string) => ({
  getToolDefinitions: () => [
    {
      id,
      create: (c: { userId?: string }) => ({
        execute: async (args: unknown) => {
          ran.push({ id, userId: c.userId, args });
          return `${id} did it`;
        },
      }),
    },
  ],
});
vi.mock('../../telephony/index.js', () => fakeDomain('callOnBehalf'));
vi.mock('../../communication/index.js', () => fakeDomain('reachOut'));

const { getToolDefinitions } = await import('../index.js');
const ctx = { userId: 'u1', agentId: 'ferni' } as ToolContext;

async function run(shortcut: string, args: object): Promise<string> {
  const def = (await getToolDefinitions()).find((d) => d.id === shortcut)!;
  return String(await def.create(ctx).execute(args, {}));
}

beforeEach(() => {
  ran.length = 0;
  process.env.ASSISTANT_ACTIONS_REAL = 'on';
});
afterEach(() => {
  delete process.env.ASSISTANT_ACTIONS_REAL;
});

describe('flag on: shortcuts hand off to the real tools', () => {
  it('quickCall → callOnBehalf, for this user, with the message as the purpose', async () => {
    expect(await run('quickCall', { contact: 'mom', message: 'dinner at 7' })).toBe(
      'callOnBehalf did it'
    );
    expect(ran).toEqual([
      {
        id: 'callOnBehalf',
        userId: 'u1',
        args: { contactQuery: 'mom', purpose: 'Pass on this message: dinner at 7' },
      },
    ]);
  });

  it('quickText → reachOut by text', async () => {
    expect(await run('quickText', { contact: 'mom', message: 'on my way' })).toBe(
      'reachOut did it'
    );
    expect(ran[0].args).toEqual({
      contact: 'mom',
      purpose: 'on my way',
      preferredChannel: 'text',
      customMessage: 'on my way',
    });
  });

  it('quickEmail → reachOut by email', async () => {
    await run('quickEmail', { recipient: 'sam@x.com', subject: 'Lunch', body: 'Friday?' });
    expect(ran[0].args).toEqual({
      contact: 'sam@x.com',
      purpose: 'Lunch',
      preferredChannel: 'email',
      customMessage: 'Friday?',
    });
  });
});
