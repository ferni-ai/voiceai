/**
 * A yes to an offer Ferni made by pronoun (#3755, HANDOFF_HELD_TRUTHFUL).
 *
 * On a prod call the caller asked what Alex was up to, Ferni offered to "wake him up
 * and bring him in", the caller said "Sure.", and the ask-first gate held the handoff:
 * a yes counted only when Ferni's last line said the teammate's name. A minute later
 * Ferni offered Maya by name, the same "Sure" passed, and that handoff ran.
 *
 * The pronoun path is strict by design: a wrong transfer is worse than Ferni asking once
 * more by name. The 'none' table is the verifier's over-matching probes on PR #3759.
 */
import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import { handoffConsent, holdUnaskedHandoff } from '../handoff-consent.js';

type Turn = ['user' | 'assistant' | 'tool', string];

let calls = 0;
function chat(...turns: Turn[]): llm.ChatContext {
  const ctx = new llm.ChatContext();
  for (const [role, content] of turns) {
    if (role !== 'tool') {
      ctx.addMessage({ role, content });
      continue;
    }
    const callId = `c${calls++}`;
    ctx.items.push(llm.FunctionCall.create({ callId, name: content, args: '{}' }));
    ctx.items.push(llm.FunctionCallOutput.create({ callId, output: 'ok', isError: false }));
  }
  return ctx;
}

const ON = { HANDOFF_HELD_TRUTHFUL: 'on' };

/** Steps 2 and 3 of the call, verbatim */
const ASKED_ABOUT_ALEX: Turn = ['user', "Hey, what's Alex up to?"];
const PRONOUN_OFFER: Turn = [
  'assistant',
  "Well, he's probably fast asleep right now, but he's usually ready to jump in. Did you want me to wake him up and bring him in?",
];
const SURE: Turn = ['user', 'Sure.'];
const GO_AHEAD: Turn = ['user', 'Yeah, go ahead.'];
const STEP_1: Turn[] = [
  ['user', "what's on the to-do list?"],
  ['assistant', "Let me grab Alex. He's got your whole list."],
  ['assistant', 'Actually, here it is: call the plumber, and pick up the dry cleaning.'],
];

const theCall = (...before: Turn[]) => chat(...before, ASKED_ABOUT_ALEX, PRONOUN_OFFER, SURE);
const askedThen = (offer: string, yes: Turn = SURE, asked = ASKED_ABOUT_ALEX): Turn[] => [
  asked,
  ['assistant', offer],
  yes,
];
const askedMaya: Turn = ['user', "Is Maya around? I'm stuck on my morning routine."];

type Row = [label: string, agentName: string, turns: Turn[]];

