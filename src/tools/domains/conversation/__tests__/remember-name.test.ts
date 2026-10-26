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

/** A call so far: each earlier turn is a reply of Ferni's and the caller's words. */
function chat(said: string, before: readonly string[] = []): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  for (const line of [...before, said]) {
    ctx.addMessage({ role: 'assistant', content: 'Hey, good to hear you.' });
    ctx.addMessage({ role: 'user', content: line });
  }
  return ctx;
}

const history = new WeakMap<object, string[]>();
/** One caller turn as the live path runs it: the preemptive and the final request. */
function turn(session: object, said: string): void {
  const before = history.get(session) ?? [];
  withTurnReminder(chat(said, before), session);
  withTurnReminder(chat(said, before), session);
  history.set(session, [...before, said]);
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

const CHECK = (name: string, like: string): string =>
  `Just checking, your name is ${name}? Like ${like}?`;

/** Two yeses through the live turns: the usual question, then "Just checking...". */
async function askedTwice(
  flag: 'on' | 'off',
  name: string,
  like: string,
  nc: 'on' | 'off' = 'off'
) {
  flags(flag, nc);
  const { session, user, userProfile, saveProfile } = call('Seth');
  turn(session, `call me ${name}`);
  expect(await rememberName(name, user, session)).toContain('Not saved yet');
  expect(userProfile.name).toBe('Seth');
  turn(session, 'yes');
  // The first yes is not enough: the second question, and still nothing written.
  expect(await rememberName(name, user, session)).toContain(CHECK(name, like));
  expect(userProfile.name).toBe('Seth');
  expect(userProfile.preferredName).toBe('Seth');
  expect((session.userData as { userName?: string }).userName).toBe('Seth');
  expect(saveProfile).not.toHaveBeenCalled();
  turn(session, 'yes');
  expect(await rememberName(name, user, session)).toContain('stored');
  expect(userProfile.name).toBe(name);
  expect(saveProfile).toHaveBeenCalledTimes(1);
}

describe("Ferni's own name, normalised, is never the caller (flag on or off)", () => {
  const REFUSED = ['Ferni', 'Fern', 'Ferni!', 'Fern.', 'FERNI', 'Férni', ' fern ', 'Fern?'];
  it.each((['off', 'on'] as const).flatMap((f) => REFUSED.map((n) => [f, n] as const)))(
    'CALL_ME_VOCATIVE=%s refuses "%s"',
    async (flag, name) => {
      flags(flag);
      const { session, user, userProfile, saveProfile } = call('Seth');
      turn(session, `call me ${name}`);
      expect(await rememberName(name, user, session)).toContain('team member name');
      turn(session, 'yes');
      expect(await rememberName(name, user, session)).toContain('team member name');
      expect(userProfile.name).toBe('Seth');
      expect(saveProfile).not.toHaveBeenCalled();
    }
  );
});

describe('a name like a team name is asked twice, never refused (flag on or off)', () => {
  const LIKE_FERNI = [
    'Furnee',
    'Furni',
    'Fernay',
    'Fernie',
    'Ferny',
    'Fernee',
    'Phernie',
    'Jenni',
    'Terri',
  ];
  const TEAM: Array<[string, string]> = [
    ['Maya', 'my teammate Maya'],
    ['Jordan', 'my teammate Jordan'],
    ['Alex', 'my teammate Alex'],
  ];
  const ROWS = [...LIKE_FERNI.map((n) => [n, 'my name, Ferni'] as [string, string]), ...TEAM];
  it.each((['off', 'on'] as const).flatMap((f) => ROWS.map(([n, l]) => [f, n, l] as const)))(
    'CALL_ME_VOCATIVE=%s: %s is saved only after the second yes',
    (flag, name, like) => askedTwice(flag, name, like)
  );

  it.each(['Jenni', 'Terri'])('%s through name-correction too (NAME_CORRECTION=on)', (name) =>
    askedTwice('on', name, 'my name, Ferni', 'on')
  );

  it('a no to the second question saves nothing', async () => {
    flags('on');
    const { session, user, userProfile, saveProfile } = call('Seth');
    turn(session, 'call me Furnee');
    await rememberName('Furnee', user, session);
    turn(session, 'yes');
    await rememberName('Furnee', user, session);
    turn(session, 'no, sorry');
    expect(await rememberName('Furnee', user, session)).toContain("didn't say yes");
    expect(userProfile.name).toBe('Seth');
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it.each([
    ['off', 'Fern Smith'],
    ['off', 'Fernando'],
  ] as const)(
    'a multi-word or plain name saves as before with the flag off: %s',
    async (f, name) => {
      flags(f);
      const { session, user, userProfile } = call('Seth');
      await rememberName(name, user, session);
      expect(userProfile.name).toBe(name);
    }
  );

  it('"Fern Smith" takes the usual single confirm with the flag on', async () => {
    flags('on');
    const { session, user, userProfile } = call('Seth');
    turn(session, 'call me Fern Smith');
    expect(await rememberName('Fern Smith', user, session)).toContain(
      'Want me to call you Fern Smith from now on?'
    );
    turn(session, 'yes');
    expect(await rememberName('Fern Smith', user, session)).toContain('stored');
    expect(userProfile.name).toBe('Fern Smith');
  });
});

describe('the question holds the name the caller said last (CALL_ME_VOCATIVE=on)', () => {
  it.each(['on', 'off'] as const)(
    'Sam, then "actually, call me Riley": only a yes saves, and it saves Riley (NAME_CORRECTION=%s)',
    async (nc) => {
      flags('on', nc);
      const { session, user, userProfile, saveProfile } = call('Seth');
      turn(session, 'call me Sam');
      await rememberName('Sam', user, session);
      turn(session, 'actually, call me Riley');
      await rememberName('Riley', user, session);
      // The model then names Sam in the same turn: it can't take the question back.
      expect(await rememberName('Sam', user, session)).toContain(
        'The name they said last is Riley'
      );
      expect(pendingOf(session, 'rename')?.name).toBe('Riley');
      expect(userProfile.name).toBe('Seth');
      expect(saveProfile).not.toHaveBeenCalled();
      turn(session, 'yes');
      await rememberName('Sam', user, session);
      expect(userProfile.name).toBe('Seth');
      await rememberName('Riley', user, session);
      expect(userProfile.name).toBe('Riley');
      expect(userProfile.preferredName).toBe('Riley');
      await rememberName('Sam', user, session);
      expect(userProfile.name).toBe('Riley');
      expect(saveProfile).toHaveBeenCalledTimes(1);
    }
  );

  it('a session name nobody confirmed is never written by the same-name shortcut', async () => {
    flags('on');
    const { session, user, userProfile, saveProfile } = call('Seth');
    (session.userData as { userName?: string }).userName = 'Sam'; // set without a yes
    turn(session, 'sure');
    expect(await rememberName('Sam', user, session)).toContain('Not saved yet');
    expect(userProfile.name).toBe('Seth');
    expect(saveProfile).not.toHaveBeenCalled();
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
