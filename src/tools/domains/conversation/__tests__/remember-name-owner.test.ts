/**
 * CALL_ME_VOCATIVE=on: rememberName is the one writer of the caller's name.
 * Driven as the live path runs a turn: the preemptive and final requests, the
 * model's tool calls, then the tool-reply request with the same caller words
 * (ferni-state.ts: "the reply after a tool ran is a new request for the same
 * words"). #2924's round-2 verify: name-correction's cached yes to Sam landed on
 * that tool-reply request after the tool had saved Jamie.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createConversationTools } from '../conversation-tools.js';
import { withTurnReminder } from '../../../../agents/personas/turn-request.js';

const persisted = vi.hoisted(() => [] as string[]);
const owner = vi.hoisted(() => ({ verified: true }));
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
  sessionIsVerifiedOwner: () => owner.verified,
}));

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  persisted.length = 0;
  owner.verified = true;
});

type Exec = (a: { name: string }, o: { ctx: object }) => Promise<string>;
const { execute } = createConversationTools().rememberName as unknown as { execute: Exec };
/** Background writes (runBackground) land before we read them. */
const landed = (): Promise<void> =>
  new Promise((r) => {
    setTimeout(r, 30);
  });

let seq = 0;
function call(nc: 'on' | 'off') {
  process.env.CALL_ME_VOCATIVE = 'on';
  process.env.NAME_CORRECTION = nc;
  process.env.NAME_CAPTURE_STRICT = 'off';
  const saveProfile = vi.fn(async () => undefined);
  const userProfile: Record<string, unknown> = { id: 'u1', name: 'Seth', preferredName: 'Seth' };
  const userData: Record<string, unknown> = {
    userId: 'u1',
    userName: 'Seth',
    personaId: 'ferni',
    services: { sessionId: `s-one-writer-${++seq}`, userProfile, saveProfile },
  };
  const session = { userData };
  const said: string[] = [];
  const history = (): llm.ChatContext => {
    const ctx = llm.ChatContext.empty();
    for (const line of said) {
      ctx.addMessage({ role: 'assistant', content: 'Hey, good to hear you.' });
      ctx.addMessage({ role: 'user', content: line });
    }
    return ctx;
  };
  /**
   * One caller turn: both requests, then each round of the model's tool calls,
   * each followed by its tool-reply request (same caller words).
   */
  const turn = async (words: string, ...rounds: string[][]): Promise<string[]> => {
    said.push(words);
    withTurnReminder(history(), session);
    withTurnReminder(history(), session);
    const outs: string[] = [];
    const ctx = history();
    for (const [r, toolCalls] of rounds.entries()) {
      for (const [i, name] of toolCalls.entries()) {
        const output = await execute({ name }, { ctx: { userData, session } });
        outs.push(output);
        const callId = `c${seq}-${said.length}-${r}-${i}`;
        ctx.insert([
          llm.FunctionCall.create({ callId, name: 'rememberName', args: JSON.stringify({ name }) }),
          llm.FunctionCallOutput.create({ callId, name: 'rememberName', output, isError: false }),
        ]);
      }
      withTurnReminder(ctx, session); // the tool-reply request
    }
    await landed();
    return outs;
  };
  return { userData, userProfile, turn };
}

const final = (c: ReturnType<typeof call>) => ({
  userName: c.userData.userName,
  name: c.userProfile.name,
  preferredName: c.userProfile.preferredName,
});

describe.each(['off', 'on'] as const)('NAME_CORRECTION=%s, owner on the line', (nc) => {
  it.each([
    ['call me Sam, or actually Jamie', 'Sam', 'Jamie'],
    ['call me Jamie, no, Sam', 'Jamie', 'Sam'],
  ])('"%s", then "yes": only the newest name is saved', async (words, older, newer) => {
    const c = call(nc);
    await c.turn(words, [older, newer]);
    expect(final(c).preferredName).toBe('Seth');
    const outs = await c.turn('yes', [newer], [older]); // then a second round for the older name
    expect(outs[0]).toContain(`Name "${newer}" stored`);
    expect(outs[1]).not.toContain('stored');
    expect(final(c)).toEqual({ userName: newer, name: newer, preferredName: newer });
    expect(persisted).not.toContain(older);
  });

  it('"call me Sam", then "actually, call me Jamie", then "yes": Jamie', async () => {
    const c = call(nc);
    await c.turn('call me Sam', ['Sam']);
    await c.turn('actually, call me Jamie', ['Jamie']);
    const outs = await c.turn('yes', ['Jamie']);
    expect(outs[0]).toContain('stored');
    await c.turn('great, thanks', ['Sam']);
    expect(final(c)).toEqual({ userName: 'Jamie', name: 'Jamie', preferredName: 'Jamie' });
    expect(persisted).not.toContain('Sam');
  });
});

describe('name-correction asks, the tool saves (NAME_CORRECTION=on)', () => {
  it("its own question's yes lets the tool save that name on that turn", async () => {
    const c = call('on');
    await c.turn('actually, call me Jamie');
    const outs = await c.turn('yes', ['Jamie']);
    expect(outs[0]).toContain('Name "Jamie" stored');
    expect(final(c)).toEqual({ userName: 'Jamie', name: 'Jamie', preferredName: 'Jamie' });
    expect(persisted).toEqual([]); // name-correction itself writes nothing
  });

  it('a yes with no tool call writes nothing', async () => {
    const c = call('on');
    await c.turn('actually, call me Jamie');
    await c.turn('yes');
    expect(final(c)).toEqual({ userName: 'Seth', name: 'Seth', preferredName: 'Seth' });
    expect(persisted).toEqual([]);
  });

  it('its yes is not a yes to another name the tool calls for', async () => {
    const c = call('on');
    await c.turn('actually, call me Jamie');
    const outs = await c.turn('yes', ['Sam']);
    expect(outs[0]).not.toContain('stored');
    expect(final(c).preferredName).toBe('Seth');
  });
});

describe('anyone may rename the call; only the verified owner, the account', () => {
  it.each(['off', 'on'] as const)(
    'NAME_CORRECTION=%s, not the verified owner: the call says Jamie, the account stays',
    async (nc) => {
      owner.verified = false;
      const c = call(nc);
      await c.turn('call me Jamie', ['Jamie']);
      const outs = await c.turn('yes', ['Jamie']);
      expect(outs[0]).toContain('Name "Jamie" stored');
      expect(final(c)).toEqual({ userName: 'Jamie', name: 'Seth', preferredName: 'Seth' });
      expect(persisted).toEqual([]);
    }
  );
});
