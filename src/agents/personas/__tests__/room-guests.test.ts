import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  forgetRoom,
  guestChanges,
  guestsPresent,
  hasGuests,
  roomGuestsNote,
  roomNote,
} from '../room-guests.js';
import { nameCorrectionNote } from '../name-correction.js';
import { speakerIsAccountOwner } from '../../multi-agent/live-call-behaviors.js';
import { rememberDispatchIdentity } from '../../voice-agent-entry/caller-recognition.js';

const ON = { ROOM_GUESTS: 'on' };
const session = (sessionId: string) => ({
  userData: { userName: 'Seth', services: { sessionId } },
});

describe('guestChanges', () => {
  it('picks up the guests from the prod calls (2026-10-12)', () => {
    expect(guestChanges("Rest did not help. I'm with my friend David.", 'Seth').arrived).toEqual([
      'David',
    ]);
    expect(guestChanges("Hey, this is Seth's friend David.", 'Seth').arrived).toEqual(['David']);
    expect(guestChanges("Well, that's that was David talking.", 'Seth').arrived).toEqual(['David']);
    expect(guestChanges('My wife Ana is here.', 'Seth').arrived).toEqual(['Ana']);
    expect(guestChanges('Maria is here with me.', 'Seth').arrived).toEqual(['Maria']);
  });

  it('notes a guest who has no name yet', () => {
    expect(guestChanges("I'm with a friend right now.", 'Seth')).toMatchObject({
      arrived: [],
      unnamed: true,
    });
    expect(guestChanges("Someone's here with me.", 'Seth').unnamed).toBe(true);
  });

  it('ignores the owner, teammates, things that are not people, and lower-case words', () => {
    expect(guestChanges("I'm with Seth", 'Seth').arrived).toEqual([]);
    expect(guestChanges("I'm with Nayan on this one", 'Seth').arrived).toEqual([]);
    expect(guestChanges('Christmas is here already', 'Seth').arrived).toEqual([]);
    expect(guestChanges("I'm with you on that", 'Seth')).toMatchObject({
      arrived: [],
      unnamed: false,
    });
    expect(guestChanges('my friend is tired', 'Seth').arrived).toEqual([]);
  });

  it('sees a guest leave', () => {
    expect(guestChanges('David just left, so it is just me', 'Seth').left).toEqual(['David']);
  });
});

describe('roomGuestsNote', () => {
  afterEach(() => ['s1', 's2', 's3', 's4'].forEach(forgetRoom));

  it('adds the note from the turn a guest arrives until they leave', () => {
    const s = session('s1');
    expect(roomGuestsNote(s, 'Still thinking about retirement.', ON)).toBe('');
    const note = roomGuestsNote(s, "I'm with my friend David.", ON);
    expect(note).toContain('David is in the room on the same mic');
    expect(note).toContain("Don't assume it's Seth");
    expect(note).toContain("Seth's mail, plans or tasks are about what you do for Seth");
    expect(roomGuestsNote(s, 'What do you help Seth with?', ON)).toBe(note);
    expect(roomGuestsNote(s, 'David left, it is just me now.', ON)).toBe('');
  });

  it('does nothing while ROOM_GUESTS is off', () => {
    const s = session('s2');
    expect(roomGuestsNote(s, "I'm with my friend David.", {})).toBe('');
    expect(hasGuests('s2')).toBe(false);
    expect(guestsPresent(s, {})).toBe(false);
  });

  it('names an unnamed guest once they are introduced', () => {
    const s = session('s3');
    expect(roomGuestsNote(s, "I'm with a friend.", ON)).toContain('someone else is in the room');
    expect(roomGuestsNote(s, "Hey, this is Seth's friend David.", ON)).toContain(
      'David is in the room'
    );
  });

  it("keeps a guest's yes from confirming a send", () => {
    const prev = process.env.ROOM_GUESTS;
    process.env.ROOM_GUESTS = 'on';
    try {
      rememberDispatchIdentity('s4', 'web_auth'); // a signed-in app session: the owner's yes counts
      expect(speakerIsAccountOwner('s4')).toBe(true);
      roomGuestsNote(session('s4'), "I'm with my friend David.", ON);
      expect(speakerIsAccountOwner('s4')).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.ROOM_GUESTS;
      else process.env.ROOM_GUESTS = prev;
    }
  });
});

describe('name correction with a guest in the room', () => {
  const env = { NAME_CORRECTION: 'on', ROOM_GUESTS: 'on' };
  const sethCall = (sessionId: string) => ({
    userData: {
      userId: 'u1',
      userName: 'Seth',
      services: { sessionId, userProfile: { preferredName: 'Seth' } },
    },
  });
  const deps = () => ({
    persist: vi.fn(async () => undefined),
    verifiedOwner: () => true,
    outbound: () => false,
  });
  afterEach(() => ['s5', 's6'].forEach(forgetRoom));

  it("doesn't let the guest's \"I'm David\" rename the owner", () => {
    const call = sethCall('s5');
    const d = deps();
    roomGuestsNote(call, "I'm with my friend David.", env);
    const note = nameCorrectionNote(
      llm.ChatContext.empty(),
      call,
      "I'm David, nice to meet you.",
      env,
      d
    );
    expect(note).toBe('');
    expect(call.userData.userName).toBe('Seth');
    expect(d.persist).not.toHaveBeenCalled();
  });

  it('still renames with no guest present (control)', () => {
    const call = sethCall('s6');
    const d = deps();
    nameCorrectionNote(llm.ChatContext.empty(), call, "I'm David, actually.", env, d);
    expect(call.userData.userName).toBe('David');
  });
});

describe('roomNote', () => {
  it('has no em dashes or ellipses', () => {
    const note = roomNote(['David', 'Ana'], 'Seth');
    expect(note).toContain('David and Ana are in the room');
    expect(note).not.toMatch(/[—…]|\.\.\./);
  });
});
