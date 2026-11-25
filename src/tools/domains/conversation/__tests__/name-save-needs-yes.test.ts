/**
 * NAME_SAVE_NEEDS_YES=on (#4389): a name said on a call renames the account only
 * after their yes, without CALL_ME_VOCATIVE. Driven as the live path runs a turn
 * (remember-name-owner.test.ts): both requests through withTurnReminder, the
 * model's rememberName calls through the real tool, then the tool-reply request.
 * The in-memory profile is what the end-of-call, every-3-turns and 30 s saves
 * write (session-manager.ts saveProfile, process-turn.ts), so it is read here as
 * "what the account keeps".
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createConversationTools } from '../conversation-tools.js';
import { withTurnReminder } from '../../../../agents/personas/turn-request.js';
import { callMeNote } from '../../../../agents/personas/call-me-note.js';
import {
  clearPhoneListenersForTests,
  notePhoneListener,
} from '../../../../agents/shared/performance/phone-voice-profile.js';
import { writeAccountName } from '../../../../services/identity/account-name.js';

const persisted = vi.hoisted(() => [] as string[]);
const nameLines = vi.hoisted(() => [] as unknown[][]);
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
// Only account-name.ts's logger is caught; every other module logs as usual.
vi.mock('../../../../utils/safe-logger.js', async (real) => {
  const actual = await real<typeof import('../../../../utils/safe-logger.js')>();
  const caught = { info: (...args: unknown[]) => nameLines.push(args) };
  return {
    ...actual,
    createLogger: (opts: { module?: string }) =>
      opts?.module === 'AccountName' ? caught : actual.createLogger(opts as never),
  };
});

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  persisted.length = 0;
  nameLines.length = 0;
  clearPhoneListenersForTests();
});

type Exec = (a: { name: string }, o: { ctx: object }) => Promise<string>;
const { execute } = createConversationTools().rememberName as unknown as { execute: Exec };
/** Background writes (runBackground) land before we read them. */
const landed = (): Promise<void> =>
  new Promise((r) => {
    setTimeout(r, 30);
  });

