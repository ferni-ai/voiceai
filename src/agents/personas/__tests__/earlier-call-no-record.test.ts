/**
 * EARLIER_CALL_NO_DENIAL (#3134): the notes for a caller with no past calls say
 * there is no earlier call on record, never that this is the first call. Dev,
 * flag on (7b8298f688): 3 of 6 runs still said "this really is our first time
 * talking", because these notes told the model, as fact, that it was. They know
 * there is no record, not that there was no call. Each site is run through the
 * function that builds its text; flag off, each is today's text exactly.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DONT_KNOW_THEM_YET } from '../earlier-call-honest.js';
import {
  FIRST_CALL_NOTE,
  NAME_SWAP_NOTE,
  firstCallNote,
  nameSwapPlain,
} from '../first-call-rapport.js';
import { CANON_LINE, FIRST_CALL_LINE, beatNote } from '../personal-beats.js';
import {
  STRANGER_GREETING_DIRECTION,
  easyStrangerDirection,
  firstCallFacts,
} from '../../multi-agent/first-call-stranger.js';
import { firstTalkNote } from '../../multi-agent/greeting-direction.js';
import { buildUserAwareness } from '../../voice-agent/phases/user-awareness.js';

const FIRST = /first (?:call|time|conversation)/i;
const OFF = { EARLIER_CALL_NO_DENIAL: 'off' };
/** The no-record wording in earlier-call-honest.ts. */
const NO_EARLIER_CALLS = 'You have no earlier calls with them on record';
const ON = { EARLIER_CALL_NO_DENIAL: 'on' };

afterEach(() => vi.unstubAllEnvs());

/** user-awareness.ts: the voice agent's call-start facts for a new caller. */
function awarenessFacts(): string[] {
  return buildUserAwareness({
    userProfile: { totalConversations: 0 } as never,
    isReturningUser: false,
    sessionStartTime: new Date('2026-11-20T15:30:00Z'),
  }).facts;
}

/** first-call-rapport.ts: a first call where the name swap is already done. */
function rapportNote(env: Record<string, string>): string {
  const ctx = llm.ChatContext.empty();
  for (const [role, content] of [
    ['assistant', "I'm Ferni, by the way. What should I call you?"],
    ['user', 'Priya.'],
  ] as const)
    ctx.addMessage({ role, content });
  const session = { userData: { userId: 'u-fixture', isReturningUser: false } };
  return firstCallNote(ctx, session, 'Priya.', { FIRST_CALL_RAPPORT: 'on', ...env });
}

const TODAY = 'This is your first conversation with them - be welcoming but not overwhelming.';

describe('call-start awareness (user-awareness.ts)', () => {
  it("flag off: today's fact", () => {
    vi.stubEnv('EARLIER_CALL_NO_DENIAL', 'off');
    expect(awarenessFacts()).toContain(TODAY);
  });
  it('flag on: no earlier calls on record, still welcoming', () => {
    vi.stubEnv('EARLIER_CALL_NO_DENIAL', 'on');
    const facts = awarenessFacts().join('\n');
    expect(facts).not.toMatch(FIRST);
    expect(facts).toContain(`${NO_EARLIER_CALLS} - be welcoming but not overwhelming.`);
  });
});

describe('call-start awareness (agent-setup.ts: firstTalkNote)', () => {
  it("flag off: today's note", () => {
    vi.stubEnv('EARLIER_CALL_NO_DENIAL', 'off');
    expect(firstTalkNote('ecr-off')).toBe(TODAY);
  });
  it('flag on: no earlier calls on record', () => {
    vi.stubEnv('EARLIER_CALL_NO_DENIAL', 'on');
    const note = firstTalkNote('ecr-on');
    expect(note).not.toMatch(FIRST);
    expect(note).toBe(`${NO_EARLIER_CALLS} - be welcoming but not overwhelming.`);
  });
});

describe('persona beats (personal-beats.ts)', () => {
  const beats = (env: Record<string, string>) =>
    beatNote({ said: 'Pretty quiet day.', priorCalls: 0 }, { PERSONA_BEATS: 'on', ...env });
  it("flag off: today's line", () => {
    expect(beats(OFF)).toBe(`${CANON_LINE} ${FIRST_CALL_LINE}`);
  });
  it('flag on: no earlier calls on record, the light-beats guidance kept', () => {
    const note = beats(ON);
    expect(note).not.toMatch(FIRST);
    expect(note).toContain(
      `${NO_EARLIER_CALLS}. If something of yours comes up, keep it to one small, light thing`
    );
  });
});

describe('first-call rapport (first-call-rapport.ts)', () => {
  it("flag off: today's note", () => {
    expect(rapportNote(OFF)).toBe(FIRST_CALL_NOTE);
  });
  it('flag on: no earlier calls on record, getting to know them kept', () => {
    const note = rapportNote(ON);
    expect(note).not.toMatch(FIRST);
    expect(note).toContain(`${NO_EARLIER_CALLS}: you're getting to know a new person`);
  });
});

describe('first-call rapport early, name not known yet (first-call-rapport.ts)', () => {
  /** The opening state: two replies in, no name asked, so the name-swap note rides along. */
  function earlyNote(env: Record<string, string>, scriptFree: boolean): string {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'assistant', content: 'Hey, how is your evening going?' });
    ctx.addMessage({ role: 'user', content: 'Pretty quiet.' });
    const session = { userData: { userId: 'u-fixture', isReturningUser: false } };
    const flags = { FIRST_CALL_RAPPORT: 'on', ...env };
    return firstCallNote(ctx, session, 'Pretty quiet.', flags, scriptFree);
  }

  it.each([false, true])("flag off: today's notes (script-free %s)", (scriptFree) => {
    const note = earlyNote(OFF, scriptFree);
    expect(note.startsWith(FIRST_CALL_NOTE)).toBe(true);
    expect(note).toContain(scriptFree ? nameSwapPlain('Ferni') : NAME_SWAP_NOTE);
  });

  it.each([false, true])(
    'flag on: no first-call words anywhere, the name swap kept (script-free %s)',
    (scriptFree) => {
      const note = earlyNote(ON, scriptFree);
      expect(note).not.toMatch(FIRST);
      expect(note).toContain(
        'swap names at the next easy moment, the way people do when they meet'
      );
    }
  );
});

describe("the stranger's hello (first-call-stranger.ts)", () => {
  it("flag off: today's direction and fact", () => {
    expect(easyStrangerDirection(STRANGER_GREETING_DIRECTION, OFF)).toBe(
      STRANGER_GREETING_DIRECTION
    );
    expect(firstCallFacts(OFF)).toEqual({ 'how well you know each other': 'first time talking' });
  });
  it("flag on: you don't know them yet (no records words in a hello), the guidance kept", () => {
    const direction = easyStrangerDirection(STRANGER_GREETING_DIRECTION, ON);
    expect(direction).not.toMatch(FIRST);
    expect(direction).not.toMatch(/\brecords?\b/i);
    expect(direction).toContain(
      "They just called you, and you don't know them yet. Answer the way"
    );
    expect(firstCallFacts(ON)).toEqual({ 'how well you know each other': DONT_KNOW_THEM_YET });
  });
});
