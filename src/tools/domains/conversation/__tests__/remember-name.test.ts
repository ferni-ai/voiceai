/**
 * rememberName under CALL_ME_VOCATIVE: the tool asks before it renames, using
 * the same pending question and yes as PR #2698 (name-confirm.ts), driven
 * through the live turn reminder (turn-request.ts withTurnReminder). Also
 * "Fern" refused, callback times never a name, and flag off pinned.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { rememberName } from '../remember-name.js';
import { pendingOf } from '../name-confirm.js';
import { nameCorrectionNote } from '../../../../agents/personas/name-correction.js';
import { withTurnReminder } from '../../../../agents/personas/turn-request.js';
import { readCallMe } from '../../../../utils/call-me-vocative.js';
import { createConversationTools } from '../conversation-tools.js';

vi.mock('../../../../memory/firestore-store.js', () => ({
  getFirestoreStore: () => ({ atomicProfileUpdate: vi.fn(async () => null) }),
}));

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

const flags = (callMe: 'on' | 'off', nameCorrection: 'on' | 'off' = 'off'): void => {
  process.env.CALL_ME_VOCATIVE = callMe;
  process.env.NAME_CORRECTION = nameCorrection;
  process.env.NAME_CAPTURE_STRICT = 'off';
};

let seq = 0;
/** A call whose caller is on file as Seth (or has no name yet). */
function call(given: string | null = 'Seth') {
  const name = given ?? undefined;
  const saveProfile = vi.fn(async () => undefined);
  const userProfile: Record<string, unknown> = { id: 'u1', name, preferredName: name };
  const session = {
    userData: {
      userId: 'u1',
      userName: name,
      personaId: 'ferni',
      services: { sessionId: `s-rn-${++seq}`, userProfile, saveProfile },
    },
  };
  return { session, user: session.userData as never, userProfile, saveProfile };
}

function chat(said: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'assistant', content: 'Hey, good to hear you.' });
  ctx.addMessage({ role: 'user', content: said });
  return ctx;
}

/** One caller turn as the live path runs it: the preemptive and the final request. */
function turn(session: object, said: string): void {
  withTurnReminder(chat(said), session);
  withTurnReminder(chat(said), session);
}

const ASK = 'Want me to call you Jess from now on?';

