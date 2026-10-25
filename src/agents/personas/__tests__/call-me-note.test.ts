/**
 * CALL_ME_VOCATIVE through the live path: withTurnReminder (turn-request.ts)
 * is what each LLM request carries, and the caller's rename happens there too
 * (name-correction.ts, name-confirm.ts). Every phrasing of the PR #2698 round-1
 * matrix, and ten held-out phrasings written before the round-2 code.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { callMeNote } from '../call-me-note.js';
import { nameCorrectionNote } from '../name-correction.js';
import { withTurnReminder } from '../turn-request.js';

vi.mock('../../../memory/firestore-store.js', () => ({
  getFirestoreStore: () => ({ atomicProfileUpdate: vi.fn(async () => null) }),
}));

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

const RING = 'Call callUser in this reply';
const EITHER = 'either-or question';
const CONFIRM = "Don't switch yet";

function chat(said: string, opts: { called?: boolean } = {}): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'assistant', content: 'Hey, good to hear you.' });
  if (opts.called) {
    ctx.insert(
      llm.FunctionCall.create({ callId: 'c1', name: 'callUser', args: '{"message":"hi"}' })
    );
  }
  ctx.addMessage({ role: 'user', content: said });
  return ctx;
}

let seq = 0;
function call(personaId = 'ferni', userName = 'Seth') {
  return {
    userData: { userId: 'u1', userName, personaId, services: { sessionId: `s-voc-${++seq}` } },
  };
}

/** One turn as the live path runs it: the preemptive and the final request, same words. */
function turn(session: object, said: string, opts: { called?: boolean } = {}): string {
  withTurnReminder(chat(said, opts), session);
  const last = withTurnReminder(chat(said, opts), session).items.at(-1);
  return last?.type === 'message' ? (last.textContent ?? '') : '';
}

const ON = (strict: 'on' | 'off') => {
  process.env.CALL_ME_VOCATIVE = 'on';
  process.env.NAME_CORRECTION = 'on';
  process.env.NAME_CAPTURE_STRICT = strict;
};

type Want = { ring?: boolean; ask?: string; confirm?: string };
const P = { ferni: 'ferni', maya: 'maya-santos', peter: 'peter-john', alex: 'alex-chen' };
const ROWS: Array<[string, string, string, Want]> = [
  // round-1 spec rows
  ['spec', 'call me, Ferni', P.ferni, { ring: true }],
  ['spec', 'Ferni, call me', P.ferni, { ring: true }],
  ['spec', 'can you call me Ferni', P.ferni, { ring: true }],
  ['spec', 'call me back Ferni', P.ferni, { ring: true }],
  ['spec', 'give me a call, Ferni', P.ferni, { ring: true }],
  ['spec', 'call me Sam', P.ferni, { confirm: 'Sam' }],
  ['spec', "my name's Sam, call me Sam", P.ferni, { confirm: 'Sam' }],
  ['spec', "don't call me Seth, call me S", P.ferni, {}], // one letter is never a name (as on main)
  // the prod case
  ['prod', 'Can you call me Fern?', P.ferni, { ask: 'Fern' }],
  // each persona
  ['persona', 'call me, Maya', P.maya, { ring: true }],
  ['persona', 'call me Peter', P.peter, { ring: true }],
  ['persona', 'can you call me Alex', P.alex, { ring: true }],
  ['persona', 'call me, Jordan', 'jordan-taylor', { ring: true }],
  ['persona', 'call me Nayan', 'nayan-patel', { ring: true }],
  ['persona', 'call me Maia', P.maya, { ask: 'Maia' }],
  ['persona', 'call me Pete', P.peter, { ask: 'Pete' }],
  // round-1 held-out vocatives
  ['r1-voc', 'Can you call me right now, Ferni?', P.ferni, { ring: true }],
  ['r1-voc', 'Call me, um, Ferni', P.ferni, { ring: true }],
  ['r1-voc', 'Could you call me Ferney', P.ferni, { ask: 'Ferney' }],
  ['r1-voc', 'call me asap Fern', P.ferni, { ring: true }],
  ['r1-voc', 'Call me, Jordyn?', 'jordan-taylor', { ask: 'Jordyn' }],
  // round-1 held-out renames
  ['r1-ren', 'Actually, call me Fern from now on', P.ferni, { confirm: 'Fern' }],
  ['r1-ren', 'Just call me Pete', P.ferni, { confirm: 'Pete' }],
  ['r1-ren', "I'm Sam, not Seth. Call me, Ferni.", P.ferni, { confirm: 'Sam', ring: true }],
  ['r1-ren', 'Please call me Jess', P.ferni, { confirm: 'Jess' }],
  ['r1-ren', 'My friends call me Mya', P.ferni, { confirm: 'Mya' }],
  // round-2 held-out, written before the code (scratchpad r2-2698/heldout.json)
  ['r2-voc', 'Ferni can you phone me real quick', P.ferni, { ring: true }],
  ['r2-voc', 'Could you call me, Fernie?', P.ferni, { ask: 'Fernie' }],
  ['r2-voc', 'call me up Ferni', P.ferni, { ring: true }],
  ['r2-voc', 'Maya, give me a ring please', P.maya, { ring: true }],
  ['r2-voc', 'Can you call me now, Furny?', P.ferni, { ring: true }],
  ['r2-ren', 'Honestly, just call me Fernanda', P.ferni, { confirm: 'Fernanda' }],
  ['r2-ren', 'You can call me Jordy', P.ferni, { confirm: 'Jordy' }],
  ['r2-ren', "My name's actually Petra, not Seth", P.ferni, { confirm: 'Petra' }],
  ['r2-ren', 'I go by Mia these days', P.ferni, { confirm: 'Mia' }],
  ['r2-ren', 'Everyone calls me Nate', P.ferni, { confirm: 'Nate' }],
];

