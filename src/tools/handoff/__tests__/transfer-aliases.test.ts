/**
 * Teammate names as speech-to-text hears them in a transfer request. Prod
 * 2026-10-18: "Can you pass me to Nayan?" arrived as "Can you pass me to 9?".
 * "9", "nine" and "Fred" are ordinary words, so they stand for a teammate only
 * as the target of a transfer, and the model is told "may be", not "is". Off
 * unless TRANSFER_NAME_ALIASES is on; never on a turn with crisis guidance.
 */
import { ReadableStream } from 'node:stream/web';
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TEAM_MEMBERS } from '../../../services/team-unlocks.js';
import { gatedReply } from '../../../agents/personas/crisis-gate.js';
import { withTurnReminder } from '../../../agents/personas/turn-request.js';
import { signalCrisisDecision } from '../../../agents/safety/crisis-gate-signal.js';
import { crisisGuidedTurn, unmarkCrisisTurn } from '../../../services/safety/crisis-turn-mark.js';
import { aliasesInTransfer, HEARD_IN_A_TRANSFER } from '../transfer-aliases.js';
import { createSessionStateManager } from '../../../agents/session/session-state.js';
import { createUserDataProxy } from '../../../agents/session/user-data-proxy.js';
import { handoffConsent, holdUnaskedHandoff } from '../handoff-consent.js';
import { heardTeammateNote, teammateHeardAs } from '../teammate-names.js';

const ON = { TRANSFER_NAME_ALIASES: 'on' };
const NOTE = { env: ON };

const chat = (said: string, agentSaid = 'What can I do for you?'): llm.ChatContext => {
  const ctx = new llm.ChatContext();
  ctx.addMessage({ role: 'assistant', content: agentSaid });
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
    // 911 or 988 spoken, split, or anywhere in the turn
    'connect me to nine. eleven.',
    'nine eighty-eight',
    'pass me to nine. eighty-eight.',
    'pass me to nine eighty eight',
    'I need 911, put me through to 9',
    'pass me to nine one one',
    'I called nine eight eight. Can you pass me to Fred?',
    // talk/speak/chat with nobody asking is not a transfer
    'I need to talk to Fred.',
    'You should talk to Fred.',
    'I never talk to Fred now.',
    'I really need to talk to Fred.',
  ])('"%s" asks for nobody by alias', (said) => {
    expect(aliasesInTransfer(said, ON)).toEqual([]);
  });

  it('is off after an agent line that gave 911 or 988', () => {
    const said = 'connect me to nine';
    expect(aliasesInTransfer(said, ON, 'Sure thing.')).toEqual([
      { heard: 'nine', id: 'nayan-patel' },
    ]);
    expect(aliasesInTransfer(said, ON, 'You can call or text 988 any time.')).toEqual([]);
    expect(aliasesInTransfer(said, ON, 'Please dial nine one one.')).toEqual([]);
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
    expect(heardTeammateNote('Can you pass me to 9?', NOTE)).toBe(
      '"9" may be speech-to-text for Nayan, your teammate: if they are asking to be passed to a teammate, they mean Nayan.'
    );
  });

  it('keeps the plain note for a teammate spelling, and says nothing otherwise', () => {
    expect(heardTeammateNote('Can I talk to Naya?', NOTE)).toBe(
      '"Naya" is speech-to-text for Nayan, your teammate: they mean Nayan.'
    );
    expect(heardTeammateNote('I get up at nine.', NOTE)).toBe('');
    expect(heardTeammateNote('My friend Fred called', NOTE)).toBe('');
  });

  it('never adds the "may be" note with crisis handling, with the flag off, or for a locked teammate', () => {
    expect(heardTeammateNote('Can you pass me to 9?', false)).toBe('');
    expect(heardTeammateNote('Can you pass me to 9?', { env: {} })).toBe('');
    expect(heardTeammateNote('Can I talk to Naya?', false)).toMatch(/they mean Nayan/);
    expect(heardTeammateNote('Can you pass me to 9?', { ...NOTE, locked: ['nayan-patel'] })).toBe(
      ''
    );
  });
});

describe('the turn reminder', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** What the model is sent for the caller's words; `open`: every teammate unlocked. */
  function reminderFor(words: string, open: boolean, actions: string[] = ['pass']): string {
    vi.stubEnv('TRANSFER_NAME_ALIASES', 'on');
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: words });
    const userData = {
      personaId: 'alex-chen',
      services: {
        userProfile: { id: 'u', totalConversations: 0 },
        devMode: { enabled: open, bypassUnlocks: open },
      },
    };
    const session = { userData };
    for (const action of actions) signalCrisisDecision(session, action);
    return (withTurnReminder(ctx, session).items.at(-1) as llm.ChatMessage).textContent ?? '';
  }

  it('says "9" may be Nayan only when Nayan is open to this caller', () => {
    expect(reminderFor('Can you pass me to 9?', true)).toContain(
      '"9" may be speech-to-text for Nayan'
    );
    // A new free caller: Nayan is locked, and the team line declines him.
    expect(reminderFor('Can you pass me to 9?', false)).not.toContain('may be speech-to-text');
  });

  it('never says "9" may be Nayan unless a live gate passed every turn', () => {
    for (const actions of [['guide'], [], ['replace', 'pass']]) {
      expect(reminderFor('Can you pass me to 9?', true, actions)).not.toContain('may be speech');
    }
  });
});

