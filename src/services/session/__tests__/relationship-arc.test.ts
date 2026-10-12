import { describe, expect, it } from 'vitest';
import { createUserProfile } from '../../../types/user-profile.js';
import { buildUserAwareness } from '../../../agents/voice-agent/phases/user-awareness.js';
import {
  CALL_NOTES_KEPT,
  callNotes,
  closenessLine,
  relationshipArcLines,
  rememberCall,
} from '../relationship-arc.js';

const ON = { RELATIONSHIP_ARC: 'on' };
const OFF = {};
const day = (d: number) => new Date(Date.UTC(2026, 9, d, 18));

describe('rememberCall', () => {
  it('off: sets lastConversationSummary as before and writes nothing else', () => {
    const p = createUserProfile('u1', 'Dana');
    rememberCall(
      p,
      ['got the clinic job', 'starts in three weeks', 'told her manager'],
      day(1),
      OFF
    );
    expect(p.lastConversationSummary).toBe('got the clinic job; starts in three weeks');
    expect(p.customData?.recentCallNotes).toBeUndefined();
  });

  it('on: keeps the newest calls first, a few deep, and each call once', () => {
    const p = createUserProfile('u1', 'Dana');
    for (let i = 1; i <= CALL_NOTES_KEPT + 2; i++) rememberCall(p, [`call ${i}`], day(i), ON);
    rememberCall(p, [`call ${CALL_NOTES_KEPT + 2}`], day(20), ON); // same call, second path
    const notes = callNotes(p).map((n) => n.note);
    expect(notes).toEqual(['call 6', 'call 5', 'call 4', 'call 3']);
  });

  it('ignores a malformed stored value instead of throwing', () => {
    const p = createUserProfile('u1', 'Dana');
    p.customData = { recentCallNotes: ['x', { at: 1 }, null] };
    expect(callNotes(p)).toEqual([]);
    rememberCall(p, ['news'], day(2), ON);
    expect(callNotes(p).map((n) => n.note)).toEqual(['news']);
  });
});

describe('relationshipArcLines', () => {
  function profileWithCalls(calls: number) {
    const p = createUserProfile('u1', 'Dana');
    p.totalConversations = calls;
    rememberCall(p, ['applied for a clinic job'], day(3), ON);
    rememberCall(p, ['got the clinic job'], day(8), ON);
    return p;
  }

  it('is null with the flag off, or with no notes yet', () => {
    expect(relationshipArcLines(profileWithCalls(18), day(10), OFF)).toBeNull();
    const fresh = createUserProfile('u1', 'Dana');
    fresh.totalConversations = 18;
    expect(relationshipArcLines(fresh, day(10), ON)).toBeNull();
  });

  it('lists where things stand, newest first, with how long ago', () => {
    const lines = relationshipArcLines(profileWithCalls(18), day(10), ON)!;
    expect(lines.slice(2)).toEqual([
      '- 2 days ago: got the clinic job',
      '- 7 days ago: applied for a clinic job',
    ]);
  });

  it('tells Ferni how close they are by call count, not more', () => {
    expect(closenessLine(2)).toMatch(/new to each other/);
    expect(closenessLine(6)).toMatch(/getting to know/);
    expect(closenessLine(18)).toMatch(/shorthand needs no explaining/);
  });

  it('reaches the prompt block in place of the single last-call line', () => {
    const p = profileWithCalls(18);
    const config = { userProfile: p, isReturningUser: true, sessionStartTime: day(10) };
    process.env.RELATIONSHIP_ARC = 'on';
    try {
      const on = buildUserAwareness(config).instructionsBlock;
      expect(on).toMatch(/2 days ago: got the clinic job/);
      expect(on).not.toMatch(/Last time you talked about/);
    } finally {
      delete process.env.RELATIONSHIP_ARC;
    }
    const off = buildUserAwareness(config).instructionsBlock;
    expect(off).toMatch(/Last time you talked about: got the clinic job/);
    expect(off).not.toMatch(/Where their stories stand/);
  });
});
