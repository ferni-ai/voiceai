import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  correctionNote,
  correctionNotesFor,
  isUnearnedCorrection,
  UNEARNED_NOTE,
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

const lisbon = (): llm.ChatContext =>
  call(
    ['user', "We're finally doing it, a whole spring in Portugal."],
    ['assistant', LISBON_LINE],
    ['user', LISBON]
  );

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isUnearnedCorrection', () => {
  it.each([
    [LISBON, LISBON_LINE],
    ["Wait, Thursday, not Tuesday. It's Thursday.", 'Just the budget left, almost there.'],
    ['No, Lisbon. Not Lisburn.', 'Spring trips are the best kind.'],
    ['wait, not Tuesday — Thursday', 'Just the budget left, almost there.'],
    ['No, no, Galway - not Dublin.', 'Spring trips are the best kind.'],
  ])('takes "%s" as setting straight what Ferni never said', (said, ferni) => {
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
    // Hard news in the turn (a job lost): when in doubt, no note.
    [SISTER, BRUTAL],
    ["No, I'm not sure yet.", BRUTAL],
    ['Nah, not really.', BRUTAL],
    // About what was said: isCorrection's explicit kind.
    ["No, that's not what I meant, not the boss.", BRUTAL],
    // No version of their own beside the ruled-out word.
    ['No, not Tuesday.', 'Just the budget left, almost there.'],
    ['No, not the boss!', BRUTAL],
    // A line about how someone is, not a correction.
    ["Nah, I'm not upset. I'm relieved.", 'March is not nearly enough time.'],
    ["No, I'm fine, not upset.", BRUTAL],
    ["No, I'm happy here, not bored.", BRUTAL],
    ['No, not anyone. Just us.', BRUTAL],
  ])('does not take "%s" (after "%s")', (said, ferni) => {
    expect(isUnearnedCorrection(said, [ferni])).toBe(false);
  });
});

describe("isUnearnedCorrection over more than one of Ferni's lines", () => {
  it('Ferni said the ruled-out word before his last line: the miss is his, no note', () => {
    const ferni = ['Lisburn is lovely in spring.', 'What a massive, beautiful chapter.'];
    expect(isUnearnedCorrection('No, Lisbon. Not Lisburn.', ferni)).toBe(false);
    expect(isUnearnedCorrection('No, Lisbon. Not Lisburn.', ferni.slice(-1))).toBe(true);
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
        ['assistant', 'That sounds frightening. Are you somewhere safe right now?'],
        ['user', 'No, my stepdad, not my dad.']
      )
    );
    expect(reply).not.toContain(UNEARNED_NOTE);
    expect(
      isUnearnedCorrection('No, my stepdad, not my dad.', ['Are you somewhere safe right now?'])
    ).toBe(true);
  });

  it('on, with "tired" or "can\'t" in the turn: no note', () => {
    expect(isUnearnedCorrection("No, Thursday, not Tuesday. I'm so tired.", [SETTLED])).toBe(false);
    expect(isUnearnedCorrection("No, Thursday, not Tuesday. I can't do Tuesday.", [SETTLED])).toBe(
      false
    );
  });
});

describe('REPAIR_UNEARNED in the turn reminder', () => {
  it('on: the reply after an unearned correction is told not to take the blame', () => {
    vi.stubEnv('REPAIR_UNEARNED', 'on');
    expect(sent(lisbon())).toContain(UNEARNED_NOTE);
  });

  it.each([
    ['No, Lisbon. Not Lisburn.', 'Spring trips are the best kind.'],
    ['wait, not Tuesday — Thursday', 'Just the budget left, almost there.'],
  ])('on: "%s" (Ferni never said it) gets the note', (said, ferni) => {
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
