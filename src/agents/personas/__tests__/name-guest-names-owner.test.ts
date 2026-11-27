/**
 * NAME_GUEST_NAMES_OWNER=on: a caller turn that names the account holder in the
 * third person puts a guest on the line (room-guests.ts). With a guest on the
 * line the call never changes the account's name and a yes confirms no send.
 *
 * Prod 2026-11-17: "This is <friend>, a friend of <owner>. How do I impress
 * <owner>?" said twice on the owner's app call saved the friend's name as the
 * account's preferredName. Names here are fictional: the account is Sam's, the
 * guest is Raj. The guest rows go red with the guard removed; the owner rows
 * (self-reference, near-miss, placeholder) go red with a guard that is too broad.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { createConversationTools } from '../../../tools/domains/conversation/conversation-tools.js';
import { guestNamesOwner } from '../../../utils/guest-names-owner.js';
import { speakerIsAccountOwner } from '../../multi-agent/live-call-behaviors.js';
import { rememberDispatchIdentity } from '../../voice-agent-entry/caller-recognition.js';
import { nameCorrectionNote } from '../name-correction.js';
import { hasGuests, roomGuestsNote } from '../room-guests.js';
import { withTurnReminder } from '../turn-request.js';

const atomicProfileUpdate = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../../../memory/firestore-store.js', () => ({
  getFirestoreStore: () => ({ atomicProfileUpdate }),
}));

const logInfo = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const l: Record<string, unknown> = { info: logInfo };
  for (const level of ['trace', 'debug', 'warn', 'error', 'fatal']) l[level] = vi.fn();
  l.child = () => l;
  return { ...real, getLogger: () => l, createLogger: () => l, safeLog: () => l };
});

const GUEST = 'Hey Ferni, this is Raj, a friend of Sam. How do I impress Sam?';
const NAMED = 'NAME_GUEST_NAMES_OWNER guest named the owner';

type Line = ['agent' | 'user', string];
function chat(lines: Line[]): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  for (const [who, text] of lines)
    ctx.addMessage({ role: who === 'agent' ? 'assistant' : 'user', content: text });
  return ctx;
}

interface CallData {
  userId: string;
  userName: string;
  name?: string;
  services: {
    sessionId: string;
    userProfile: { id: string; name: string; preferredName: string };
    saveProfile: Mock<() => Promise<void>>;
  };
}

let seq = 0;
/** A call on Sam's account, with the profile the end-of-call save writes. */
function samCall(userName = 'Sam', profileName = 'Sam'): { userData: CallData } {
  const userProfile = { id: 'u1', name: `${profileName} Rivera`, preferredName: profileName };
  const saveProfile = vi.fn(async (): Promise<void> => undefined);
  return {
    userData: {
      userId: 'u1',
      userName,
      services: { sessionId: `guest-${++seq}`, userProfile, saveProfile },
    },
  };
}

/** The proven account owner's session (a signed-in app call), not on behalf of anyone. */
function owner() {
  const persist = vi.fn(async (_userId: string, _name: string) => undefined);
  return { persist, verifiedOwner: () => true, outbound: () => false };
}
type Owner = ReturnType<typeof owner>;

/** One caller turn as turn-request.ts runs it: the room first, then name-correction. */
function turn(session: { userData: CallData }, words: string, deps: Owner): string {
  roomGuestsNote(session, words);
  const ctx = chat([
    ['agent', 'Hey Sam!'],
    ['user', words],
  ]);
  return nameCorrectionNote(ctx, session, words, process.env, deps);
}

type Exec = (a: { name: string }, o: { ctx: object }) => Promise<string>;
/** The model calling rememberName (conversation-tools.ts). */
async function rememberName(session: { userData: CallData }, name: string): Promise<string> {
  const execute = Reflect.get(createConversationTools().rememberName, 'execute') as Exec;
  return execute({ name }, { ctx: { userData: session.userData, session } });
}

