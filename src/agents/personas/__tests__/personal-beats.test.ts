/**
 * PERSONA_BEATS=on (personal-beats.ts): his life as written, light beats on a
 * first call, a heavy chapter only near the caller's own hard ground and with
 * history. Built the way a call builds the request (withTurnReminder).
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';
import {
  beatNote,
  CANON_LINE,
  FIRST_CALL_LINE,
  HEAVY_OK_LINE,
  LIGHT_LINE,
  nearHeavyChapter,
  priorCallsOf,
  TRUSTED_AFTER_CALLS,
} from '../personal-beats.js';
import { withTurnReminder } from '../turn-request.js';

const ON = { PERSONA_BEATS: 'on' };

/** What the model is told on the caller's turn, for a caller with this many past calls. */
function callerTurn(words: string, totalConversations?: number): string {
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: words });
  const userProfile = { subscription: { tier: 'free' }, totalConversations };
  const session = { userData: { personaId: 'ferni', services: { userProfile } } };
  return (withTurnReminder(chat, session).items.at(-1) as llm.ChatMessage).textContent ?? '';
}

describe('personal beats', () => {
  afterEach(() => {
    delete process.env['PERSONA_BEATS'];
  });

  it('off: nothing, whatever the call', () => {
    expect(beatNote({ said: 'my mom died last month', priorCalls: 0 }, {})).toBe('');
    expect(beatNote({ said: 'my mom died last month', priorCalls: 9 }, {})).toBe('');
  });

  it('first call: the script plus one light thing, nothing heavy, even on hard ground', () => {
    const note = beatNote({ said: 'my mom died last month', priorCalls: 0 }, ON);
    expect(note).toBe(`${CANON_LINE} ${FIRST_CALL_LINE}`);
    expect(note).not.toContain(HEAVY_OK_LINE);
  });

  it('hard ground with history: one plain sentence of his own, if it truly fits', () => {
    const said = 'my dad and I stopped talking after the divorce';
    expect(beatNote({ said, priorCalls: TRUSTED_AFTER_CALLS }, ON)).toBe(
      `${CANON_LINE} ${HEAVY_OK_LINE}`
    );
  });

  it('hard ground without enough history: the reply stays on them', () => {
    const said = 'I got laid off today';
    expect(beatNote({ said, priorCalls: TRUSTED_AFTER_CALLS - 1 }, ON)).toBe(
      `${CANON_LINE} ${LIGHT_LINE}`
    );
    // Unknown history is not history.
    expect(beatNote({ said }, ON)).toBe(`${CANON_LINE} ${LIGHT_LINE}`);
  });

  it('ordinary talk on a later call: just the script', () => {
    expect(beatNote({ said: 'work was busy, made pasta', priorCalls: 6 }, ON)).toBe(CANON_LINE);
  });

  it('crisis guidance rides the reply: no beat lines at all', () => {
    expect(beatNote({ said: 'I lost my job', priorCalls: 0, careful: true }, ON)).toBe('');
  });

  it('hard ground: deaths, grief, depression, a lost job, a hard dad, a breakup', () => {
    for (const said of [
      'my grandpa passed away on Sunday',
      "I've been grieving all week",
      "I've been really depressed",
      'I got fired this morning',
      'my father never said he was proud of me',
      'we broke up',
      'I start therapy on Monday',
    ])
      expect(nearHeavyChapter(said), said).toBe(true);
  });

  it('figures of speech and light family talk are not hard ground', () => {
    for (const said of [
      "I'm dying to try that place",
      "I'm so fired up about the trip",
      'my dad said the game was great',
      'my sister moved to Denver',
      'long day at work',
    ])
      expect(nearHeavyChapter(said), said).toBe(false);
  });

  it('prior calls: the profile count, 0 for a new caller, unknown otherwise', () => {
    expect(priorCallsOf({ services: { userProfile: { totalConversations: 4 } } })).toBe(4);
    expect(priorCallsOf({ isReturningUser: false })).toBe(0);
    expect(priorCallsOf({ isReturningUser: true })).toBeUndefined();
    expect(priorCallsOf(undefined)).toBeUndefined();
  });

  it('live request: the beat line rides the caller turn with the flag on, never off', () => {
    expect(callerTurn('my mom died last month', 0)).not.toContain(CANON_LINE);
    process.env['PERSONA_BEATS'] = 'on';
    const first = callerTurn('my mom died last month', 0);
    expect(first).toContain(CANON_LINE);
    expect(first).toContain(FIRST_CALL_LINE);
    const later = callerTurn('my mom died last month', 5);
    expect(later).toContain(HEAVY_OK_LINE);
    expect(later).not.toContain(FIRST_CALL_LINE);
  });
});
