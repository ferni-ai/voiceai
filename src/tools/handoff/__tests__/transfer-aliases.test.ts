/**
 * Teammate names as speech-to-text hears them in a transfer request. Prod
 * 2026-10-18: "Can you pass me to Nayan?" arrived as "Can you pass me to 9?".
 * "9", "nine" and "Fred" are ordinary words, so they stand for a teammate only
 * as the target of a transfer, and the model is told "may be", not "is". Off
 * unless CRISIS_TRANSFER_EVERYDAY is on; never on a turn with crisis guidance.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TEAM_MEMBERS } from '../../../services/team-unlocks.js';
import { aliasesInTransfer, HEARD_IN_A_TRANSFER } from '../../../utils/transfer-aliases.js';
import { handoffConsent } from '../handoff-consent.js';
import { heardTeammateNote, teammateHeardAs } from '../teammate-names.js';

const ON = { CRISIS_TRANSFER_EVERYDAY: 'on' };
const saved = process.env.CRISIS_TRANSFER_EVERYDAY;
beforeEach(() => {
  process.env.CRISIS_TRANSFER_EVERYDAY = 'on';
});
afterEach(() => {
  if (saved === undefined) delete process.env.CRISIS_TRANSFER_EVERYDAY;
  else process.env.CRISIS_TRANSFER_EVERYDAY = saved;
});

const chat = (said: string): llm.ChatContext => {
  const ctx = new llm.ChatContext();
  ctx.addMessage({ role: 'assistant', content: 'What can I do for you?' });
  ctx.addMessage({ role: 'user', content: said });
  return ctx;
};

describe('HEARD_IN_A_TRANSFER', () => {
  it.each([
    ['nine', 'nayan-patel'],
    ['9', 'nayan-patel'],
    ['fred', 'ferni'],
    ['freddy', 'ferni'],
    ['fern', 'ferni'],
    ['fernie', 'ferni'],
  ])('"%s" may be %s', (heard, id) => {
    expect(HEARD_IN_A_TRANSFER[heard]).toBe(id);
  });

  it('names only real teammates', () => {
    const ids = new Set(TEAM_MEMBERS.map((m) => m.memberId as string));
    for (const id of Object.values(HEARD_IN_A_TRANSFER)) expect(ids.has(id), id).toBe(true);
  });

  it('never makes an ordinary word a teammate outside a transfer', () => {
    expect(teammateHeardAs('nine')).toBeNull();
    expect(teammateHeardAs('9')).toBeNull();
    expect(teammateHeardAs('Fred')).toBeNull();
  });
});

describe('aliasesInTransfer', () => {
  it.each([
    ['Can you pass me to 9?', '9', 'nayan-patel'],
    ['Transfer me to 9.', '9', 'nayan-patel'],
    ['transfer me to nine please', 'nine', 'nayan-patel'],
    ['can you put me through to 9 now', '9', 'nayan-patel'],
    ['Can I talk to Fred?', 'fred', 'ferni'],
    ['switch me back to Fernie', 'fernie', 'ferni'],
  ])('"%s" asks for %s (%s)', (said, heard, id) => {
    expect(aliasesInTransfer(said, ON)).toEqual([{ heard, id }]);
  });

  it.each([
    'I get up at nine.',
    'pass me to 988',
    'transfer me to 9 1 1',
    'switch to 9',
    'turn it up to 9',
    'My friend Fred called',
    'Fred and I talked about it',
    'talk to Fred about the car',
    'transfer me to Nayan',
    'pass me to nine. one one',
    'transfer me to 9, 1 1',
    'can you pass me to nine? eight eight',
    'pass me to 9. 911',
  ])('"%s" asks for nobody by alias', (said) => {
    expect(aliasesInTransfer(said, ON)).toEqual([]);
  });

  it('is off unless CRISIS_TRANSFER_EVERYDAY is on', () => {
    expect(aliasesInTransfer('Can you pass me to 9?', {})).toEqual([]);
    expect(aliasesInTransfer('Can you pass me to 9?', { CRISIS_TRANSFER_EVERYDAY: 'off' })).toEqual(
      []
    );
  });
});

describe('heardTeammateNote', () => {
  it('says "9" may be Nayan in a transfer request (the prod call)', () => {
    expect(heardTeammateNote('Can you pass me to 9?')).toBe(
      '"9" may be speech-to-text for Nayan, your teammate: if they are asking to be passed to a teammate, they mean Nayan.'
    );
  });

  it('keeps the plain note for a teammate spelling, and says nothing otherwise', () => {
    expect(heardTeammateNote('Can I talk to Naya?')).toBe(
      '"Naya" is speech-to-text for Nayan, your teammate: they mean Nayan.'
    );
    expect(heardTeammateNote('I get up at nine.')).toBe('');
    expect(heardTeammateNote('My friend Fred called')).toBe('');
  });

  it('never adds the "may be" note on a turn with crisis guidance, or with the flag off', () => {
    expect(heardTeammateNote('Can you pass me to 9?', false)).toBe('');
    delete process.env.CRISIS_TRANSFER_EVERYDAY;
    expect(heardTeammateNote('Can you pass me to 9?')).toBe('');
    expect(heardTeammateNote('Can I talk to Naya?', false)).toMatch(/they mean Nayan/);
  });
});

describe('handoffConsent hears "talk to 9" as asking for Nayan', () => {
  it('is asked for Nayan, not for Maya', () => {
    expect(handoffConsent(chat('Can I talk to 9?'), 'Nayan Patel')).toBe('asked');
    expect(handoffConsent(chat('Can I talk to 9?'), 'Maya Santos')).toBe('none');
    expect(handoffConsent(chat('Can I talk to Fred?'), 'Ferni')).toBe('asked');
  });
});