const AGREED: Row[] = [
  ['the #3755 call, verbatim', 'Alex Chen', [ASKED_ABOUT_ALEX, PRONOUN_OFFER, SURE]],
  [
    'the call with step 1 before it',
    'Alex Chen',
    [...STEP_1, ASKED_ABOUT_ALEX, PRONOUN_OFFER, SURE],
  ],
  ['the call, "Yeah, go ahead."', 'Alex Chen', askedThen(PRONOUN_OFFER[1], GO_AHEAD)],
  ['the call, "Yes please."', 'Alex Chen', askedThen(PRONOUN_OFFER[1], ['user', 'Yes please.'])],
  ['the call, "Okay, do it."', 'Alex Chen', askedThen(PRONOUN_OFFER[1], ['user', 'Okay, do it.'])],
  [
    'the call, "Um, sounds good."',
    'Alex Chen',
    askedThen(PRONOUN_OFFER[1], ['user', 'Um, sounds good.']),
  ],
  ['"Want me to grab him?"', 'Alex Chen', askedThen('Want me to grab him?')],
  ['"Should I get him?"', 'Alex Chen', askedThen("He's around. Should I get him?", GO_AHEAD)],
  ['"I can put you through to him."', 'Alex Chen', askedThen('I can put you through to him.')],
  [
    '"Want me to connect you with her?"',
    'Maya Santos',
    askedThen('Want me to connect you with her?', SURE, askedMaya),
  ],
  ['"Want to talk to him?"', 'Alex Chen', askedThen('Want to talk to him?', GO_AHEAD)],
  ['"Should I pull him in?"', 'Alex Chen', askedThen('Should I pull him in?')],
  [
    '"Want me to see if she\'s free?"',
    'Maya Santos',
    askedThen("Want me to see if she's free?", GO_AHEAD, askedMaya),
  ],
  [
    'the caller also says "Ferni"',
    'Alex Chen',
    askedThen(PRONOUN_OFFER[1], SURE, ['user', "Ferni, what's Alex up to?"]),
  ],
  [
    'tool calls in between',
    'Alex Chen',
    [ASKED_ABOUT_ALEX, ['tool', 'getTeamStatus'], PRONOUN_OFFER, ['tool', 'noop'], SURE],
  ],
  [
    'several Ferni lines since the caller named Alex',
    'Alex Chen',
    [
      ASKED_ABOUT_ALEX,
      ['assistant', 'Hmm.'],
      ['assistant', 'Let me think.'],
      ['assistant', "He's asleep."],
      ['assistant', 'Want me to wake him?'],
      SURE,
    ],
  ],
  [
    'an empty Ferni item before the offer',
    'Alex Chen',
    [ASKED_ABOUT_ALEX, ['assistant', ''], PRONOUN_OFFER, SURE],
  ],
  [
    'the yes split over two messages',
    'Alex Chen',
    [ASKED_ABOUT_ALEX, PRONOUN_OFFER, SURE, ['user', 'Go for it.']],
  ],
];

