/**
 * A yes that follows an offer without the teammate's name (#3755, HANDOFF_HELD_TRUTHFUL).
 *
 * On a prod call the caller asked what Alex was up to, Ferni offered to "wake him up and
 * bring him in", the caller said "Sure.", and the ask-first gate held the handoff: a yes
 * counts only when Ferni's last line said the teammate's name. Ferni then said Alex was
 * out. Who "him" is can't be read from the words ("Want to bring him in?" may be the dog),
 * so consent stays as it is and the held result asks Ferni to confirm by name instead:
 * one more turn, never a wrong transfer.
 */
import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import { handoffConsent, holdUnaskedHandoff } from '../handoff-consent.js';

type Turn = ['user' | 'assistant', string];

function chat(...turns: Turn[]): llm.ChatContext {
  const ctx = new llm.ChatContext();
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

const ON = { HANDOFF_ASK_FIRST: 'on', HANDOFF_HELD_TRUTHFUL: 'on' };
const OFF = { HANDOFF_ASK_FIRST: 'on' };
const hold = (agentName: string, env: Record<string, string>, ...turns: Turn[]) =>
  holdUnaskedHandoff({ session: { history: chat(...turns) } }, agentName, false, env);

/** The call, step by step (steps 2 and 3 verbatim). */
const STEP_1: Turn[] = [['user', "what's on the to-do list?"]];
const STEP_2: Turn[] = [
  ...STEP_1,
  ['assistant', "Let me grab Alex. He's got your whole list."],
  ['assistant', 'Actually, here it is: call the plumber, and pick up the dry cleaning.'],
  ['user', "Hey, what's Alex up to?"],
];
const PRONOUN_OFFER =
  "Well, he's probably fast asleep right now, but he's usually ready to jump in. Did you want me to wake him up and bring him in?";
const STEP_3: Turn[] = [...STEP_2, ['assistant', PRONOUN_OFFER], ['user', 'Sure.']];
const STEP_5: Turn[] = [
  ...STEP_3,
  ['assistant', "Maya's great with morning routines. Want me to bring Maya in?"],
  ['user', 'Sure.'],
];
/** With the flag on, Ferni confirms by name and the caller says yes. */
const REPAIR: Turn[] = [...STEP_3, ['assistant', 'Alex, yeah?'], ['user', 'Yeah.']];

const CONFIRM = 'Alex, yeah?';
const GENERAL = "offer once, casually, saying Alex's name, and transfer only if they say yes";
/** origin/main's held result with HANDOFF_HELD_TRUTHFUL off, verbatim. */
const MAIN_OFF = {
  unavailable: true,
  instruction:
    "Not transferred: they didn't ask for Alex. Answer them yourself, in your own words, " +
    'the way a friend would. If Alex would really help, you can mention it once, casually, ' +
    'and transfer only if they say yes.',
};

describe('the #3755 call with HANDOFF_HELD_TRUTHFUL on', () => {
  it('step 3, "Sure." to the pronoun offer, is held for Alex and asks Ferni to confirm by name', () => {
    const held = hold('Alex Chen', ON, ...STEP_3);
    expect(held).toMatchObject({ transferred: false });
    expect(held).not.toHaveProperty('unavailable');
    expect(held?.instruction).toContain(CONFIRM);
    expect(held?.instruction).toContain("your last line didn't say who");
    expect(held?.instruction).toContain('never say Alex is away, busy or unavailable');
  });

  it('after "Alex, yeah?" / "Yeah.", the yes is for Alex through the named path, not Maya', () => {
    expect(handoffConsent(chat(...REPAIR), 'Alex Chen', ON)).toBe('agreed');
    expect(handoffConsent(chat(...REPAIR), 'Maya Santos', ON)).toBe('none');
    expect(hold('Alex Chen', ON, ...REPAIR)).toBeNull();
  });

  it('step 1, held with a question, gets the general instruction, not the confirm one', () => {
    const held = hold('Alex Chen', ON, ...STEP_1);
    expect(held).toMatchObject({ transferred: false });
    expect(held?.instruction).toContain(GENERAL);
    expect(held?.instruction).not.toContain(CONFIRM);
  });

  it('steps 2 and 5 still run', () => {
    expect(hold('Alex Chen', ON, ...STEP_2)).toBeNull();
    expect(hold('Maya Santos', ON, ...STEP_5)).toBeNull();
  });
});

describe('with HANDOFF_HELD_TRUTHFUL off the call is as on origin/main', () => {
  it.each([
    ['step 1', 'Alex Chen', STEP_1, MAIN_OFF],
    ['step 2', 'Alex Chen', STEP_2, null],
    ['step 3', 'Alex Chen', STEP_3, MAIN_OFF],
    ['step 5', 'Maya Santos', STEP_5, null],
  ] as const)('%s', (_step, agentName, turns, expected) => {
    expect(hold(agentName, OFF, ...turns)).toEqual(expected);
    expect(hold(agentName, { ...OFF, HANDOFF_HELD_TRUTHFUL: 'off' }, ...turns)).toEqual(expected);
  });
});

describe('which held replies get the confirm wording (flag on)', () => {
  const after = (reply: string): Turn[] => [
    ...STEP_2,
    ['assistant', PRONOUN_OFFER],
    ['user', reply],
  ];

  it.each([
    'Sure.',
    'Yeah, go ahead.',
    'Mm-hmm.',
    "Okay, let's do that.",
    'Uh huh.',
    'Yes please.',
  ])('"%s" is a bare yes: confirm by name', (reply) => {
    expect(hold('Alex Chen', ON, ...after(reply))?.instruction).toContain(CONFIRM);
  });

  it.each([
    'Okay?',
    'Yes, 5.',
    'Thanks.',
    'Thank you.',
    'Yeah, but not now.',
    'Yes. No.',
    'Yes, read the list.',
  ])('"%s" is not: the general instruction', (reply) => {
    const instruction = hold('Alex Chen', ON, ...after(reply))?.instruction;
    expect(instruction).toContain(GENERAL);
    expect(instruction).not.toContain(CONFIRM);
  });
});

/** Some of the conversations the pronoun path read as consent in PR #3759's rounds 1 and 2. */
type Row = [label: string, agentName: string, turns: Turn[]];
const NOT_CONSENT: Row[] = [
  [
    'coworker Alex, talk to him about it',
    'Alex Chen',
    [
      ['user', 'My coworker Alex keeps taking credit for my work.'],
      ['assistant', 'That is so frustrating. Do you want to talk to him about it?'],
      ['user', 'Yeah.'],
    ],
  ],
  [
    'coworker Alex, have her (the boss) join',
    'Alex Chen',
    [
      ['user', 'My coworker Alex is presenting with me tomorrow. My boss Dana wants a dry run.'],
      ['assistant', 'Should I have her join?'],
      ['user', 'Yeah.'],
    ],
  ],
  [
    'a sister joining a trip Maya planned',
    'Maya Santos',
    [
      ['user', 'My sister wants to come to Lisbon. Maya planned the whole itinerary.'],
      ['assistant', 'Fun! Want me to have her join?'],
      ['user', 'Sure.'],
    ],
  ],
  [
    'the dog out in the rain',
    'Peter John',
    [
      ['user', 'Peter says the dog is still out in the rain.'],
      ['assistant', 'Oh no. Want to bring him in?'],
      ['user', 'Yeah.'],
    ],
  ],
  [
    'a son in the room',
    'Jordan Taylor',
    [
      ['user', 'Michael Jordan was my hero. My son is right here, he loves basketball.'],
      ['assistant', "I'd love to say hi to him. Want to bring him in?"],
      ['user', 'Sure!'],
    ],
  ],
  [
    'Maya suggested, then Alex mentioned',
    'Alex Chen',
    [
      ['assistant', 'Maya does breathing work.'],
      ['user', 'Alex was nice yesterday.'],
      ['assistant', 'Want me to bring her in?'],
      ['user', 'Sure.'],
    ],
  ],
  [
    'Alex turned down',
    'Alex Chen',
    [
      ['user', "I can't deal with Alex today. Who else is around?"],
      ['assistant', 'Someone gentle. Want me to bring her in?'],
      ['user', 'Sure.'],
    ],
  ],
];

describe("consent is origin/main's with HANDOFF_HELD_TRUTHFUL on", () => {
  it.each(NOT_CONSENT)('none: %s', (_label, agentName, turns) => {
    expect(handoffConsent(chat(...turns), agentName, ON)).toBe('none');
  });

  it('the #3755 "Sure." is still no consent to Alex: the hold asks instead', () => {
    expect(handoffConsent(chat(...STEP_3), 'Alex Chen', ON)).toBe('none');
  });
});