describe.each(['off', 'on'] as const)('CALL_ME_VOCATIVE=on, NAME_CAPTURE_STRICT=%s', (strict) => {
  it.each(ROWS)('[%s] %j', (_group, said, personaId, want) => {
    ON(strict);
    const session = call(personaId);
    const text = turn(session, said);
    // Never a new name from one utterance.
    expect(session.userData.userName).toBe('Seth');
    expect(text.includes(RING)).toBe(want.ring === true);
    if (want.ask) {
      expect(text).toContain(EITHER);
      expect(text).toContain(`should I call you ${want.ask}?`);
    } else expect(text).not.toContain(EITHER);
    if (want.confirm) expect(text).toContain(`("${want.confirm} from now on?")`);
    else expect(text).not.toContain(CONFIRM);
  });
});

describe('the confirm flow (flag on)', () => {
  const setup = () => {
    ON('on');
    const session = {
      userData: {
        userId: 'u1',
        userName: 'Seth',
        services: { sessionId: `s-confirm-${++seq}`, userProfile: { preferredName: 'Seth' } },
      },
    };
    const persist = vi.fn(async (_userId: string, _name: string) => undefined);
    const deps = { persist, verifiedOwner: () => true, outbound: () => false };
    const say = (words: string): string => {
      const ctx = chat(words);
      const note = nameCorrectionNote(ctx, session, words, process.env, deps);
      return `${note} ${callMeNote(ctx, session, words)}`;
    };
    return { session, persist, say };
  };

  it('a new name waits, and a yes on the next turn saves it once', () => {
    const { session, persist, say } = setup();
    expect(say('Just call me Pete')).toContain('("Pete from now on?")');
    expect(say('Just call me Pete')).toContain('("Pete from now on?")'); // the final request, same turn
    expect(session.userData.userName).toBe('Seth');
    expect(persist).not.toHaveBeenCalled();

    const yes = say('Yeah, go ahead.');
    expect(yes).toContain('their name is Pete, not Seth');
    say('Yeah, go ahead.'); // the final request, same turn: no second write
    expect(session.userData.userName).toBe('Pete');
    expect(session.userData.services.userProfile.preferredName).toBe('Pete');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('u1', 'Pete');
  });

  it.each(['yes', 'Yes, Sam.', 'Sam.', 'yeah, Sam, not Seth', 'yes, call me Sam', 'mhm'])(
    '%j confirms Sam',
    (answer) => {
      const { session, persist, say } = setup();
      say('Please call me Sam');
      say(answer);
      expect(session.userData.userName).toBe('Sam');
      expect(persist).toHaveBeenCalledWith('u1', 'Sam');
    }
  );

  it.each(['no', 'No, keep Seth', 'what time is it', 'Sam? No.', 'hmm, maybe later'])(
    '%j drops the name',
    (answer) => {
      const { session, persist, say } = setup();
      say('Please call me Sam');
      expect(say(answer)).not.toContain('Sam');
      say('yes'); // a later yes has nothing left to confirm
      expect(session.userData.userName).toBe('Seth');
      expect(persist).not.toHaveBeenCalled();
    }
  );

  it('"No, Samuel" drops Sam and asks about Samuel', () => {
    const { session, persist, say } = setup();
    say('call me Sam');
    expect(say('No, call me Samuel')).toContain('("Samuel from now on?")');
    say('yes');
    expect(session.userData.userName).toBe('Samuel');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('u1', 'Samuel');
  });

  it('"call me Fern": the answer decides, ring or name', () => {
    const ring = setup();
    expect(ring.say('Can you call me Fern?')).toContain(EITHER);
    const rang = ring.say('Ring my phone');
    expect(rang).toContain(RING);
    expect(ring.session.userData.userName).toBe('Seth');

    const named = setup();
    named.say('Can you call me Fern?');
    expect(named.say('The name, call me Fern')).not.toContain(RING);
    expect(named.session.userData.userName).toBe('Fern');
    expect(named.persist).toHaveBeenCalledWith('u1', 'Fern');

    const neither = setup();
    neither.say('Can you call me Fern?');
    expect(neither.say('yes')).not.toContain(RING);
    expect(neither.session.userData.userName).toBe('Seth');
  });

  it('"call me Alex" from someone already called Alex asks only about a call', () => {
    ON('on');
    const session = call('ferni', 'Alex');
    expect(turn(session, 'call me Alex')).toContain('("On your phone?")');
    expect(turn(session, 'yes please')).toContain(RING);
  });
});

