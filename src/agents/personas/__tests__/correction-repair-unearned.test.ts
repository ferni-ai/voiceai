import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  correctionNote,
  correctionNotesFor,
  isUnearnedCorrection,
  UNEARNED_NOTE,
  wholeTurnRuleOut,
} from '../correction-repair.js';
import { withTurnReminder } from '../turn-request.js';

/** rt-1105-ambiguous-her r1 (2026-11-05): Ferni had it right, then said "I totally misunderstood that". */
const BRUTAL = 'God, that is brutal.';
const SISTER = 'No. My sister got fired. Not the boss. The boss is fine, unfortunately.';
/** rt-1105-jordan-you-misheard p1: Jordan said Lisbon, then "my bad, not Northern Ireland". */
const LISBON_LINE = 'Lisbon in the spring, that is incredible. What a massive, beautiful chapter.';
const LISBON = "No, Lisbon. Portugal. Not Lisburn. Lisburn's in Northern Ireland, I think.";

function call(...turns: Array<['user' | 'assistant', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

const sent = (ctx: llm.ChatContext, session: object = {}): string =>
  (withTurnReminder(ctx, session).items.at(-1) as llm.ChatMessage).textContent ?? '';

/** The whole turn is the putting-straight: Ferni never said "Lisburn", so no blame to take. */
const lisbon = (): llm.ChatContext =>
  call(
    ['user', "We're finally doing it, a whole spring in Portugal."],
    ['assistant', LISBON_LINE],
    ['user', 'No, Lisbon. Not Lisburn.']
  );

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Neutral whole-turn corrections of something Ferni never said: the note fires. */
const WHOLE_TURN: Array<[string, string]> = [
  ['No, Lisbon. Not Lisburn.', 'Spring trips are the best kind.'],
  ['wait, not Tuesday — Thursday', 'Just the budget left, almost there.'],
  ['No, no, Galway - not Dublin.', 'Spring trips are the best kind.'],
  ['No, Porto, not Faro.', 'That trip sounds lovely.'],
  ['NO, FRIDAY. NOT MONDAY.', 'Sounds like a busy week.'],
  ['nope, the blue one, not the green one', 'Good choice on the car.'],
  ['No, not Oslo, Bergen.', 'Norway in winter, wow.'],
  ['No, Lisbon, not Lisburn. Lisbon.', 'Spring trips are the best kind.'],
];

describe('wholeTurnRuleOut', () => {
  it.each([
    ['No, Lisbon. Not Lisburn.', 'not lisburn'],
    ['wait, not Tuesday — Thursday', 'not tuesday'],
    ['nope, the blue one, not the green one', 'not the green one'],
    ['No, Lisbon, not Lisburn. Lisbon.', 'not lisburn'],
    ['no. not Boston - Austin.', 'not boston'],
  ])('"%s" is all correction: rules out "%s"', (said, ruledOut) => {
    expect(wholeTurnRuleOut(said)).toBe(ruledOut);
  });

  it.each([
    "No, my son, not my daughter. He's been missing since Sunday.",
    'No, the court date is Monday, not Tuesday.',
    "Wait, Thursday, not Tuesday. It's Thursday.",
    LISBON,
    'No, not Tuesday.',
    'No, Thursday.',
    'No thanks, not hungry.',
    'Nah, not a fan, but thanks.',
  ])('"%s" says more (or less) than the correction: null', (said) => {
    expect(wholeTurnRuleOut(said)).toBeNull();
  });
});

describe('isUnearnedCorrection', () => {
  it.each(WHOLE_TURN)('takes "%s" as setting straight what Ferni never said', (said, ferni) => {
    expect(isUnearnedCorrection(said, [ferni])).toBe(true);
  });

  it.each([
    // Ferni did say it, as a statement or as a guess: that miss is his (isCorrection's).
    ['No, Galway, not Dublin.', 'Dublin has that kind of grit to it.'],
    ['No, my sister, not the boss.', 'Did the boss fire her?'],
    // One of the ruled-out words is his: the miss is his to own.
    ['No, Galway. Not Dublin, not Cork.', 'Dublin has that kind of grit to it.'],
    ["No, Lisbon, not Lisburn's.", 'Lisburn is lovely in spring.'],
    // Not a putting-straight: no leading "no", or "not" only hedges.
    ['My sister got fired, not the boss.', BRUTAL],
    ['Galway, not Dublin.', BRUTAL],
    ["No, I'm not sure yet.", BRUTAL],
    ['Nah, not really.', BRUTAL],
    ['Nah, not yet. Soon.', BRUTAL],
    // The turn says more than the correction.
    [SISTER, BRUTAL],
    [LISBON, LISBON_LINE],
    ["Wait, Thursday, not Tuesday. It's Thursday.", 'Just the budget left, almost there.'],
    // About what was said: isCorrection's explicit kind.
    ["No, that's not what I meant, not the boss.", BRUTAL],
    // No version of their own beside the ruled-out word.
    ['No, not Tuesday.', 'Just the budget left, almost there.'],
    ['No, not the boss!', BRUTAL],
    // A line about how someone is, not a correction.
    ["Nah, I'm not upset. I'm relieved.", 'March is not nearly enough time.'],
    ["No, I'm fine, not upset.", BRUTAL],
    ["No, I'm happy here, not bored.", BRUTAL],
    // A pronoun is never the thing ruled out.
    ['No, not anyone. Just us.', BRUTAL],
    ['No, Sam, not him.', BRUTAL],
    // Distress, or weary words, in the turn itself.
    ['No, scared, not angry.', BRUTAL],
    ['No, tired, not lazy.', BRUTAL],
  ])('does not take "%s" (after "%s")', (said, ferni) => {
    expect(isUnearnedCorrection(said, [ferni])).toBe(false);
  });
});

describe("isUnearnedCorrection over more than one of Ferni's lines", () => {
  const LISBURN = 'Lisburn is lovely in spring.';
  const LATER = [
    'What a massive, beautiful chapter.',
    'The packing is the worst part.',
    'Spring is the best time to go.',
    'Sounds like a real plan now.',
    'You have earned this one.',
  ];

  it('Ferni said the ruled-out word before his last line: the miss is his, no note', () => {
    const ferni = [LISBURN, LATER[0]];
    expect(isUnearnedCorrection('No, Lisbon. Not Lisburn.', ferni)).toBe(false);
    expect(isUnearnedCorrection('No, Lisbon. Not Lisburn.', ferni.slice(-1))).toBe(true);
  });

  it.each([4, 5, 6])('Ferni said it %i lines back: still his, no note', (back) => {
    const ferni = [LISBURN, ...LATER.slice(0, back - 1)];
    expect(ferni).toHaveLength(back);
    expect(isUnearnedCorrection('No, Lisbon. Not Lisburn.', ferni)).toBe(false);
    expect(isUnearnedCorrection('No, Lisbon. Not Lisburn.', ferni.slice(1))).toBe(true);
  });
});

/** The red team's fictional distress turns (verify of #3491): the note never rides one. */
const DISTRESS_TURNS = [
  "No, he's not sorry. He hit me again.",
  "No, I'm not safe at home.",
  "No, I'm not doing great, my dad died last week.",
  "No, not anyone. I'm completely alone.",
  "No, I'm not okay.",
  "No, I'm not fine. Everything is falling apart.",
];
const SETTLED = 'Sounds like things have calmed down a little.';

describe('REPAIR_UNEARNED never on a turn in distress', () => {
  it.each(DISTRESS_TURNS)('on: "%s" gets no unearned-repair note', (said) => {
    vi.stubEnv('REPAIR_UNEARNED', 'on');
    expect(isUnearnedCorrection(said, [SETTLED])).toBe(false);
    const reply = sent(
      call(['user', 'Things at home are different now.'], ['assistant', SETTLED], ['user', said])
    );
    expect(reply).not.toContain(UNEARNED_NOTE);
  });

  it('on: distress in the caller\'s turn before, then a "no, X, not Y": no note', () => {
    vi.stubEnv('REPAIR_UNEARNED', 'on');
    const reply = sent(
      call(
        ['user', 'My dad hit me last night.'],
        ['assistant', 'That sounds frightening.'],
        ['user', 'No, my stepdad, not my dad.']
      )
    );
    expect(reply).not.toContain(UNEARNED_NOTE);
    expect(isUnearnedCorrection('No, my stepdad, not my dad.', ['That sounds frightening.'])).toBe(
      true
    );
  });

  it('on, with "tired" or "can\'t" in the turn: no note', () => {
    expect(isUnearnedCorrection('No, tired, not lazy.', [SETTLED])).toBe(false);
    expect(isUnearnedCorrection("No, can't, not won't.", [SETTLED])).toBe(false);
  });
});

/** The red team's fictional hard news (round-3 verify of #3491): each says more than the correction. */
const HARD_NEWS = [
  "No, my son, not my daughter. He's been missing since Sunday.",
  "No, my stepdad, not my dad. He's always screaming at us.",
  'No, my husband, not my brother. He takes my phone and checks everything.',
  "No, my mom, not my dad. She won't wake up.",
  'No, my girlfriend, not my wife. She left and took the kids.',
  "No, my brother, not my cousin. He's in jail.",
  'No, Friday, not Thursday. That is when they turn off the power.',
  'No, my landlord, not my boss. He keeps showing up at night.',
  'No, the court date is Monday, not Tuesday.',
  'No, my dad, not my uncle. He keeps yelling at me.',
  'No, my daughter, not my son. She stopped eating.',
  'No, my partner, not my roommate. He grabbed my arm.',
  "No, my grandma, not my aunt. She doesn't recognize me anymore.",
];
const GOOD_WEEK = 'Sounds like a good week.';

/** The red team's offer refusals (round-3 verify of #3491), the polite ones first. */
const OFFER = 'Want me to set that up for you?';
const POLITE = [
  'No thanks, not hungry.',
  'Nope, not interested, thanks.',
  'No, not necessary. Thanks though.',
  'No worries, not a problem.',
  'Nah, not a fan, but thanks.',
];
const REFUSALS = [
  ...POLITE,
  'Nah, not keen, maybe another time.',
  'No, not needed, I got it.',
  'Nope, not bothered, honestly.',
];

describe('REPAIR_UNEARNED never on hard news or a no to an offer', () => {
  it.each(HARD_NEWS)('on: "%s" gets no note', (said) => {
    vi.stubEnv('REPAIR_UNEARNED', 'on');
    expect(isUnearnedCorrection(said, [GOOD_WEEK])).toBe(false);
    const turn = call(['user', 'A lot happened.'], ['assistant', GOOD_WEEK], ['user', said]);
    expect(sent(turn)).not.toContain(UNEARNED_NOTE);
  });

  it.each(REFUSALS)('on: "%s" after an offer gets no note', (said) => {
    vi.stubEnv('REPAIR_UNEARNED', 'on');
    expect(isUnearnedCorrection(said, [OFFER])).toBe(false);
    expect(sent(call(['assistant', OFFER], ['user', said]))).not.toContain(UNEARNED_NOTE);
  });

  it.each(POLITE)('a polite no is never a correction, offer or not: "%s"', (said) => {
    expect(isUnearnedCorrection(said, [GOOD_WEEK])).toBe(false);
  });

  it.each([OFFER, 'Should I book it?', 'Do you want the early one?', 'Want me to set that up.'])(
    'a whole-turn "no, X, not Y" that answers "%s" gets no note',
    (ferni) => {
      expect(isUnearnedCorrection('Nah, Thursday, not Friday.', [ferni])).toBe(false);
      expect(isUnearnedCorrection('Nah, Thursday, not Friday.', [GOOD_WEEK])).toBe(true);
    }
  );
});

describe('REPAIR_UNEARNED in the turn reminder', () => {
  it('on: the reply after an unearned correction is told not to take the blame', () => {
    vi.stubEnv('REPAIR_UNEARNED', 'on');
    expect(sent(lisbon())).toContain(UNEARNED_NOTE);
  });

  it.each(WHOLE_TURN)('on: "%s" (Ferni never said it) gets the note', (said, ferni) => {
    vi.stubEnv('REPAIR_UNEARNED', 'on');
    expect(
      sent(call(['user', 'We sorted the plan.'], ['assistant', ferni], ['user', said]))
    ).toContain(UNEARNED_NOTE);
  });

  it('on, with REPAIR_MODE on: a real correction still gets the own-it note, not this one', () => {
    vi.stubEnv('REPAIR_UNEARNED', 'on');
    vi.stubEnv('REPAIR_MODE', 'on');
    const real = sent(
      call(
        ['user', "I'm off to Galway next week."],
        ['assistant', 'Dublin has that kind of grit to it.'],
        ['user', 'No, Galway, not Dublin.']
      )
    );
    expect(real).toContain('They just corrected you');
    expect(real).not.toContain(UNEARNED_NOTE);
    expect(sent(lisbon())).toContain(UNEARNED_NOTE);
  });

  it('both flags on, "No, Thursday, not Friday." after "So Tuesday is the big day.": exactly one note', () => {
    vi.stubEnv('REPAIR_UNEARNED', 'on');
    vi.stubEnv('REPAIR_MODE', 'on');
    const said = 'No, Thursday, not Friday.';
    const ferni = 'So Tuesday is the big day.';
    expect(isUnearnedCorrection(said, [ferni])).toBe(true);
    const notes = correctionNotesFor(call(['assistant', ferni], ['user', said]), {});
    expect(notes).toBe(correctionNote(said));
    expect(notes).not.toContain(UNEARNED_NOTE);
  });

  it('off (unset or "off"): no note, and REPAIR_MODE alone returns exactly what it did', () => {
    expect(correctionNotesFor(lisbon(), {})).toBe('');
    vi.stubEnv('REPAIR_UNEARNED', 'off');
    expect(correctionNotesFor(lisbon(), {})).toBe('');
    vi.stubEnv('REPAIR_MODE', 'on');
    expect(correctionNotesFor(lisbon(), {})).toBe('');
    const galway = call(
      ['assistant', 'Dublin has that kind of grit to it.'],
      ['user', 'No, Galway, not Dublin.']
    );
    expect(correctionNotesFor(galway, {})).toBe(correctionNote('No, Galway, not Dublin.'));
    expect(sent(lisbon())).not.toContain(UNEARNED_NOTE);
  });
});