describe('rememberName, CALL_ME_VOCATIVE=on', () => {
  it.each(['off', 'on'] as const)(
    'asks before renaming, then saves on the yes (NAME_CORRECTION=%s)',
    async (nc) => {
      flags('on', nc);
      const { session, user, userProfile, saveProfile } = call('Seth');
      turn(session, 'call me Jess');
      const said = await rememberName('Jess', user, session);
      // Not written: the profile still says Seth, nothing saved, the question is pending.
      expect(said).toContain(ASK);
      expect(userProfile.name).toBe('Seth');
      expect(userProfile.preferredName).toBe('Seth');
      expect(saveProfile).not.toHaveBeenCalled();
      expect(pendingOf(session, 'rename')?.name).toBe('Jess');
      // A second call in the same turn is no yes.
      expect(await rememberName('Jess', user, session)).toContain(ASK);
      expect(userProfile.name).toBe('Seth');

      turn(session, 'yes');
      const after = await rememberName('Jess', user, session);
      expect(after).toContain('stored');
      expect(userProfile.name).toBe('Jess');
      expect(userProfile.preferredName).toBe('Jess');
      expect(saveProfile).toHaveBeenCalledTimes(1);
    }
  );

  it('a no keeps the old name', async () => {
    flags('on');
    const { session, user, userProfile, saveProfile } = call('Seth');
    turn(session, 'call me Jess');
    await rememberName('Jess', user, session);
    turn(session, 'no, Seth is fine');
    expect(await rememberName('Jess', user, session)).toContain("didn't say yes");
    expect(userProfile.preferredName).toBe('Seth');
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it('checks a first name too, as #2698 does, then saves it on the yes', async () => {
    flags('on');
    const { session, user, userProfile, saveProfile } = call(null);
    turn(session, "I'm Jess");
    expect(await rememberName('Jess', user, session)).toContain('Jess, did I get that right?');
    expect(userProfile.name).toBeUndefined();
    turn(session, 'yep');
    await rememberName('Jess', user, session);
    expect(userProfile.name).toBe('Jess');
    expect(saveProfile).toHaveBeenCalledTimes(1);
  });

  it('the same name as now saves as before', async () => {
    flags('on');
    const { session, user, saveProfile } = call('Seth');
    turn(session, "it's Seth");
    expect(await rememberName('Seth', user, session)).toContain('stored');
    expect(saveProfile).toHaveBeenCalledTimes(1);
  });

  it('runs through the registered tool with the LiveKit session', async () => {
    flags('on');
    const { session, userProfile } = call('Seth');
    turn(session, 'call me Jess');
    const tool = createConversationTools().rememberName as unknown as {
      execute: (a: { name: string }, o: { ctx: object }) => Promise<string>;
    };
    const out = await tool.execute(
      { name: 'Jess' },
      { ctx: { userData: session.userData, session } }
    );
    expect(out).toContain(ASK);
    expect(userProfile.name).toBe('Seth');
  });
});

describe('rememberName, CALL_ME_VOCATIVE=off (unchanged)', () => {
  it('renames at once, as before', async () => {
    flags('off');
    const { session, user, userProfile, saveProfile } = call('Seth');
    expect(await rememberName('Jess', user, session)).toContain('Name "Jess" stored');
    expect(userProfile.name).toBe('Jess');
    expect(userProfile.preferredName).toBe('Jess');
    expect((session.userData as { name?: string }).name).toBe('Jess');
    expect(saveProfile).toHaveBeenCalledTimes(1);
    expect(pendingOf(session, 'rename')).toBeUndefined();
  });
});

describe('Ferni as speech-to-text hears it is never the caller', () => {
  it.each([
    ['off', 'Fern'],
    ['on', 'Fern'],
    ['off', 'fern'],
    ['off', 'Fernie'],
    ['off', 'Fernee'],
    ['off', 'Ferni'],
  ] as const)('CALL_ME_VOCATIVE=%s refuses %s', async (flag, name) => {
    flags(flag);
    const { session, user, userProfile, saveProfile } = call('Seth');
    expect(await rememberName(name, user, session)).toContain('team member name');
    expect(userProfile.name).toBe('Seth');
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it('a real name still saves (flag off)', async () => {
    flags('off');
    const { session, user, userProfile } = call('Seth');
    await rememberName('Fernando', user, session);
    expect(userProfile.name).toBe('Fernando');
  });
});

describe('a callback time is never a name (CALL_ME_VOCATIVE=on)', () => {
  const PHRASES = [
    'call me in five minutes',
    'call me later',
    'call me tomorrow',
    'call me at 5',
    'call me back',
    'call me in an hour',
  ];
  const ARGS = ['in five minutes', 'later', 'Tomorrow', 'at 5', 'back', 'in an hour', 'Later'];

  it.each(ARGS)('the tool refuses %s', async (arg) => {
    flags('on');
    const { session, user, userProfile, saveProfile } = call('Seth');
    turn(session, 'call me later');
    expect(await rememberName(arg, user, session)).toContain('not their name');
    expect(userProfile.name).toBe('Seth');
    expect(saveProfile).not.toHaveBeenCalled();
    expect(pendingOf(session, 'rename')).toBeUndefined();
  });

  it.each(PHRASES)('the #2698 reader gives no name for %s', (said) => {
    flags('on');
    const reading = readCallMe(said, 'ferni');
    expect(reading.name).toBeUndefined();
    expect(reading.rename).toBeUndefined();
    expect(reading.intent === null || reading.intent === 'ring').toBe(true);
  });

  // Speech-to-text capitalises these at times; the name path must still not take them.
  it.each([...PHRASES, 'Call me Later', 'Call me Tomorrow', 'Call me Tonight', 'Call me Soon'])(
    'the confirm path raises no name question for %s',
    (said) => {
      flags('on', 'on');
      const { session } = call('Seth');
      const note = nameCorrectionNote(chat(said), session, said, process.env, {
        outbound: () => false,
      });
      expect(pendingOf(session, 'rename')).toBeUndefined();
      expect(note).not.toContain("Don't switch yet");
    }
  );
});