describe('ring notes (flag on)', () => {
  it('"Did you give me a call?" offers to ring when no call was placed', () => {
    ON('off');
    expect(turn(call(), 'Did you give me a call?')).toContain('offer to ring their phone now');
    expect(turn(call(), 'Did you give me a call?', { called: true })).not.toContain(
      'offer to ring'
    );
  });

  it('"call me, Ferni" after a placed call says it already rang, never a second call', () => {
    ON('off');
    const text = turn(call(), 'Can you call me, Ferni?', { called: true });
    expect(text).not.toContain(RING);
    expect(text).toContain('You already called their phone on this call');
  });

  it.each(['call me later', 'call me crazy', 'did you call my mom?', "please don't call me"])(
    '%j gets no call-me line',
    (said) => {
      ON('off');
      const text = turn(call(), said);
      expect(text).not.toContain('callUser');
      expect(text).not.toContain('ring their phone');
    }
  );

  it('never rides crisis guidance', () => {
    ON('off');
    const ctx = chat('Ferni, call me');
    expect(callMeNote(ctx, call(), 'Ferni, call me')).toContain(RING);
    expect(callMeNote(ctx, call(), 'Ferni, call me', { careful: true })).toBe('');
  });
});

describe('with CALL_ME_VOCATIVE off: main', () => {
  it.each([
    ['Can you call me Fern?', 'Fern'],
    ['call me Sam', 'Sam'],
    ['Please call me Jess', 'Jess'],
    ['Could you call me Ferney', 'Ferney'],
  ])('%j renames at once and gets no call-me line', (said, name) => {
    delete process.env.CALL_ME_VOCATIVE;
    process.env.NAME_CORRECTION = 'on';
    process.env.NAME_CAPTURE_STRICT = 'off';
    const session = call();
    const text = turn(session, said);
    expect(session.userData.userName).toBe(name);
    expect(text).not.toContain('callUser');
    expect(text).not.toContain(CONFIRM);
    expect(text).not.toContain(EITHER);
  });
});
