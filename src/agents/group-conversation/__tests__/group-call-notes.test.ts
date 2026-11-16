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
    expect(joinNote('Sarah', 'Seth').text).toBe(
      "Sarah (guest) is on this call by phone with Seth. Lines that start with [Sarah (guest)] are hers, and lines that start with [Seth] are Seth's. " +
        'A line marked [unclear] could be either of them: if it matters who said it, ask. ' +
        'Talk with both of them, use their names, and let them talk to each other. ' +
        "Sarah (guest) can hear everything you say, so don't bring up Seth's private things unless Seth does."
    );
    expect(joinNote('the guest', 'the caller').text).toMatch(
      /^The guest is on this call by phone with the caller\. Lines that start with \[the guest\] are hers/
    );
  });

  it('says when the guest leaves, the owner drops off and the owner is back', () => {
    expect(guestLeftNote('the guest').text).toBe('The guest has left the call.');
    expect(ownerGoneNote('Seth', 'Sarah').text).toBe(
      "Seth has dropped off the call. Wait for Seth to come back, and don't talk about Seth's private things with Sarah (guest)."
    );
    expect(ownerBackNote('the caller').text).toBe('The caller is back on the call.');
  });

  it('names the guest with her role in every note', () => {
    const notes = [
      joinNote('Sarah', 'Seth'),
      guestLeftNote('Sarah'),
      ownerGoneNote('Seth', 'Sarah'),
    ];
    for (const { text: note } of notes) {
      expect(note).toContain('Sarah (guest)');
      expect(note).not.toMatch(/Sarah(?! \(guest\))/);
    }
    expect(guestLeftNote('Sarah').text).toBe('Sarah (guest) has left the call.');
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

const join = joinNote('Sarah', 'Seth');
const left = guestLeftNote('Sarah');
const gone = ownerGoneNote('Seth', 'Sarah');
const back = ownerBackNote('Seth');
const said = (p: { notes: Array<{ content: string }> }): string[] => p.notes.map((n) => n.content);

describe('callNotes', () => {
  it('tells the persona on the call now, with a stable id per note', () => {
    const first = persona();
    const { note } = callNotes({ currentAgent: first.agent }, first.agent, 'session-notes-1');
    note(join);
    note(left);
    expect(said(first)).toEqual([join.text, left.text]);
    expect(first.notes.map((n) => n.id)).toEqual([
      'group_call_session-notes-1_1',
      'group_call_session-notes-1_2',
    ]);
  });

  it('a persona that takes over is told the call as it stands, once, under the same ids', () => {
    const first = persona();
    const next = persona();
    const session = { currentAgent: first.agent };
    const { note, renote } = callNotes(session, first.agent, 'session-notes-2');
    renote(); // nothing to say yet
    note(join);
    note(gone);
    renote(); // the same persona: nothing new
    session.currentAgent = next.agent;
    renote();
    renote();
    expect(said(first)).toEqual([join.text, gone.text]);
    expect(said(next)).toEqual([join.text, gone.text]);
    expect(next.notes.map((n) => n.id)).toEqual(first.notes.map((n) => n.id));
  });

  it('does not tell a persona that takes over what no longer holds', () => {
    const first = persona();
    const next = persona();
    const session = { currentAgent: first.agent };
    const { note, renote } = callNotes(session, first.agent, 'session-notes-3');
    note(join);
    note(gone);
    note(back);
    note(left);
    session.currentAgent = next.agent;
    renote();
    expect(said(next)).toEqual([]);
    note(join);
    expect(said(next)).toEqual([join.text]);
  });

  it('a persona that took over before the next note is told the call as it stands first', () => {
    const ferni = persona();
    const maya = persona();
    const session = { currentAgent: ferni.agent };
    const { note, renote } = callNotes(session, ferni.agent, 'session-notes-4');
    note(join);
    session.currentAgent = maya.agent; // the handoff, before its state change event
    note(left);
    renote();
    expect(said(maya)).toEqual([join.text, left.text]);
  });

  it('falls back to the persona it was made with when the session is not running', () => {
    const first = persona();
    const session = {
      get currentAgent(): RecallAgent {
        throw new Error('AgentSession is not running');
      },
    };
    callNotes(session, first.agent, 'session-notes-5').note(join);
    expect(said(first)).toEqual([join.text]);
  });
});