describe('handoffConsent hears "talk to 9" as asking for Nayan', () => {
  it('is asked for Nayan, not for Maya, when aliases may count', () => {
    expect(handoffConsent(chat('Can I talk to 9?'), 'Nayan Patel', ON)).toBe('asked');
    expect(handoffConsent(chat('Can I talk to 9?'), 'Maya Santos', ON)).toBe('none');
    expect(handoffConsent(chat('Can I talk to Fred?'), 'Ferni', ON)).toBe('asked');
    expect(handoffConsent(chat('Can I talk to 9?'), 'Nayan Patel')).toBe('none');
  });

  it('is not asked for Nayan after an agent line that gave 988', () => {
    const ctx = chat('connect me to nine', 'You can call or text 988 any time, day or night.');
    expect(handoffConsent(ctx, 'Nayan Patel', ON)).toBe('none');
  });
});

describe('never consent from an alias on a call with crisis handling', () => {
  const ENV = { HANDOFF_ASK_FIRST: 'on', TRANSFER_NAME_ALIASES: 'on' };

  /** A handoff tool's RunContext for these words, after the reply gate decided each turn. */
  const runCtx = (said: string, ...actions: Array<string | undefined>) => {
    const userData: Record<string, unknown> = {};
    const session = { userData, history: chat(said) };
    for (const action of actions) signalCrisisDecision(session, action);
    return { session, userData };
  };
  const hold = (ctx: ReturnType<typeof runCtx>) =>
    holdUnaskedHandoff(ctx, 'Nayan Patel', false, ENV);

  it('marks the call: pass clears a turn, guide and replace stick for the rest of the call', () => {
    const userData: Record<string, unknown> = {};
    const session = { userData, emit: () => true };
    expect(crisisGuidedTurn(userData)).toBe(true); // never marked: unknown counts as guided
    signalCrisisDecision(session, 'pass');
    expect(crisisGuidedTurn(userData)).toBe(false);
    unmarkCrisisTurn(userData); // the next turn, with no live gate
    expect(crisisGuidedTurn(userData)).toBe(true);
    signalCrisisDecision(session, 'pass');
    signalCrisisDecision(session, 'guide');
    expect(crisisGuidedTurn(userData)).toBe(true);
    signalCrisisDecision(session, 'pass'); // a later, calm turn
    expect(crisisGuidedTurn(userData)).toBe(true);
  });

  it('a turn with no live gate fails closed on the live userData proxy, not only a plain object', () => {
    // The live userData (user-data-proxy.ts) has no deleteProperty trap: a `delete` there kept the
    // last turn's pass, so a no-gate turn read as passed (Opus verify of #2015).
    const manager = createSessionStateManager('alias-proxy', 'ferni', {});
    const userData = createUserDataProxy(manager, {}) as unknown as Record<string, unknown>;
    const session = { userData, emit: () => true };
    signalCrisisDecision(session, 'pass');
    expect(crisisGuidedTurn(userData)).toBe(false);
    signalCrisisDecision(session, undefined, 'pattern'); // the next turn: no live gate
    expect(crisisGuidedTurn(userData)).toBe(true);
  });

  it("the classifier clearing a turn leaves the pattern gate's pass standing", () => {
    const userData: Record<string, unknown> = {};
    const session = { userData, emit: () => true };
    signalCrisisDecision(session, 'pass', 'pattern');
    signalCrisisDecision(session, undefined, 'classifier'); // no crisis: no decision to add
    expect(crisisGuidedTurn(userData)).toBe(false);
  });

  it('lets "can I talk to 9?" through to Nayan on a call the gate passed', () => {
    expect(hold(runCtx('Can I talk to 9?', 'pass'))).toBeNull();
  });

  it.each(['guide', 'replace', undefined])(
    'holds it on a turn marked %s (or never marked)',
    (action) => {
      expect(hold(runCtx('Can I talk to 9?', action))?.unavailable).toBe(true);
    }
  );

  it.each(['guide', 'replace'])(
    'holds "connect me to nine" on a pass turn after a %s turn',
    (action) => {
      expect(hold(runCtx('connect me to nine', action, 'pass'))?.unavailable).toBe(true);
    }
  );

  it('still lets the real name through on a crisis turn', () => {
    expect(hold(runCtx('Can I talk to Nayan?', 'guide'))).toBeNull();
  });
});

describe('the reply gate marks the turn only when it is live', () => {
  const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
  const model = async () =>
    new ReadableStream<unknown>({
      start(controller) {
        controller.enqueue('Sure.');
        controller.close();
      },
    });
  const opener = { wrap: (stream: ReadableStream<unknown>) => stream };
  const reply = (session: { userData: unknown }, said: string, env: Record<string, string>) =>
    gatedReply(chat(said), session, model as never, opener as never, { env });

  it.each(['shadow', 'off'])(
    'a turn after a pass is unknown with CRISIS_GUARD_MODE=%s',
    async (mode) => {
      const session = { userData: {} };
      await reply(session, 'Can you pass me to 9?', LIVE);
      expect(crisisGuidedTurn(session.userData)).toBe(false);
      await reply(session, 'Can you pass me to 9?', { ...LIVE, CRISIS_GUARD_MODE: mode });
      expect(crisisGuidedTurn(session.userData)).toBe(true);
    }
  );

  it('a crisis turn keeps the call marked through later passes', async () => {
    const session = { userData: {} };
    await reply(session, 'I want to kill myself tonight', LIVE);
    await reply(session, 'connect me to nine', LIVE);
    expect(crisisGuidedTurn(session.userData)).toBe(true);
  });
});
