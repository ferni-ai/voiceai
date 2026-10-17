import { llm } from '@livekit/agents';
import { describe, expect, it, vi } from 'vitest';

import {
  rememberCallerRecognition,
  rememberDispatchIdentity,
} from '../../voice-agent-entry/caller-recognition.js';
import { nameCorrectionNote, nameNote, statedName } from '../name-correction.js';
import { withTurnReminder } from '../turn-request.js';

const atomicProfileUpdate = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../../../memory/firestore-store.js', () => ({
  getFirestoreStore: () => ({ atomicProfileUpdate }),
}));

const ON = { NAME_CORRECTION: 'on' };

function chat(...lines: Array<['agent' | 'user', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  for (const [who, text] of lines)
    ctx.addMessage({ role: who === 'agent' ? 'assistant' : 'user', content: text });
  return ctx;
}

/** An app call on Sam's account, with the profile the end-of-call save writes. */
function samCall() {
  const userProfile: { preferredName?: string } = { preferredName: 'Sam' };
  return {
    userData: { userId: 'u1', userName: 'Sam', services: { sessionId: 's1', userProfile } },
  };
}

function deps(owner = true, outbound = false) {
  const persist = vi.fn(async (_userId: string, _name: string) => undefined);
  return { persist, verifiedOwner: () => owner, outbound: () => outbound };
}

describe('statedName', () => {
  it.each([
    ["I'm Jess.", 'Jess'],
    ["Hi! I'm Jess, by the way.", 'Jess'],
    ['I am Jess', 'Jess'],
    ["Oh, I'm actually Jess", 'Jess'],
    ['You can call me Jess', 'Jess'],
    ["My name's Jess", 'Jess'],
    ['my name is Mary-Kate', 'Mary-Kate'],
    ['I go by Jess these days', 'Jess'],
    ["I'm not Sam, I'm Jess", 'Jess'],
  ])('reads %j as their name', (words, name) => {
    expect(statedName(words, 'Sam')).toBe(name);
  });

  it.each([
    "I'm tired",
    "I'm Tired today", // a capitalised state is still not a name
    "I'm Jewish",
    "I'm American",
    "I'm Jess's mom",
    "I'm Jess' mom",
    "I'm Jess, Sam's wife",
    "I'm Jess, calling for her husband",
    "I'm in Denver",
    "i'm jess", // not capitalised: left alone rather than guessed
    'Call me back later',
    "It's Jess actually", // no name was asked for or used
  ])('does not read %j as their name', (words) => {
    expect(statedName(words, 'Sam')).toBeNull();
  });

  it('reads "it\'s X" only as an answer to their name', () => {
    expect(statedName("It's Jess actually", 'Sam', 'Hey Sam, how was your day?')).toBe('Jess');
    expect(statedName("It's actually Jess", undefined, 'What should I call you?')).toBe('Jess');
    expect(statedName("It's Denver actually", 'Sam', 'Where do you live?')).toBeNull();
    expect(statedName("It's Monday actually", 'Sam', 'Hey Sam, is it Friday?')).toBeNull();
  });

  it('escapes the account name it looks for', () => {
    expect(statedName("I'm Jess", 'S.m (x')).toBe('Jess');
  });
});

describe('nameCorrectionNote', () => {
  const said = chat(['agent', 'Hey Sam, good to hear from you.'], ['user', "I'm Jess, actually."]);

  it('changes nothing with the flag off', () => {
    const session = samCall();
    const d = deps();
    expect(nameCorrectionNote(said, session, "I'm Jess, actually.", {}, d)).toBe('');
    expect(session.userData.userName).toBe('Sam');
    expect(session.userData.services.userProfile.preferredName).toBe('Sam');
    expect(d.persist).not.toHaveBeenCalled();
  });

  it('renames the caller for this call and the next, and says so', () => {
    const session = samCall();
    const d = deps();
    expect(session.userData.userName).toBe('Sam');
    const note = nameCorrectionNote(said, session, "I'm Jess, actually.", ON, d);
    expect(note).toBe(nameNote('Jess', 'Sam'));
    expect(note).toContain('not Sam');
    expect(session.userData.userName).toBe('Jess');
    // the in-memory profile, so the end-of-call save doesn't write Sam back
    expect(session.userData.services.userProfile.preferredName).toBe('Jess');
    expect(d.persist).toHaveBeenCalledExactlyOnceWith('u1', 'Jess');
  });

  it('renames once per turn (preemptive and final requests) and keeps the note after', () => {
    const session = samCall();
    const d = deps();
    nameCorrectionNote(said, session, "I'm Jess, actually.", ON, d);
    nameCorrectionNote(said, session, "I'm Jess, actually.", ON, d);
    expect(d.persist).toHaveBeenCalledTimes(1);
    const later = chat(['agent', 'Jess! Got it.'], ['user', 'Long day at work.']);
    expect(nameCorrectionNote(later, session, 'Long day at work.', ON, d)).toBe(
      nameNote('Jess', 'Sam')
    );
  });

  it('adds nothing when they give the name Ferni already has', () => {
    const session = samCall();
    const d = deps();
    expect(nameCorrectionNote(said, session, "Yeah, I'm Sam.", ON, d)).toBe('');
    expect(d.persist).not.toHaveBeenCalled();
  });

  it('takes a first name Ferni already has from a full name as no change', () => {
    const session = samCall();
    session.userData.userName = 'Sam Rivera';
    const d = deps();
    expect(nameCorrectionNote(said, session, "Yeah, I'm Sam.", ON, d)).toBe('');
    expect(session.userData.userName).toBe('Sam Rivera');
  });

  it('adds nothing for words that are not their name', () => {
    const session = samCall();
    const d = deps();
    expect(nameCorrectionNote(said, session, "I'm Jess's mom.", ON, d)).toBe('');
    expect(session.userData.userName).toBe('Sam');
    expect(d.persist).not.toHaveBeenCalled();
  });

  it('renames in-call but writes no profile for a caller not proven to own the account', () => {
    const session = samCall();
    const d = deps(false);
    expect(nameCorrectionNote(said, session, "I'm Jess, actually.", ON, d)).toContain('Jess');
    expect(session.userData.userName).toBe('Jess');
    expect(d.persist).not.toHaveBeenCalled();
    // nor through the end-of-call save, which writes the in-memory profile
    expect(session.userData.services.userProfile.preferredName).toBe('Sam');
  });

  it('keeps the account name unless the owner signal is exactly true', () => {
    for (const signal of [undefined, 'yes', 1, null]) {
      const session = samCall();
      const persist = vi.fn(async () => undefined);
      const verifiedOwner = (() => signal) as unknown as (id: string) => boolean;
      nameCorrectionNote(said, session, "I'm Jess, actually.", ON, {
        persist,
        verifiedOwner,
        outbound: () => false,
      });
      expect(session.userData.userName).toBe('Jess'); // this call only
      expect(session.userData.services.userProfile.preferredName).toBe('Sam');
      expect(persist).not.toHaveBeenCalled();
    }
  });

  it('writes nothing for an anonymous session, whatever the owner check says', () => {
    const session = samCall();
    session.userData.userId = 'anonymous';
    const d = deps();
    nameCorrectionNote(said, session, "I'm Jess, actually.", ON, d);
    expect(session.userData.services.userProfile.preferredName).toBe('Sam');
    expect(d.persist).not.toHaveBeenCalled();
  });

  it('writes nothing to the account with no owner check passed in', () => {
    const session = samCall();
    const persist = vi.fn(async () => undefined);
    nameCorrectionNote(said, session, "I'm Jess, actually.", ON, {
      persist,
      outbound: () => false,
    });
    expect(session.userData.services.userProfile.preferredName).toBe('Sam');
    expect(persist).not.toHaveBeenCalled();
  });

  it('writes nothing to the account once the call turns out to be on behalf of someone', () => {
    const session = samCall();
    const persist = vi.fn(async () => undefined);
    const outbound = vi.fn((_id: string) => true).mockReturnValueOnce(false);
    nameCorrectionNote(said, session, "I'm Jess, actually.", ON, {
      persist,
      verifiedOwner: () => true,
      outbound,
    });
    expect(session.userData.services.userProfile.preferredName).toBe('Sam');
    expect(persist).not.toHaveBeenCalled();
  });

  it('does nothing without a session id (an on-behalf call cannot be ruled out)', () => {
    const session = samCall();
    (session.userData.services as { sessionId?: string }).sessionId = undefined;
    const d = deps();
    expect(nameCorrectionNote(said, session, "I'm Jess, actually.", ON, d)).toBe('');
    expect(session.userData.userName).toBe('Sam');
    expect(d.persist).not.toHaveBeenCalled();
  });

  it('leaves a call Ferni placed for the user alone', () => {
    const session = samCall();
    const d = deps(true, true);
    expect(nameCorrectionNote(said, session, "I'm Jess, actually.", ON, d)).toBe('');
    expect(session.userData.userName).toBe('Sam');
    expect(d.persist).not.toHaveBeenCalled();
  });
});

describe('withTurnReminder', () => {
  it('carries the name note only when NAME_CORRECTION is on', () => {
    const before = process.env.NAME_CORRECTION;
    const text = (session: object): string => {
      const last = withTurnReminder(said(), session).items.at(-1);
      return last?.type === 'message' ? (last.textContent ?? '') : '';
    };
    const said = () => chat(['agent', 'Hey Sam!'], ['user', "Oh, I'm Jess."]);
    try {
      delete process.env.NAME_CORRECTION;
      const off = samCall();
      expect(text(off)).not.toContain('their name is Jess');
      expect(off.userData.userName).toBe('Sam');
      process.env.NAME_CORRECTION = 'on';
      const on = samCall();
      expect(text(on)).toContain('their name is Jess, not Sam');
      expect(on.userData.userName).toBe('Jess');
    } finally {
      if (before === undefined) delete process.env.NAME_CORRECTION;
      else process.env.NAME_CORRECTION = before;
    }
  });
});

describe('withTurnReminder saving the name', () => {
  it("writes the preferred name for a signed-in owner's session, and only then", async () => {
    const before = process.env.NAME_CORRECTION;
    process.env.NAME_CORRECTION = 'on';
    const ctx = chat(['agent', 'Hey Sam!'], ['user', "Oh, I'm Jess."]);
    try {
      atomicProfileUpdate.mockClear();
      withTurnReminder(ctx, samCall()); // session s1 not yet known as the owner
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      }); // a dynamic import's worth
      expect(atomicProfileUpdate).not.toHaveBeenCalled();

      rememberCallerRecognition('s1', { status: 'maybe', attestation: 'B' }); // number, unattested
      const phone = samCall();
      withTurnReminder(ctx, phone);
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      expect(atomicProfileUpdate).not.toHaveBeenCalled();
      expect(phone.userData.services.userProfile.preferredName).toBe('Sam');

      rememberDispatchIdentity('s1', 'firebase', '{}'); // the app, signed in
      withTurnReminder(ctx, samCall());
      await vi.waitFor(() => expect(atomicProfileUpdate).toHaveBeenCalledTimes(1));
      const [userId, update] = atomicProfileUpdate.mock.calls[0] as unknown as [
        string,
        (p: object) => object,
      ];
      expect(userId).toBe('u1');
      expect(update({ id: 'u1', name: 'Sam', preferredName: 'Sam' })).toEqual({
        id: 'u1',
        name: 'Sam',
        preferredName: 'Jess',
      });
    } finally {
      if (before === undefined) delete process.env.NAME_CORRECTION;
      else process.env.NAME_CORRECTION = before;
    }
  });
});
