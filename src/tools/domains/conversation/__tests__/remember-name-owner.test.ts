/**
 * Two names in one turn, CALL_ME_VOCATIVE=on: the yes is for the newest name
 * the tool asked about. With NAME_CORRECTION=on and the account owner on the
 * line, name-correction heard the older name too; its rename must not win
 * (#2924 round-1 verifier: "call me Sam, or actually Jamie", "yes" saved Sam).
 * Driven through the registered tool and the live turn reminder.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createConversationTools } from '../conversation-tools.js';
import { withTurnReminder } from '../../../../agents/personas/turn-request.js';

const persisted = vi.hoisted(() => [] as string[]);
vi.mock('../../../../memory/firestore-store.js', () => ({
  getFirestoreStore: () => ({
    atomicProfileUpdate: vi.fn(
      async (_id: string, f: (p: object) => { preferredName?: string }) => {
        persisted.push(f({}).preferredName ?? '');
        return null;
      }
    ),
  }),
}));
vi.mock('../../../../agents/voice-agent-entry/caller-recognition.js', async (real) => ({
  ...(await real<object>()),
  sessionIsVerifiedOwner: () => true,
}));

/** name-correction persists in the background (runBackground): let it land before reading. */
const landed = (): Promise<void> =>
  new Promise((r) => {
    setTimeout(r, 50);
  });

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  persisted.length = 0;
});

type Exec = (a: { name: string }, o: { ctx: object }) => Promise<string>;
const { execute } = createConversationTools().rememberName as unknown as { execute: Exec };

let seq = 0;
function call(nc: 'on' | 'off') {
  process.env.CALL_ME_VOCATIVE = 'on';
  process.env.NAME_CORRECTION = nc;
  process.env.NAME_CAPTURE_STRICT = 'off';
  const saveProfile = vi.fn(async () => undefined);
  const userProfile: Record<string, unknown> = { id: 'u1', name: 'Seth', preferredName: 'Seth' };
  const userData = {
    userId: 'u1',
    userName: 'Seth',
    personaId: 'ferni',
    services: { sessionId: `s-owner-${++seq}`, userProfile, saveProfile },
  };
  const said: string[] = [];
  const session = { userData };
  const turn = (words: string): void => {
    const ctx = llm.ChatContext.empty();
    for (const line of [...said, words]) {
      ctx.addMessage({ role: 'assistant', content: 'Hey, good to hear you.' });
      ctx.addMessage({ role: 'user', content: line });
    }
    withTurnReminder(ctx, session);
    withTurnReminder(ctx, session);
    said.push(words);
  };
  const tool = (name: string): Promise<string> => execute({ name }, { ctx: { userData, session } });
  return { userData, userProfile, turn, tool };
}

const CASES = [
  ['call me Sam, or actually Jamie', 'Sam', 'Jamie'],
  ['call me Jamie, no, Sam', 'Jamie', 'Sam'],
] as const;

describe('two names in one turn: the yes is for the newest', () => {
  it.each((['off', 'on'] as const).flatMap((nc) => CASES.map((c) => [nc, ...c] as const)))(
    'NAME_CORRECTION=%s, owner: "%s", tool asks %s then %s, "yes"',
    async (nc, words, older, newer) => {
      const c = call(nc);
      c.turn(words);
      await c.tool(older);
      expect(await c.tool(newer)).toContain('Not saved yet');
      expect(c.userProfile.preferredName).toBe('Seth');
      c.turn('yes');
      expect(await c.tool(older)).not.toContain('stored'); // the older name never takes the yes
      expect(c.userProfile.preferredName).toBe('Seth');
      expect(await c.tool(newer)).toContain(`Name "${newer}" stored`);
      expect(c.userProfile).toMatchObject({ name: newer, preferredName: newer });
      await landed();
      expect(persisted).not.toContain(older);
    }
  );

  it.each(CASES)(
    'NAME_CORRECTION=on, owner: "%s", tool asks only %s, "yes", then the model calls %s',
    async (words, older, newer) => {
      const c = call('on');
      c.turn(words);
      await c.tool(newer);
      c.turn('yes');
      expect(c.userData.userName).toBe('Seth'); // name-correction's older name yields
      expect(await c.tool(older)).not.toContain('stored');
      expect(c.userProfile.preferredName).toBe('Seth');
      await landed();
      expect(persisted).toEqual([]);
      expect(await c.tool(newer)).toContain('stored');
      expect(c.userProfile.preferredName).toBe(newer);
    }
  );

  it('NAME_CORRECTION=on, owner, no tool question: its own yes still renames, as before', async () => {
    const c = call('on');
    c.turn('actually, call me Jamie');
    c.turn('yes');
    expect(c.userData.userName).toBe('Jamie');
    expect(c.userProfile.preferredName).toBe('Jamie');
    await landed();
    expect(persisted).toEqual(['Jamie']); // the write this file checks for does reach the mock
  });
});