let seq = 0;
function call(flags: { needsYes: 'on' | 'off'; vocative?: 'on' | 'off'; phone?: boolean }) {
  process.env.NAME_SAVE_NEEDS_YES = flags.needsYes;
  process.env.CALL_ME_VOCATIVE = flags.vocative ?? 'off';
  process.env.NAME_CORRECTION = 'on';
  process.env.NAME_CAPTURE_STRICT = 'off';
  const sessionId = `s-needs-yes-${++seq}`;
  if (flags.phone) notePhoneListener(sessionId, { identity: 'sip_caller' });
  const saveProfile = vi.fn(async () => undefined);
  const userProfile: Record<string, unknown> = { id: 'u1', name: 'Jess', preferredName: 'Jess' };
  const userData: Record<string, unknown> = {
    userId: 'u1',
    userName: 'Jess',
    personaId: 'ferni',
    services: { sessionId, userProfile, saveProfile },
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
  /** One caller turn: both requests, the model's rememberName calls, the tool-reply request. */
  const turn = async (words: string, ...toolCalls: string[]): Promise<string[]> => {
    said.push(words);
    withTurnReminder(history(), session);
    withTurnReminder(history(), session);
    const ctx = history();
    const outs: string[] = [];
    for (const [i, name] of toolCalls.entries()) {
      const output = await execute({ name }, { ctx: { userData, session } });
      outs.push(output);
      const callId = `c${seq}-${said.length}-${i}`;
      ctx.insert([
        llm.FunctionCall.create({ callId, name: 'rememberName', args: JSON.stringify({ name }) }),
        llm.FunctionCallOutput.create({ callId, name: 'rememberName', output, isError: false }),
      ]);
    }
    if (toolCalls.length > 0) withTurnReminder(ctx, session);
    await landed();
    return outs;
  };
  const account = () => ({ name: userProfile.name, preferredName: userProfile.preferredName });
  return { session, saveProfile, account, turn };
}

describe('NAME_SAVE_NEEDS_YES off: as main (one sentence renames the account)', () => {
  it('"I\'m Sam" in a verified session renames the account on that turn', async () => {
    const c = call({ needsYes: 'off' });
    await c.turn("I'm Sam", 'Sam');
    expect(persisted).toContain('Sam'); // name-correction's write
    expect(c.account()).toEqual({ name: 'Sam', preferredName: 'Sam' }); // rememberName's
    expect(c.saveProfile).toHaveBeenCalled();
  });
});

describe('NAME_SAVE_NEEDS_YES on, CALL_ME_VOCATIVE off', () => {
  it('one "I\'m Sam" in a verified app session leaves the account unchanged after the call', async () => {
    const c = call({ needsYes: 'on' });
    const [reply] = await c.turn("I'm Sam", 'Sam');
    expect(reply).toContain('Not saved yet');
    await c.turn('anyway, how was your day?');
    expect(persisted).toEqual([]);
    expect(c.saveProfile).not.toHaveBeenCalled();
    // The profile the end-of-call save writes still has the account's name.
    expect(c.account()).toEqual({ name: 'Jess', preferredName: 'Jess' });
    expect(nameLines).toEqual([]);
  });

  it('"call me Sam" then "yes" saves it, with one NAME_SAVED line', async () => {
    const c = call({ needsYes: 'on' });
    await c.turn('call me Sam', 'Sam');
    expect(c.account().preferredName).toBe('Jess');
    const [reply] = await c.turn('yes', 'Sam');
    expect(reply).toContain('Name "Sam" stored');
    expect(c.account()).toEqual({ name: 'Sam', preferredName: 'Sam' });
    expect(c.saveProfile).toHaveBeenCalledTimes(1);
    expect(persisted).toEqual([]); // name-correction never writes on its own
    expect(nameLines).toEqual([
      [{ source: 'confirm', sessionKind: 'app', hadName: true }, 'NAME_SAVED'],
    ]);
  });

  it('a yes on a phone call logs sessionKind phone', async () => {
    const c = call({ needsYes: 'on', phone: true });
    await c.turn('call me Sam', 'Sam');
    await c.turn('yes', 'Sam');
    expect(nameLines).toEqual([
      [{ source: 'confirm', sessionKind: 'phone', hadName: true }, 'NAME_SAVED'],
    ]);
  });

  it('"call me, Ferni" does not ring: ringing stays CALL_ME_VOCATIVE\'s', () => {
    const c = call({ needsYes: 'on' });
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: 'call me, Ferni' });
    const env = { NAME_SAVE_NEEDS_YES: 'on', CALL_ME_VOCATIVE: 'off' };
    expect(callMeNote(ctx, c.session, 'call me, Ferni', { owner: true }, env)).toBe('');
    const vocative = { NAME_SAVE_NEEDS_YES: 'on', CALL_ME_VOCATIVE: 'on' };
    expect(callMeNote(ctx, c.session, 'call me, Ferni', { owner: true }, vocative)).toContain(
      'Call callUser'
    );
  });
});

describe('NAME_SAVED carries no string from the name', () => {
  it.each([
    ['settings, preferred name only', { name: 'Jess', preferredName: 'Jess' }, ['preferredName']],
    ['onboarding, no name before', {}, undefined],
  ] as const)('%s', (_label, before, fields) => {
    const profile: Record<string, string> = { ...before };
    const source = fields ? 'settings' : 'onboarding';
    writeAccountName(profile, 'Samantha', { source, sessionKind: 'api', fields });
    expect(profile.preferredName).toBe('Samantha');
    expect(profile.name).toBe(fields ? 'Jess' : 'Samantha');
    expect(nameLines).toEqual([[{ source, sessionKind: 'api', hadName: !!fields }, 'NAME_SAVED']]);
    expect(JSON.stringify(nameLines).toLowerCase()).not.toMatch(/sam|jess/);
  });
});
