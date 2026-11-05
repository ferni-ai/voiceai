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

const sister = (): llm.ChatContext =>
  call(
    ['user', 'So my sister went to have it out with her boss today and she got fired.'],
    ['assistant', BRUTAL],
    ['user', SISTER]
  );

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isUnearnedCorrection', () => {
  it.each([
    [SISTER, BRUTAL],
    [LISBON, LISBON_LINE],
    ["Nah, I'm not upset. I'm relieved.", 'March is not nearly enough time.'],
    ["Wait, Thursday, not Tuesday. It's Thursday.", 'Just the budget left, almost there.'],
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
    ["No, I'm not sure yet.", BRUTAL],
    ['Nah, not really.', BRUTAL],
    // About what was said: isCorrection's explicit kind.
    ["No, that's not what I meant, not the boss.", BRUTAL],
  ])('does not take "%s" (after "%s")', (said, ferni) => {
    expect(isUnearnedCorrection(said, [ferni])).toBe(false);
  });
});

describe('REPAIR_UNEARNED in the turn reminder', () => {
  it('on: the reply after an unearned correction is told not to take the blame', () => {
    vi.stubEnv('REPAIR_UNEARNED', 'on');
    expect(sent(sister())).toContain(UNEARNED_NOTE);
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
    expect(sent(sister())).toContain(UNEARNED_NOTE);
  });

  it('off (unset or "off"): no note, and REPAIR_MODE alone returns exactly what it did', () => {
    expect(correctionNotesFor(sister(), {})).toBe('');
    vi.stubEnv('REPAIR_UNEARNED', 'off');
    expect(correctionNotesFor(sister(), {})).toBe('');
    vi.stubEnv('REPAIR_MODE', 'on');
    expect(correctionNotesFor(sister(), {})).toBe('');
    const galway = call(
      ['assistant', 'Dublin has that kind of grit to it.'],
      ['user', 'No, Galway, not Dublin.']
    );
    expect(correctionNotesFor(galway, {})).toBe(correctionNote('No, Galway, not Dublin.'));
    expect(sent(sister())).not.toContain(UNEARNED_NOTE);
  });
});
