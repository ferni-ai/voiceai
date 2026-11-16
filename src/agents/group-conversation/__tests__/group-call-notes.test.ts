/**
 * GROUP_CALL: what Ferni is told about who is on the call, and that a persona taking
 * over the call is told it all again.
 */
import { describe, expect, it } from 'vitest';
import type { RecallAgent } from '../../multi-agent/recall-note.js';
import {
  callNotes,
  guestLeftNote,
  joinNote,
  ownerBackNote,
  ownerFirstName,
  ownerGoneNote,
} from '../group-call-notes.js';

describe('group call note copy', () => {
  it('the join note names both people and says what the labels mean', () => {
    expect(joinNote('Sarah', 'Seth')).toBe(
      "Sarah (guest) is on this call by phone with Seth. Lines that start with [Sarah (guest)] are hers, and lines that start with [Seth] are Seth's. " +
        'A line marked [unclear] could be either of them: if it matters who said it, ask. ' +
        'Talk with both of them, use their names, and let them talk to each other. ' +
        "Sarah (guest) can hear everything you say, so don't bring up Seth's private things unless Seth does."
    );
    expect(joinNote('the guest', 'the caller')).toMatch(
      /^The guest is on this call by phone with the caller\. Lines that start with \[the guest\] are hers/
    );
  });

  it('says when the guest leaves, the owner drops off and the owner is back', () => {
    expect(guestLeftNote('the guest')).toBe('The guest has left the call.');
    expect(ownerGoneNote('Seth', 'Sarah')).toBe(
      "Seth has dropped off the call. Wait for Seth to come back, and don't talk about Seth's private things with Sarah (guest)."
    );
    expect(ownerBackNote('the caller')).toBe('The caller is back on the call.');
  });

  it('names the guest with her role in every note', () => {
    const notes = [
      joinNote('Sarah', 'Seth'),
      guestLeftNote('Sarah'),
      ownerGoneNote('Seth', 'Sarah'),
    ];
    for (const note of notes) {
      expect(note).toContain('Sarah (guest)');
      expect(note).not.toMatch(/Sarah(?! \(guest\))/);
    }
    expect(guestLeftNote('Sarah')).toBe('Sarah (guest) has left the call.');
  });

  it("finds the owner's first name, or says the caller", () => {
    const profile = (preferredName?: string, name?: string) => ({
      services: { userProfile: { preferredName, name } },
    });
    expect(ownerFirstName(profile('Sam', 'Sam Rivera'))).toBe('Sam');
    expect(ownerFirstName(profile(undefined, 'Sam Rivera'))).toBe('Sam');
    expect(ownerFirstName({ userName: 'Sam Rivera' })).toBe('Sam');
    expect(ownerFirstName({})).toBe('the caller');
    expect(ownerFirstName(undefined)).toBe('the caller');
  });
});

/** A persona whose system notes the test can read. */
function persona(): { agent: RecallAgent; notes: Array<{ content: string; id?: string }> } {
  const notes: Array<{ content: string; id?: string }> = [];
  const agent: RecallAgent = {
    chatCtx: {
      copy: () => ({
        items: [],
        addMessage: (msg: { content: string; id?: string }) => notes.push(msg),
      }),
    },
    updateChatCtx: async () => undefined,
  };
  return { agent, notes };
}

describe('callNotes', () => {
  it('tells the persona on the call now, with a stable id per note', () => {
    const first = persona();
    const session = { currentAgent: first.agent };
    const { note } = callNotes(session, first.agent, 'session-notes-1');
    note('Sarah is on this call.');
    note('Sarah has left the call.');
    expect(first.notes.map((n) => n.content)).toEqual([
      'Sarah is on this call.',
      'Sarah has left the call.',
    ]);
    expect(first.notes.map((n) => n.id)).toEqual([
      'group_call_session-notes-1_1',
      'group_call_session-notes-1_2',
    ]);
  });

  it('a persona that takes over is told every note so far, once', () => {
    const first = persona();
    const next = persona();
    const session = { currentAgent: first.agent };
    const { note, renote } = callNotes(session, first.agent, 'session-notes-2');
    renote(); // nothing to say yet
    note('Sarah is on this call.');
    renote(); // the same persona: nothing new
    session.currentAgent = next.agent;
    renote();
    renote();
    expect(first.notes.map((n) => n.content)).toEqual(['Sarah is on this call.']);
    expect(next.notes.map((n) => n.content)).toEqual(['Sarah is on this call.']);
  });

  it('falls back to the persona it was made with when the session is not running', () => {
    const first = persona();
    const session = {
      get currentAgent(): RecallAgent {
        throw new Error('AgentSession is not running');
      },
    };
    callNotes(session, first.agent, 'session-notes-3').note('Sarah is on this call.');
    expect(first.notes.map((n) => n.content)).toEqual(['Sarah is on this call.']);
  });
});
