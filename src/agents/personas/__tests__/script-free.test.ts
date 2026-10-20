/**
 * SCRIPT_FREE_REMINDER: the per-turn reminder keeps what is about this caller,
 * this moment, the facts and safety, and drops the shared style and every quoted
 * example. Off (the default) the reminder is byte for byte what it was; a crisis
 * turn (shape: false) is the same with the flag on.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { correctionNote } from '../correction-repair.js';
import { FIRST_CALL_NOTE, nameSwapPlain } from '../first-call-rapport.js';
import { happyExitFor } from '../happy-exits.js';
import { repairNote } from '../repair-check.js';
import { roomNote } from '../room-guests.js';
import { SCRIPT_FREE_BASE } from '../script-free.js';
import { CANDOR, CANDOR_PLAIN } from '../turn-candor.js';
import { withTurnReminder } from '../turn-request.js';
import { LOOKUP, LOOKUP_FOLLOW_UP, ROUGH_FORMS } from '../turn-shape.js';
import { chiefOfStaffNote } from '../../../tools/handoff/chief-of-staff-note.js';

const TEAM = ['ferni', 'alex-chen', 'peter-john', 'maya-santos', 'jordan-taylor', 'nayan-patel'];
const NAMES: Record<string, string> = {
  ferni: 'Ferni',
  'alex-chen': 'Alex',
  'peter-john': 'Peter',
  'maya-santos': 'Maya',
  'jordan-taylor': 'Jordan',
  'nayan-patel': 'Nayan',
};

/** The reminder-bearing flags as prod has them (voiceai-evidence prod-persona-flags.json, 2026-10-18). */
const PROD: Record<string, string> = {
  TURN_SHAPE: 'on',
  TURN_STYLE_REMINDER: 'on',
  CANDOR: 'on',
  THINK_ALOUD: 'on',
  ASK_ADVICE: 'on',
  HUMAN_TEXTURE: 'on',
  LAUGH_ALONG: 'on',
  FERNI_STATE: 'on',
  FIRST_CALL_RAPPORT: 'on',
  TEAMMATE_IDENTITY_NOTE: 'on',
  LIVE_DATA_CARRYOVER: 'on',
};

const LINES = [
  'I got the job!!',
  'ugh. long day.',
  'how was your weekend?',
  'haha my dog just ate my sock',
  'can you help me plan a birthday dinner for my wife?',
  "what's the weather like in Denver?",
  'yeah',
  "I'm going to quit tomorrow and tell my boss off, good idea, right?",
  'my sister is pregnant!',
  'I made pasta and it was honestly okay',
];