const sessionIdOf = (session: { userData: CallData }): string =>
  session.userData.services.sessionId;

beforeEach(() => {
  vi.stubEnv('NAME_CORRECTION', 'on');
  vi.stubEnv('NAME_CAPTURE_STRICT', 'on'); // reads "this is Raj" (utils/caller-name.ts)
  vi.stubEnv('NAME_GUEST_NAMES_OWNER', 'on');
  vi.stubEnv('ROOM_GUESTS', 'off');
  atomicProfileUpdate.mockClear();
  logInfo.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('guestNamesOwner', () => {
  const sam = ['Sam', 'Sam Rivera'];
  it.each([
    ['a friend of Sam', true],
    ["I'm Raj, Sam's coworker", true],
    ['I’m Raj, Sam’s coworker', true],
    ['Sam and I go way back', true],
    ['how do I impress SAM?', true],
    ['I came with Sam', true],
    ['Sam, can you hear me?', true],
    ['I sat next to Samantha', false],
    ['Sammy said hi', false],
    ["I'm not Sam, I'm Jess", false],
    ["it isn't Sam", false],
    ["I'm Raj", false],
  ])('%j names the account holder: %s', (words, named) => {
    expect(guestNamesOwner(words, sam, 'Raj')).toBe(named);
  });

  it.each([
    'Sam is my dead name, call me Jess',
    "Sam's my old name",
    'I used to go by Sam',
    'I was formerly Sam',
    "I'm not just Sam anymore",
    'My name was Sam until last year',
    'Sam here',
    'Yes, Sam.',
    "It's me, Sam",
    'Everyone calls me Sam',
  ])('%j is the owner speaking of their own name', (words) => {
    expect(guestNamesOwner(words, sam, '')).toBe(false);
  });

  it('does not count the account name said as the claimed name', () => {
    expect(guestNamesOwner('Sam, by the way.', sam, 'Sam')).toBe(false);
  });

  it('folds case, Unicode form and diacritics, and matches whole words only', () => {
    const nfc = `Zo${String.fromCodePoint(0xeb)}`; // one code point
    const nfd = `Zoe${String.fromCodePoint(0x308)}`; // e + combining diaeresis
    expect(guestNamesOwner(`a friend of ${nfd}`, [nfc], '')).toBe(true);
    expect(guestNamesOwner(`a friend of ${nfc}`, [nfd], '')).toBe(true);
    expect(guestNamesOwner('a friend of Zoe', [nfc], '')).toBe(true);
    expect(guestNamesOwner(`${nfc}lla is here`, ['Zoe'], '')).toBe(false);
    expect(guestNamesOwner('a friend of Mary Ann', ['Mary-Ann'], '')).toBe(true);
  });
});

describe('a guest who names the owner: one guest state (room-guests.ts)', () => {
  it('row 1: renames for this call only; no profile change, no persist', () => {
    const session = samCall();
    const d = owner();
    expect(turn(session, GUEST, d)).toContain('Raj');
    expect(hasGuests(sessionIdOf(session))).toBe(true);
    expect(session.userData.userName).toBe('Raj'); // this call
    expect(session.userData.services.userProfile.preferredName).toBe('Sam');
    expect(d.persist).not.toHaveBeenCalled();
  });

  it('row 2: the same line twice, then a later rename on the call, still write nothing', () => {
    const session = samCall();
    const d = owner();
    turn(session, GUEST, d);
    turn(session, GUEST, d);
    turn(session, 'Actually, call me Sammy.', d); // the call has a guest on it now
    expect(session.userData.services.userProfile.preferredName).toBe('Sam');
    expect(d.persist).not.toHaveBeenCalled();
  });

  it("row 3: Raj as Sam's coworker writes nothing, though the call's name is the full one", () => {
    // main's own possessive check looks for "Sam Rivera's", so it misses "Sam's"
    const session = samCall('Sam Rivera');
    const d = owner();
    turn(session, "I'm Raj, Sam's coworker", d);
    expect(session.userData.services.userProfile.preferredName).toBe('Sam');
    expect(d.persist).not.toHaveBeenCalled();
  });

  it('is found on a turn with no name in it, whatever name extraction makes of it', () => {
    vi.stubEnv('NAME_CAPTURE_STRICT', 'off');
    const session = samCall();
    roomGuestsNote(session, 'How do I impress Sam?');
    expect(hasGuests(sessionIdOf(session))).toBe(true);
  });

  it('is logged once per call', () => {
    const session = samCall();
    const d = owner();
    for (let i = 0; i < 3; i++) turn(session, GUEST, d);
    expect(logInfo.mock.calls.filter((call) => call[1] === NAMED)).toHaveLength(1);
  });

  it('confirm mode: the guest keeps their name for this call, never asked "from now on?"', () => {
    vi.stubEnv('CALL_ME_VOCATIVE', 'on');
    const session = samCall();
    const note = turn(session, GUEST, owner());
    expect(note).toContain('Raj');
    expect(note).not.toContain('from now on');
    expect(session.userData.userName).toBe('Raj');
    vi.stubEnv('NAME_GUEST_NAMES_OWNER', 'off');
    expect(turn(samCall(), GUEST, owner())).toContain('Raj from now on?');
  });

  it("a guest's yes confirms no text or call (speakerIsAccountOwner)", () => {
    for (const flag of ['on', 'off'] as const) {
      vi.stubEnv('NAME_GUEST_NAMES_OWNER', flag);
      const session = samCall();
      rememberDispatchIdentity(sessionIdOf(session), 'web_auth'); // the owner's yes counts
      expect(speakerIsAccountOwner(sessionIdOf(session))).toBe(true);
      roomGuestsNote(session, GUEST); // ROOM_GUESTS off
      expect(speakerIsAccountOwner(sessionIdOf(session))).toBe(flag === 'off');
    }
  });
});

describe('rememberName with CALL_ME_VOCATIVE off (finding 4)', () => {
  it('keeps the name for this call only once a guest has named the owner', async () => {
    for (const flag of ['on', 'off'] as const) {
      vi.stubEnv('NAME_GUEST_NAMES_OWNER', flag);
      const session = samCall();
      rememberDispatchIdentity(sessionIdOf(session), 'firebase', '{}');
      const { saveProfile, userProfile } = session.userData.services;
      turn(session, GUEST, owner());
      const said = await rememberName(session, 'Raj');
      expect(session.userData.name).toBe('Raj');
      expect(userProfile.preferredName).toBe(flag === 'on' ? 'Sam' : 'Raj');
      expect(saveProfile).toHaveBeenCalledTimes(flag === 'on' ? 0 : 1);
      // never told "stored" when the account wasn't written
      expect(said).toContain(flag === 'on' ? 'NOT saved' : 'stored');
      if (flag === 'on') expect(said).not.toContain('stored');
    }
  });

  // Only a guest on the line holds the write: who the session is stays as on main.
  it.each([
    ['a signed-in app session', 'firebase'],
    ['a device-id session', 'device'],
    ['a session with no dispatch identity', null],
  ])('%s with no guest renames the account, flag on and off', async (_label, source) => {
    for (const flag of ['on', 'off'] as const) {
      vi.stubEnv('NAME_GUEST_NAMES_OWNER', flag);
      const session = samCall();
      if (source) rememberDispatchIdentity(sessionIdOf(session), source, '{}');
      expect(await rememberName(session, 'Jess')).toContain('Name "Jess" stored');
      expect(session.userData.services.userProfile.preferredName).toBe('Jess');
      expect(session.userData.services.saveProfile).toHaveBeenCalledTimes(1);
    }
  });
});

describe('rememberName with CALL_ME_VOCATIVE on (the confirm path)', () => {
  it("the verified owner's yes saves to the account", async () => {
    vi.stubEnv('CALL_ME_VOCATIVE', 'on');
    const session = samCall();
    rememberDispatchIdentity(sessionIdOf(session), 'firebase', '{}');
    const lines: Line[] = [['agent', 'Hey Sam!']];
    for (const words of ["I'm Jess.", 'Yes.']) {
      lines.push(['user', words]);
      withTurnReminder(chat(lines), session);
      lines.push(['agent', 'Want me to call you Jess from now on?']);
    }
    expect(await rememberName(session, 'Jess')).toContain('stored');
    expect(session.userData.services.userProfile.preferredName).toBe('Jess');
    expect(session.userData.services.saveProfile).toHaveBeenCalledTimes(1);
  });

  it('an unverified session with no guest: the flag changes nothing', async () => {
    vi.stubEnv('CALL_ME_VOCATIVE', 'on');
    const run = async (flag: 'on' | 'off') => {
      vi.stubEnv('NAME_GUEST_NAMES_OWNER', flag);
      const session = samCall(); // no dispatch identity: main's confirm path decides alone
      const lines: Line[] = [['agent', 'Hey Sam!']];
      for (const words of ["I'm Jess.", 'Yes.']) {
        lines.push(['user', words]);
        withTurnReminder(chat(lines), session);
        lines.push(['agent', 'Want me to call you Jess from now on?']);
      }
      const said = await rememberName(session, 'Jess');
      const { saveProfile, userProfile } = session.userData.services;
      return [said, session.userData.userName, userProfile.preferredName, saveProfile.mock.calls];
    };
    const on = await run('on');
    expect(on[0]).not.toContain('NOT saved');
    expect(on).toEqual(await run('off'));
  });

  it('a guest\'s name is this call\'s at once: no question, no save, never "stored"', async () => {
    vi.stubEnv('CALL_ME_VOCATIVE', 'on');
    const session = samCall();
    rememberDispatchIdentity(sessionIdOf(session), 'firebase', '{}');
    withTurnReminder(
      chat([
        ['agent', 'Hey Sam!'],
        ['user', GUEST],
      ]),
      session
    );
    const said = await rememberName(session, 'Raj');
    expect(said).toContain('Call them Raj for the rest of this call');
    expect(said).not.toContain('stored');
    expect(said).not.toContain('from now on');
    expect(session.userData.userName).toBe('Raj');
    expect(session.userData.services.userProfile.preferredName).toBe('Sam');
    expect(session.userData.services.saveProfile).not.toHaveBeenCalled();
  });
});

describe('the owner, with NAME_GUEST_NAMES_OWNER=on', () => {
  it.each([
    'Call me Sammy.',
    "I'm Jess.",
    "I'm not Sam, I'm Jess.",
    'Sam is my dead name. Call me Jess.',
    'Formerly Sam. Call me Jess.',
  ])('row 4: %j renames the account as main does', (words) => {
    const session = samCall();
    const d = owner();
    turn(session, words, d);
    const name = session.userData.userName;
    expect(hasGuests(sessionIdOf(session))).toBe(false);
    expect(name).not.toBe('Sam');
    expect(session.userData.services.userProfile.preferredName).toBe(name);
    expect(d.persist).toHaveBeenCalledExactlyOnceWith('u1', name);
  });

  it('row 5: a near-miss ("Samantha") is not the account holder', () => {
    const session = samCall();
    const d = owner();
    turn(session, "I'm Raj. Samantha said I should talk to you.", d);
    expect(d.persist).toHaveBeenCalledExactlyOnceWith('u1', 'Raj');
  });

  // "a new user here" would pass as "Sam here" (the owner's own name), so these lines end elsewhere
  it.each(["I'm Jess, a new user.", "Hi, I'm Jess, a friend of the user."])(
    'a placeholder account name ("User") names nobody: %j (caller-name-known.ts)',
    (words) => {
      const session = samCall('the user', 'User');
      session.userData.services.userProfile.name = 'User';
      const d = owner();
      turn(session, words, d);
      expect(hasGuests(sessionIdOf(session))).toBe(false);
      expect(d.persist).toHaveBeenCalledExactlyOnceWith('u1', 'Jess');
    }
  );
});

describe('row 6: NAME_GUEST_NAMES_OWNER off is main', () => {
  it("renames the account on the guest's line, with no guest on the call", () => {
    vi.stubEnv('NAME_GUEST_NAMES_OWNER', 'off');
    const session = samCall();
    const d = owner();
    turn(session, GUEST, d);
    expect(hasGuests(sessionIdOf(session))).toBe(false);
    expect(session.userData.services.userProfile.preferredName).toBe('Raj');
    expect(d.persist).toHaveBeenCalledExactlyOnceWith('u1', 'Raj');
  });
});

describe('on the live turn path (withTurnReminder, signed-in app session)', () => {
  /** Two caller turns; the model calls rememberName("Raj") after each turn named in `saveAfter`. */
  async function twoTurns(first: string, second: string, saveAfter: number[]) {
    vi.stubEnv('CALL_ME_VOCATIVE', 'on');
    const session = samCall();
    rememberDispatchIdentity(sessionIdOf(session), 'firebase', '{}');
    const lines: Line[] = [['agent', 'Hey Sam!']];
    for (const [i, words] of [first, second].entries()) {
      lines.push(['user', words]);
      withTurnReminder(chat(lines), session);
      if (saveAfter.includes(i + 1)) await rememberName(session, 'Raj');
      lines.push(['agent', 'Want me to call you Raj from now on?']);
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    }); // a persist's dynamic import
    return session;
  }

  it.each(['on', 'off'])(
    '"This is Raj." then "Yes! How do I impress Sam?" writes nothing (NAME_CAPTURE_STRICT %s)',
    async (strict) => {
      vi.stubEnv('NAME_CAPTURE_STRICT', strict);
      const session = await twoTurns('This is Raj.', 'Yes! How do I impress Sam?', [1, 2]);
      expect(hasGuests(sessionIdOf(session))).toBe(true);
      expect(session.userData.services.userProfile.preferredName).toBe('Sam');
      expect(session.userData.services.saveProfile).not.toHaveBeenCalled();
      expect(atomicProfileUpdate).not.toHaveBeenCalled();
    }
  );

  it('a clear yes on the turn that names the owner saves nothing (off: saves)', async () => {
    for (const flag of ['on', 'off'] as const) {
      vi.stubEnv('NAME_GUEST_NAMES_OWNER', flag);
      const session = await twoTurns('This is Raj.', 'Yes, Raj. I came with Sam.', [2]);
      const { saveProfile, userProfile } = session.userData.services;
      expect(session.userData.userName).toBe('Raj'); // this call, either way
      expect(userProfile.preferredName).toBe(flag === 'on' ? 'Sam' : 'Raj');
      expect(saveProfile).toHaveBeenCalledTimes(flag === 'on' ? 0 : 1);
    }
  });

  it('CALL_ME_VOCATIVE off: no preferredName for the guest (off: writes)', async () => {
    const run = async (flag: 'on' | 'off'): Promise<void> => {
      vi.stubEnv('NAME_GUEST_NAMES_OWNER', flag);
      const session = samCall();
      rememberDispatchIdentity(sessionIdOf(session), 'firebase', '{}');
      withTurnReminder(
        chat([
          ['agent', 'Hey Sam!'],
          ['user', GUEST],
        ]),
        session
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      }); // the persist's dynamic import
    };
    await run('on');
    expect(atomicProfileUpdate).not.toHaveBeenCalled();
    await run('off');
    await vi.waitFor(() => expect(atomicProfileUpdate).toHaveBeenCalledTimes(1));
  });
});
