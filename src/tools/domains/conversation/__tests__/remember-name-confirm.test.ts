/**
 * rememberName under CALL_ME_VOCATIVE: the name being confirmed follows the
 * tool calls (name-confirm-calls.ts). Driven through the registered tool and
 * the live turn reminder (withTurnReminder), with a growing call history.
 * The stale-name rows are the #2886 round-2 verifier's 18
 * (/Volumes/Work/verify/2886r2-art/rows-base.jsonl, groups 2a-2e), with the
 * outcome this design must give.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createConversationTools } from '../conversation-tools.js';
import { withTurnReminder } from '../../../../agents/personas/turn-request.js';

vi.mock('../../../../memory/firestore-store.js', () => ({
  getFirestoreStore: () => ({ atomicProfileUpdate: vi.fn(async () => null) }),
}));

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});
const flags = (callMe: 'on' | 'off', nc: 'on' | 'off' = 'off'): void => {
  process.env.CALL_ME_VOCATIVE = callMe;
  process.env.NAME_CORRECTION = nc;
  process.env.NAME_CAPTURE_STRICT = 'off';
};

type Exec = (a: { name: string }, o: { ctx: object }) => Promise<string>;
const { execute } = createConversationTools().rememberName as unknown as { execute: Exec };

let seq = 0;
function call(given: string | null = 'Seth', profile?: Record<string, unknown>) {
  const name = given ?? undefined;
  const saveProfile = vi.fn(async () => undefined);
  const userProfile: Record<string, unknown> = profile ?? { id: 'u1', name, preferredName: name };
  const userData: Record<string, unknown> = {
    userId: 'u1',
    userName: name,
    personaId: 'ferni',
    services: { sessionId: `s-rnc-${++seq}`, userProfile, saveProfile },
  };
  return { session: { userData }, userData, userProfile, saveProfile };
}
type Call = ReturnType<typeof call>;

function chat(said: string, before: readonly string[]): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  for (const line of [...before, said]) {
    ctx.addMessage({ role: 'assistant', content: 'Hey, good to hear you.' });
    ctx.addMessage({ role: 'user', content: line });
  }
  return ctx;
}
const history = new WeakMap<object, string[]>();
/** One caller turn as the live path runs it: the preemptive and the final request. */
function turn(c: Call, said: string): void {
  const before = history.get(c.session) ?? [];
  withTurnReminder(chat(said, before), c.session);
  withTurnReminder(chat(said, before), c.session);
  history.set(c.session, [...before, said]);
}
const tool = (c: Call, name: string): Promise<string> =>
  execute({ name }, { ctx: { userData: c.userData, session: c.session } });

