/**
 * Teammate names as speech-to-text hears them in a transfer request. Prod
 * 2026-10-18: "Can you pass me to Nayan?" arrived as "Can you pass me to 9?".
 * "9", "nine" and "Fred" are ordinary words, so they stand for a teammate only
 * as the target of a transfer, and the model is told "may be", not "is". Off
 * unless TRANSFER_NAME_ALIASES is on; never on a turn with crisis guidance.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TEAM_MEMBERS } from '../../../services/team-unlocks.js';
import { signalCrisisDecision } from '../../../agents/safety/crisis-gate-signal.js';
import {
  aliasesInTransfer,
  crisisGuidedTurn,
  HEARD_IN_A_TRANSFER,
} from '../../../utils/transfer-aliases.js';
import { handoffConsent, holdUnaskedHandoff } from '../handoff-consent.js';
import { heardTeammateNote, teammateHeardAs } from '../teammate-names.js';

const ON = { TRANSFER_NAME_ALIASES: 'on' };
const saved = process.env.TRANSFER_NAME_ALIASES;
beforeEach(() => {
  process.env.TRANSFER_NAME_ALIASES = 'on';
});
afterEach(() => {
  if (saved === undefined) delete process.env.TRANSFER_NAME_ALIASES;
  else process.env.TRANSFER_NAME_ALIASES = saved;
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

  it('is off unless TRANSFER_NAME_ALIASES is on', () => {
    expect(aliasesInTransfer('Can you pass me to 9?', {})).toEqual([]);
    expect(aliasesInTransfer('Can you pass me to 9?', { TRANSFER_NAME_ALIASES: 'off' })).toEqual(
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
    delete process.env.TRANSFER_NAME_ALIASES;
    expect(heardTeammateNote('Can you pass me to 9?')).toBe('');
    expect(heardTeammateNote('Can I talk to Naya?', false)).toMatch(/they mean Nayan/);
  });
});

describe('handoffConsent hears "talk to 9" as asking for Nayan', () => {
  it('is asked for Nayan, not for Maya, when aliases may count', () => {
    expect(handoffConsent(chat('Can I talk to 9?'), 'Nayan Patel', true)).toBe('asked');
    expect(handoffConsent(chat('Can I talk to 9?'), 'Maya Santos', true)).toBe('none');
    expect(handoffConsent(chat('Can I talk to Fred?'), 'Ferni', true)).toBe('asked');
    expect(handoffConsent(chat('Can I talk to 9?'), 'Nayan Patel')).toBe('none');
  });
});

describe('never consent from an alias on a turn with crisis handling', () => {
  const ASK_FIRST = 'HANDOFF_ASK_FIRST';
  const askFirst = process.env[ASK_FIRST];
  beforeEach(() => {
    process.env[ASK_FIRST] = 'on';
  });
  afterEach(() => {
    if (askFirst === undefined) delete process.env[ASK_FIRST];
    else process.env[ASK_FIRST] = askFirst;
  });

  /** A handoff tool's RunContext after the reply gate marked the turn. */
  const runCtx = (said: string, action: string | undefined) => {
    const userData: Record<string, unknown> = {};
    const session = { userData, history: chat(said) };
    signalCrisisDecision(session, action);
    return { session, userData };
  };

  it('the gate marks the turn: pass clears it, guide and replace set it, no action leaves it', () => {
    const userData: Record<string, unknown> = {};
    const session = { userData, emit: () => true };
    expect(crisisGuidedTurn(userData)).toBe(true); // never marked: unknown counts as guided
    signalCrisisDecision(session, 'pass');
    expect(crisisGuidedTurn(userData)).toBe(false);
    signalCrisisDecision(session, 'guide');
    expect(crisisGuidedTurn(userData)).toBe(true);
    signalCrisisDecision(session, undefined); // the classifier found nothing stronger
    expect(crisisGuidedTurn(userData)).toBe(true);
    signalCrisisDecision(session, 'pass'); // the next reply
    expect(crisisGuidedTurn(userData)).toBe(false);
    signalCrisisDecision(session, 'replace');
    expect(crisisGuidedTurn(userData)).toBe(true);
  });

  it('lets "can I talk to 9?" through to Nayan on a turn the gate passed', () => {
    expect(holdUnaskedHandoff(runCtx('Can I talk to 9?', 'pass'), 'Nayan Patel', false)).toBeNull();
  });

  it.each(['guide', 'replace', undefined])(
    'holds it on a turn marked %s (or never marked)',
    (action) => {
      const held = holdUnaskedHandoff(runCtx('Can I talk to 9?', action), 'Nayan Patel', false);
      expect(held?.unavailable).toBe(true);
    }
  );

  it('still lets the real name through on a crisis turn', () => {
    expect(
      holdUnaskedHandoff(runCtx('Can I talk to Nayan?', 'guide'), 'Nayan Patel', false)
    ).toBeNull();
  });
});