const NONE: Row[] = [
  // Not a bare yes
  [
    '"Okay so anyway, about my mom."',
    'Alex Chen',
    askedThen(PRONOUN_OFFER[1], ['user', 'Okay so anyway, about my mom.']),
  ],
  [
    '"Yeah, he\'s great. Anyway, my mom\'s in the hospital."',
    'Alex Chen',
    askedThen(PRONOUN_OFFER[1], ['user', "Yeah, he's great. Anyway, my mom's in the hospital."]),
  ],
  [
    '"Yes, read the list."',
    'Alex Chen',
    askedThen(PRONOUN_OFFER[1], ['user', 'Yes, read the list.']),
  ],
  [
    '"Sure, let\'s keep chatting."',
    'Alex Chen',
    askedThen(PRONOUN_OFFER[1], ['user', "Sure, let's keep chatting."]),
  ],
  [
    '"Okay, um, my sister."',
    'Alex Chen',
    askedThen(PRONOUN_OFFER[1], ['user', 'Okay, um, my sister.']),
  ],
  ['"Yeah, my budget."', 'Alex Chen', askedThen(PRONOUN_OFFER[1], ['user', 'Yeah, my budget.'])],
  ['"Sure, but not now"', 'Alex Chen', askedThen(PRONOUN_OFFER[1], ['user', 'Sure, but not now'])],
  // The offer has an alternative
  [
    '"... Or should I just read you the list?"',
    'Alex Chen',
    askedThen('Want me to bring him in? Or should I just read you the list?'),
  ],
  [
    '"I can bring him in, or I can just read it to you."',
    'Alex Chen',
    askedThen('I can bring him in, or I can just read it to you.'),
  ],
  [
    '"... or should we keep chatting?"',
    'Alex Chen',
    askedThen('Want me to bring him in, or should we keep chatting?'),
  ],
  // No offer, or no transfer phrase
  ['"He\'s probably asleep."', 'Alex Chen', askedThen("He's probably asleep.", ['user', 'Okay'])],
  [
    '"I\'d hate to wake him. What\'s on your mind?"',
    'Alex Chen',
    askedThen("Probably asleep, and I'd hate to wake him. What's on your mind?", ['user', 'Okay.']),
  ],
  [
    '"I couldn\'t get him on the line earlier."',
    'Alex Chen',
    askedThen("I couldn't get him on the line earlier. Anything I can help with?", [
      'user',
      'Yeah.',
    ]),
  ],
  [
    '"put them on your calendar" (the #3755 step-1 context)',
    'Alex Chen',
    [
      ...STEP_1.slice(0, 2),
      [
        'assistant',
        'Actually, here it is: call the plumber and pick up the dry cleaning. Want me to put them on your calendar?',
      ],
      SURE,
    ],
  ],
  [
    '"get him on the calendar" (her brother)',
    'Alex Chen',
    askedThen('Sorry to hear that. Want me to get him on the calendar for a check-in call?', SURE, [
      'user',
      "Alex sorted my list. My brother's been sick though.",
    ]),
  ],
  [
    '"call him" (his brother)',
    'Alex Chen',
    askedThen("How's your brother doing? Want me to call him?", SURE, [
      'user',
      'Alex reminded me my brother is in town.',
    ]),
  ],
  [
    '"get her on it"',
    'Maya Santos',
    askedThen('She would love that. Want me to get her on it for next week?', SURE, [
      'user',
      'Maya said she would build me a sleep routine.',
    ]),
  ],
  [
    '"loop him in on the details"',
    'Alex Chen',
    askedThen(
      "Got it. I'll loop him in on the details later, okay?",
      ['user', 'Okay.'],
      ['user', 'I moved the dentist to Friday. Alex will want to know.']
    ),
  ],
  [
    '"Should I let her know you called?"',
    'Maya Santos',
    askedThen('Should I let her know you called?', SURE, [
      'user',
      'I left Maya a voicemail this morning.',
    ]),
  ],
  [
    '"ask him and tell you what he says"',
    'Alex Chen',
    askedThen('Want me to ask him and tell you what he says?'),
  ],
  [
    '"pass that along to him"',
    'Alex Chen',
    askedThen(
      'Want me to pass that along to him?',
      ['user', 'Yes please.'],
      ['user', 'tell Alex thanks for the list.']
    ),
  ],
  [
    '"put them in your list" (errands)',
    'Alex Chen',
    askedThen(
      'Smart. Want me to put them in your list?',
      ['user', 'Yes.'],
      ['user', 'Alex said I should write down my errands. Groceries and the bank.']
    ),
  ],
  [
    '"get them on the guest list" (kids)',
    'Jordan Taylor',
    askedThen(
      'Fun. Want me to get them on the guest list?',
      ['user', 'Yeah.'],
      ['user', 'Jordan helped plan the reunion. The kids are coming too.']
    ),
  ],
  [
    '"loop her in on the plans" (Jordan the country)',
    'Jordan Taylor',
    askedThen(
      'Exciting! Want me to loop her in on the plans?',
      ['user', 'Yes.'],
      ['user', "We're flying to Jordan next week. My sister is coming."]
    ),
  ],
  [
    '"put him on your calendar" (son John)',
    'Peter John',
    askedThen('That will be lovely. Want me to put him on your calendar?', SURE, [
      'user',
      'My son John is visiting this weekend.',
    ]),
  ],
  [
    '"put him on your list" (coworker Alex)',
    'Alex Chen',
    askedThen(
      'Ugh. Want me to put him on your list of things to raise with your boss?',
      ['user', 'Yeah.'],
      ['user', 'My coworker Alex keeps taking credit for my work.']
    ),
  ],
  [
    '"get him on your calendar" (buddy Pete)',
    'Peter John',
    askedThen('Big move. Want me to get him on your calendar for a goodbye dinner?', SURE, [
      'user',
      'My buddy Pete is moving to Denver.',
    ]),
  ],
  // Who the pronoun is
  [
    '"Alexa" does not name Alex',
    'Alex Chen',
    askedThen('Want me to bring him in?', SURE, ['user', 'Alexa keeps mishearing me.']),
  ],
  [
    'two teammates named',
    'Alex Chen',
    askedThen('Either would be great with that. Want me to bring them in?', SURE, [
      'user',
      'Who could help me plan the move, Alex or Maya?',
    ]),
  ],
  [
    'two teammates named (for Maya)',
    'Maya Santos',
    askedThen('Either would be great with that. Want me to bring them in?', SURE, [
      'user',
      'Who could help me plan the move, Alex or Maya?',
    ]),
  ],
  [
    'an offer of Maya after the call (step 5), for Alex',
    'Alex Chen',
    [
      ASKED_ABOUT_ALEX,
      PRONOUN_OFFER,
      ['user', 'Hmm.'],
      ['assistant', "Maya's around though, and she's great with this. I can bring her in."],
      SURE,
    ],
  ],
  [
    "Alex named before the caller's last turn only",
    'Alex Chen',
    [
      ['user', 'Alex is the best.'],
      ['assistant', 'He is.'],
      ['user', 'Anyway.'],
      ['assistant', 'Want me to bring him in?'],
      SURE,
    ],
  ],
  [
    'a brother, Alex named long ago',
    'Alex Chen',
    [
      ASKED_ABOUT_ALEX,
      ['assistant', "He's around somewhere. How was the trip?"],
      ['user', 'Long. My brother picked me up.'],
      ['assistant', 'That was kind of him. Want me to bring him in?'],
      SURE,
    ],
  ],
  // Turned down
  [
    '"I don\'t want to talk to Alex right now.", then a plain offer',
    'Alex Chen',
    askedThen(
      'Fair enough. I can bring him in.',
      ['user', 'Okay.'],
      ['user', "I don't want to talk to Alex right now."]
    ),
  ],
  [
    '"I don\'t want to talk to Alex right now."',
    'Alex Chen',
    askedThen(
      "That's fine. I can bring him in later if you change your mind.",
      ['user', 'Okay.'],
      ['user', "I don't want to talk to Alex right now."]
    ),
  ],
  [
    '"Not Alex, he talks too much."',
    'Alex Chen',
    askedThen('Fair. I could bring her in, she is calmer.', SURE, [
      'user',
      'Not Alex, he talks too much. Who else?',
    ]),
  ],
];