/** The kind of answer the tool gave. */
function kind(out: string): string {
  if (/team member name|is not a name|when they want a call/.test(out)) return 'refused';
  if (/stored/.test(out)) return 'stored';
  if (/Just checking/.test(out)) return 'ask2';
  if (/didn't say yes/.test(out)) return 'noYes';
  if (/Not saved yet/.test(out)) return 'ask';
  return out;
}

describe('the confirm follows the tool calls', () => {
  it("asks, keeps the profile, then saves on the next turn's yes", async () => {
    flags('on');
    const c = call();
    turn(c, 'call me Jess');
    const out = await tool(c, 'Jess');
    expect(out).toContain('Want me to call you Jess from now on?');
    expect(await tool(c, 'Jess')).toContain('Not saved yet'); // same turn: no yes
    expect(c.userProfile.name).toBe('Seth');
    expect(c.saveProfile).not.toHaveBeenCalled();
    turn(c, 'yes');
    expect(kind(await tool(c, 'Jess'))).toBe('stored');
    expect(c.userProfile).toMatchObject({ name: 'Jess', preferredName: 'Jess' });
  });

  it.each(['no', 'not really', 'nah, Seth is fine', 'yeah no', 'hmm', 'great, thanks'])(
    '"%s" saves nothing',
    async (reply) => {
      flags('on');
      const c = call();
      turn(c, 'call me Jess');
      await tool(c, 'Jess');
      turn(c, reply);
      await tool(c, 'Jess');
      expect(c.userProfile.name).toBe('Seth');
      expect(c.saveProfile).not.toHaveBeenCalled();
    }
  );

  it('a yes two turns later is no answer: the question starts over', async () => {
    flags('on');
    const c = call();
    turn(c, 'call me Jess');
    await tool(c, 'Jess');
    turn(c, 'hang on, the dog');
    turn(c, 'yes');
    expect(kind(await tool(c, 'Jess'))).toBe('ask');
    expect(c.userProfile.name).toBe('Seth');
  });

  it('a yes is for its own turn: a later call for the same name asks again', async () => {
    flags('on');
    const c = call();
    turn(c, 'call me Sam');
    await tool(c, 'Sam');
    turn(c, 'yes');
    expect(kind(await tool(c, 'Sam'))).toBe('stored');
    Object.assign(c.userProfile, { name: 'Jamie', preferredName: 'Jamie' }); // another writer
    turn(c, 'what time is it');
    expect(kind(await tool(c, 'Sam'))).toBe('ask');
    expect(c.userProfile.name).toBe('Jamie');
  });

  it('a first name is checked too, as #2698 does', async () => {
    flags('on');
    const c = call(null);
    turn(c, "I'm Jess");
    expect(await tool(c, 'Jess')).toContain('Jess, did I get that right?');
    turn(c, 'yep');
    expect(kind(await tool(c, 'Jess'))).toBe('stored');
  });
});

// ------------------------------------------------- the verifier's 18 stale rows
const CORRECTIONS: Array<[string, string]> = [
  ['actually call me Alex', 'Alex'],
  ['actually call me alex', 'Alex'],
  ['actually call me Jamie', 'Jamie'],
  ['actually call me jamie', 'Jamie'],
  ['no wait, make it Jamie', 'Jamie'],
  ["sorry, it's Jamie actually", 'Jamie'],
  ['call me Jamie instead', 'Jamie'],
];

describe('a stale or replaced name never wins (rows 2a-2e)', () => {
  it.each(
    (['off', 'on'] as const).flatMap((nc) => CORRECTIONS.map(([s, n]) => [nc, s, n] as const))
  )('2a NAME_CORRECTION=%s: Sam, then "%s", then late calls for Sam', async (nc, said, newer) => {
    flags('on', nc);
    const c = call();
    turn(c, 'call me Sam');
    await tool(c, 'Sam');
    turn(c, said);
    await tool(c, newer);
    turn(c, 'yes');
    await tool(c, 'Sam'); // a late call for the old name
    expect(c.userProfile.name).toBe('Seth');
    await tool(c, newer);
    if (newer === 'Alex') {
      // A teammate's name: the yes only raises the second question.
      expect(c.userProfile.name).toBe('Seth');
      turn(c, 'yes');
      await tool(c, newer);
    }
    expect(c.userProfile.name).toBe(newer);
    turn(c, 'yes');
    await tool(c, newer);
    await tool(c, 'Sam');
    expect(c.userProfile.name).toBe(newer);
    expect(c.userProfile.preferredName).toBe(newer);
  });

  it('2b NAME_CORRECTION=on: the correction settles Jamie, then late calls for Sam', async () => {
    flags('on', 'on');
    const c = call();
    turn(c, 'call me Sam');
    await tool(c, 'Sam');
    turn(c, 'actually, call me Jamie');
    turn(c, 'yes');
    expect(c.userData.userName).toBe('Jamie');
    expect(kind(await tool(c, 'Sam'))).toBe('ask'); // starts over, inherits no yes
    turn(c, 'great, thanks');
    await tool(c, 'Sam');
    expect(c.userProfile.name).toBe('Seth');
    expect(c.saveProfile).not.toHaveBeenCalled();
  });

  it('2c another writer renames the profile while Sam waits: the yes to Sam still saves Sam', async () => {
    flags('on');
    const c = call();
    turn(c, 'call me Sam');
    await tool(c, 'Sam');
    Object.assign(c.userProfile, { name: 'Jamie', preferredName: 'Jamie' });
    turn(c, 'yes');
    expect(kind(await tool(c, 'Sam'))).toBe('stored');
    expect(c.userProfile.name).toBe('Sam');
  });

  it('2d two calls on one profile: each yes saves its own name', async () => {
    flags('on');
    const profile: Record<string, unknown> = { id: 'u1', name: 'Seth', preferredName: 'Seth' };
    const a = call('Seth', profile);
    const b = call('Seth', profile);
    turn(a, 'call me Sam');
    await tool(a, 'Sam');
    turn(b, 'call me Jamie');
    await tool(b, 'Jamie');
    turn(b, 'yes');
    expect(kind(await tool(b, 'Jamie'))).toBe('stored');
    turn(a, 'yes');
    expect(kind(await tool(a, 'Sam'))).toBe('stored');
    expect(profile.name).toBe('Sam');
  });

  it('2e Sam confirmed, then Jamie confirmed, then stray calls for Sam', async () => {
    flags('on');
    const c = call();
    turn(c, 'call me Sam');
    await tool(c, 'Sam');
    turn(c, 'yes');
    expect(kind(await tool(c, 'Sam'))).toBe('stored');
    turn(c, 'yes');
    expect(kind(await tool(c, 'Sam'))).toBe('stored'); // on file already: saved as before
    turn(c, 'actually call me Jamie');
    expect(kind(await tool(c, 'Jamie'))).toBe('ask');
    turn(c, 'yes');
    await tool(c, 'Sam'); // stray: a new question, no old yes
    expect(kind(await tool(c, 'Jamie'))).toBe('stored');
    expect(c.userProfile.name).toBe('Jamie');
    turn(c, 'anyway, how was your weekend');
    expect(kind(await tool(c, 'Sam'))).toBe('ask'); // a fresh question, never the old yes
    expect(c.userProfile.name).toBe('Jamie');
  });
});

// ------------------------------------------------------- asked twice, flag on only
const TWICE: Array<[string, string]> = [
  ['Furnee', 'my name, Ferni'],
  ['Fernie', 'my name, Ferni'],
  ['Fern', 'my name, Ferni'],
  ['Pherni', 'my name, Ferni'],
  ['Maya', 'my teammate Maya'],
  ['Jordan Taylor', 'my teammate Jordan'],
];

describe('a name like Ferni or a teammate is asked twice (flag on)', () => {
  it.each(TWICE)('%s: saved only on a yes to the second question', async (name, like) => {
    flags('on');
    const c = call();
    turn(c, `call me ${name}`);
    expect(kind(await tool(c, name))).toBe('ask');
    turn(c, 'yes');
    expect(await tool(c, name)).toContain(`Just checking, your name is ${name}? Like ${like}?`);
    expect(c.userProfile.name).toBe('Seth');
    turn(c, 'no');
    expect(kind(await tool(c, name))).toBe('noYes');
    expect(c.userProfile.name).toBe('Seth');
  });

  it.each(['on', 'off'] as const)('Jenni, NAME_CORRECTION=%s: one yes, a real name', async (nc) => {
    flags('on', nc);
    const c = call();
    turn(c, 'call me Jenni');
    await tool(c, 'Jenni');
    turn(c, 'yes');
    expect(kind(await tool(c, 'Jenni'))).toBe('stored');
  });

  it('Furnee is saved after two yeses', async () => {
    flags('on');
    const c = call();
    turn(c, 'call me Furnee');
    await tool(c, 'Furnee');
    turn(c, 'yes');
    await tool(c, 'Furnee');
    turn(c, 'yes');
    expect(kind(await tool(c, 'Furnee'))).toBe('stored');
    expect(c.userProfile.name).toBe('Furnee');
  });

  it.each(['Ferni', 'Ferni!', 'Ｆｅｒｎｉ'])('%s is refused', async (name) => {
    flags('on');
    const c = call();
    turn(c, `call me ${name}`);
    expect(kind(await tool(c, name))).toBe('refused');
  });

  it.each(['later', 'in five minutes', 'at 5', 'back', 'Tomorrow'])(
    '"%s" is a callback time, never a name',
    async (name) => {
      flags('on');
      const c = call();
      turn(c, `call me ${name}`);
      expect(kind(await tool(c, name))).toBe('refused');
    }
  );
});

// ------------------------------------------------------------ flag off is main
const MAIN_REFUSES = ['Maya', 'Alex', 'Jordan', 'Peter', 'Nayan', 'John', 'Taylor', 'Ferni'];
const MAIN_SAVES = [
  'Jess',
  'Fern',
  'Furnee',
  'Fernie',
  'Bernie',
  'Vernie',
  'Ernie',
  'Ferris',
  'Kerri',
  'Jenni',
  'Terri',
  'Fern Smith',
  'later',
];

describe('CALL_ME_VOCATIVE=off: the tool is main', () => {
  it.each(MAIN_SAVES)('%s saves at once', async (name) => {
    flags('off');
    const c = call();
    turn(c, `call me ${name}`);
    expect(await tool(c, name)).toContain(`Name "${name}" stored`);
    expect(c.userProfile).toMatchObject({ name, preferredName: name });
    expect(c.userData.name).toBe(name);
    expect(c.saveProfile).toHaveBeenCalledTimes(1);
  });

  it.each(MAIN_REFUSES)('%s is refused', async (name) => {
    flags('off');
    const c = call();
    expect(await tool(c, name)).toContain('team member name');
    expect(c.saveProfile).not.toHaveBeenCalled();
  });
});

describe('name-correction takes no callback time as a name (flag on)', () => {
  it.each(['Call me Later', 'Call me Tomorrow', 'Call me Tonight', 'call me in five minutes'])(
    '"%s" raises no name question',
    async (said) => {
      flags('on', 'on');
      const { nameCorrectionNote } = await import('../../../../agents/personas/name-correction.js');
      const { pendingOf } = await import('../../../../agents/personas/name-confirm.js');
      const c = call();
      nameCorrectionNote(chat(said, []), c.session, said, process.env, { outbound: () => false });
      expect(pendingOf(c.session, 'rename')).toBeUndefined();
    }
  );
});