/** What withTurnReminder appended to the caller's turn. */
function reminderFor(
  personaId: string,
  turns: string[],
  { shape, firstCall }: { shape?: boolean; firstCall?: boolean } = {}
): string {
  // Parts of the reminder are drawn at random per call; pin the draw so two builds compare.
  vi.spyOn(Math, 'random').mockReturnValue(0.42);
  const ctx = llm.ChatContext.empty();
  turns.forEach((text, i) => ctx.addMessage({ role: i % 2 ? 'assistant' : 'user', content: text }));
  const userData = {
    userId: 'script-free-test',
    personaId,
    ...(firstCall && { isReturningUser: false }),
  };
  const out = withTurnReminder(ctx, { userData }, shape === undefined ? {} : { shape });
  const last = out.items[out.items.length - 1] as llm.ChatMessage;
  const parts = last.content.filter((c): c is string => typeof c === 'string');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

const REMOVED = [
  ...ROUGH_FORMS,
  'hm, let me think',
  'okay, so',
  '"um"',
  'what to cook tonight',
  'repaint a room',
  "I'm Ferni, by the way",
  'Talk like a close friend',
  'Start with the substance',
  'Sound spoken, not written',
  'How long and what kind of reply',
  'Most replies are a sentence or two',
  'No question this time',
  'You may ask one question',
  'Have a view of your own',
  'laugh with them',
  'Somewhere you would genuinely pause',
  'Work it out aloud',
  'If something from your own life comes to mind',
];

beforeEach(() => {
  for (const [k, v] of Object.entries(PROD)) vi.stubEnv(k, v);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('SCRIPT_FREE_REMINDER off', () => {
  it('the reminder is what it was without the flag, for every persona and line', () => {
    for (const persona of TEAM) {
      for (const line of LINES) {
        for (const firstCall of [false, true]) {
          vi.stubEnv('SCRIPT_FREE_REMINDER', '');
          const unset = reminderFor(persona, [line], { firstCall });
          vi.stubEnv('SCRIPT_FREE_REMINDER', 'off');
          expect(reminderFor(persona, [line], { firstCall }), `${persona}: ${line}`).toBe(unset);
          expect(unset).toContain('Talk like a close friend');
        }
      }
    }
  });
});

describe('SCRIPT_FREE_REMINDER on', () => {
  beforeEach(() => vi.stubEnv('SCRIPT_FREE_REMINDER', 'on'));

  it('quotes nothing and carries none of the shared style, for every persona and line', () => {
    for (const persona of TEAM) {
      for (const line of LINES) {
        for (const firstCall of [false, true]) {
          const reminder = reminderFor(persona, [line], { firstCall });
          expect(reminder, `${persona}: ${line}`).toContain(SCRIPT_FREE_BASE);
          expect(reminder, `${persona}: ${line}`).not.toMatch(/["“”]/);
          for (const phrase of REMOVED)
            expect(reminder, `${persona}: ${line} carries ${phrase}`).not.toContain(phrase);
        }
      }
    }
  });

  it('a crisis turn (shape: false) is unchanged', () => {
    for (const persona of TEAM) {
      const on = reminderFor(persona, ['I want to end it all'], { shape: false, firstCall: true });
      vi.stubEnv('SCRIPT_FREE_REMINDER', 'off');
      const off = reminderFor(persona, ['I want to end it all'], { shape: false, firstCall: true });
      vi.stubEnv('SCRIPT_FREE_REMINDER', 'on');
      expect(on, persona).toBe(off);
      expect(on, persona).toContain('Keep it short, like a friend on a call');
    }
  });

  it('keeps the look-up rule, and carries it to the answer of "which city?"', () => {
    expect(reminderFor('maya-santos', ["what's the weather like in Denver?"])).toContain(LOOKUP);
    const carried = reminderFor('maya-santos', [
      'can you check the weather?',
      'Which city?',
      'Denver.',
    ]);
    expect(carried).toContain(LOOKUP_FOLLOW_UP);
  });

  it('keeps candor, unquoted, and the want-a-yes line', () => {
    const plain = reminderFor('peter-john', ['I made pasta and it was honestly okay']);
    expect(plain).toContain(CANDOR_PLAIN);
    expect(plain).not.toContain(CANDOR);
    const yes = reminderFor('peter-john', [
      "I'm going to quit and tell my boss off, good idea, right?",
    ]);
    expect(yes).toContain('They want you to agree.');
  });

  it('keeps who is speaking and the handoff rule', () => {
    const reminder = reminderFor('alex-chen', ['yeah']);
    expect(reminder).toContain('You are Alex.');
    expect(reminder).toContain("call that teammate's handoff tool in this reply");
  });

  it('keeps a question about the persona and the first-call note, in the speaker’s own name', () => {
    expect(reminderFor('jordan-taylor', ['how was your weekend?'])).toContain(
      'They asked about you'
    );
    for (const persona of TEAM) {
      const reminder = reminderFor(persona, ['hi there'], { firstCall: true });
      expect(reminder, persona).toContain(FIRST_CALL_NOTE);
      expect(reminder, persona).toContain(nameSwapPlain(NAMES[persona]));
      if (persona !== 'ferni') expect(reminder, persona).not.toContain('Ferni, then');
    }
  });
});

describe('script-free notes outside the shape (flags off in prod)', () => {
  it('keep what the caller said and drop the line to say', () => {
    expect(correctionNote('no, it was Tuesday', false, true)).toBe(
      'They just corrected you ("no, it was Tuesday"). Own it in one short line, then go on with what they said. Don\'t argue, explain why, or repeat your old version.'
    );
    expect(correctionNote('no, it was Tuesday')).toContain('("Ah, my mistake.")');
    // FRIEND_REPAIR=on with it: still names the miss, without its quoted lines.
    const friend = correctionNote('no, it was Tuesday', true, true);
    expect(friend).toContain('names what you had wrong, light if they are, plain if not,');
    expect(friend.replace('"no, it was Tuesday"', '')).not.toMatch(/["“”]/);
    expect(correctionNote('no, it was Tuesday', true)).toContain('("My mistake, your brother.")');
    const name = repairNote({ kind: 'name', heard: 'Bethany' }, true);
    expect(name).toContain('Speech-to-text heard "Bethany"');
    expect(name).not.toContain('Sorry');
    expect(repairNote({ kind: 'name', heard: 'Bethany' })).toContain('("Sorry, did you say');
    expect(roomNote(['Sam'], 'Dana', true)).not.toMatch(/["“”]/);
    expect(roomNote(['Sam'], 'Dana')).toContain('"was that you, Sam?"');
  });

  it('the goodbye names their plan in their words, with no line to say', () => {
    vi.stubEnv('HAPPY_EXITS', 'on');
    const input = {
      said: 'okay I gotta go, dinner with my sister',
      callerTurns: ['okay I gotta go, dinner with my sister'],
      careful: false,
      rng: () => 0,
    };
    const plain = happyExitFor({ ...input, scriptFree: true }).note;
    expect(plain).toContain('(their words: "dinner with my sister")');
    expect(plain).not.toContain('good, go.');
    expect(happyExitFor(input).note).toContain('("dinner with your sister, good, go.")');
  });

  it('the chief-of-staff offer has no quoted line', () => {
    vi.stubEnv('ALEX_CHIEF_OF_STAFF', 'on');
    expect(chiefOfStaffNote('ferni', 'what is on my calendar?', '', true)).not.toMatch(/["“”]/);
    expect(chiefOfStaffNote('ferni', 'what is on my calendar?')).toContain(
      '"Want me to grab Alex?'
    );
  });
});