describe('with HANDOFF_HELD_TRUTHFUL on, a pronoun offer of the one teammate just named', () => {
  it.each(AGREED)('agreed: %s', (_label, agentName, turns) => {
    expect(handoffConsent(chat(...turns), agentName, ON)).toBe('agreed');
  });

  it.each(NONE)('none: %s', (_label, agentName, turns) => {
    expect(handoffConsent(chat(...turns), agentName, ON)).toBe('none');
  });

  it('the call agrees to Alex and not to Maya', () => {
    expect(handoffConsent(theCall(), 'Maya Santos', ON)).toBe('none');
  });
});

describe('with HANDOFF_HELD_TRUTHFUL off', () => {
  it('the yes does not count, as on the call', () => {
    expect(handoffConsent(theCall(), 'Alex Chen', {})).toBe('none');
    expect(handoffConsent(theCall(), 'Alex Chen', { HANDOFF_HELD_TRUTHFUL: 'off' })).toBe('none');
  });
});

describe('holdUnaskedHandoff on the call', () => {
  it('lets the handoff to Alex run with HANDOFF_ASK_FIRST and HANDOFF_HELD_TRUTHFUL on', () => {
    const runCtx = { session: { history: theCall() } };
    const env = { HANDOFF_ASK_FIRST: 'on', HANDOFF_HELD_TRUTHFUL: 'on' };
    expect(holdUnaskedHandoff(runCtx, 'Alex Chen', false, env)).toBeNull();
  });

  it('still holds it with HANDOFF_HELD_TRUTHFUL off, as on the call', () => {
    const runCtx = { session: { history: theCall() } };
    expect(holdUnaskedHandoff(runCtx, 'Alex Chen', false, { HANDOFF_ASK_FIRST: 'on' })).toEqual(
      expect.objectContaining({ unavailable: true })
    );
  });

  it('when held with the flag on, tells Ferni to say the name if he offers', () => {
    const runCtx = {
      session: { history: chat(['assistant', 'Hey Sam, up late?'], ['user', 'yeah']) },
    };
    const env = { HANDOFF_ASK_FIRST: 'on', HANDOFF_HELD_TRUTHFUL: 'on' };
    expect(holdUnaskedHandoff(runCtx, 'Alex Chen', false, env)?.instruction).toContain(
      "offer once, casually, saying Alex's name, and transfer only if they say yes"
    );
  });
});
