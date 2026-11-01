/**
 * Notes that replay what was said earlier in the call are not SAFE (#3091): on an unverified turn
 * they can hand the model a third party's name or an account action as agreed. The wrap-up,
 * repair, corrections, game, goodbye and Ferni's self-quotes all drop there, and the alias
 * context (the previous assistant line) is never recorded as SAFE. Every name here is made up.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fail = vi.hoisted(() => ({ identity: false }));
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
vi.mock('../call-me-note.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  callMeNote: () => {
    if (fail.identity) throw new Error('the owner check inside the call-me note failed');
    return '';
  },
}));
const CLOSE = "Close by naming what you two settled: you'd text Dana Reyes the clinic address.";
const REPAIR =
  "They said 'call her', and both Priya and Dana came up; check lightly ('Priya, right?').";
const CORRECTED = "Earlier they corrected you: it's Priya Shah's clinic, not Dana's.";
const GAME = 'Trivia score: Priya Shah 3, Dana Reyes 2.';
const SELF_QUOTE = "You said earlier: I was thinking about Robin's surgery at Harbor Point.";
const GOODBYE = "They're heading off to pick up Marisol from Pine Hollow at six; wish them luck.";
vi.mock('../wrap-up.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getWrapUp: () => ({ noteFor: () => CLOSE }),
}));
vi.mock('../repair-check.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  repairNoteFor: () => REPAIR,
}));
vi.mock('../correction-repair.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  correctionNotesFor: () => CORRECTED,
}));
vi.mock('../../../services/games/call-game-state.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  gameTurnNote: () => GAME,
}));
vi.mock('../ferni-state.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ferniStateTurn: () => ({ note: 'FERNI-STATE-NOTE', last: SELF_QUOTE }),
}));
vi.mock('../happy-exits.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  goodbyeNoteOn: () => true,
  happyExitNote: () => GOODBYE,
}));

const { withTurnReminder } = await import('../turn-request.js');
const { attempt, guardedTurn, IDENTITY, UNVERIFIED_SPEAKER_NOTE, unverifiedReminder } =
  await import('../turn-note-guard.js');
const safe = await import('../turn-notes-guarded.js');
const { unlockViewFor } = await import('../../../tools/handoff/locked-teammates.js');
const { markCrisisTurn } = await import('../../../services/safety/crisis-turn-mark.js');

let calls = 0;
// A session id, or exits-held.ts holds the wrap-up and goodbye notes.
const session = (): object => ({
  userData: { userName: 'Dana Reyes', services: { sessionId: `replay-${++calls}` } },
});
function request(agentLine = 'Hey, good to hear you.'): llm.ChatContext {
  const c = llm.ChatContext.empty();
  c.addMessage({ role: 'assistant', content: agentLine });
  c.addMessage({ role: 'user', content: 'ok, I think that is everything for today' });
  return c;
}
const text = (ctx: llm.ChatContext): string =>
  ctx.items.map((i) => (i as { textContent?: string }).textContent ?? '').join('\n');
const boom = (): string => {
  throw new Error('the identity check failed');
};

beforeEach(() => {
  fail.identity = false;
});

describe('notes that replay the call do not ride an unverified turn (#3091)', () => {
  const unverified = (): string => {
    fail.identity = true;
    const out = text(withTurnReminder(request(), session()));
    expect(out).toContain(UNVERIFIED_SPEAKER_NOTE);
    return out;
  };

  it("the wrap-up (closeLoop) doesn't replay what was settled", () => {
    expect(unverified()).not.toContain('clinic address');
  });

  it("the repair check doesn't name people from earlier lines", () => {
    expect(unverified()).not.toContain("'Priya, right?'");
  });

  it("Ferni's self-quotes (ferniState.last) drop; his state note stays", () => {
    const out = unverified();
    expect(out).not.toContain('Harbor Point');
    expect(out).toContain('FERNI-STATE-NOTE');
  });

  it("the corrections from earlier in the call don't ride", () => {
    expect(unverified()).not.toContain("Priya Shah's clinic");
  });

  it("the game's score line doesn't carry player names", () => {
    expect(unverified()).not.toContain('Trivia score');
  });

  it("the goodbye note doesn't quote their plan", () => {
    expect(unverified()).not.toContain('Marisol');
  });

  it("the alias context (the last assistant line) isn't recorded as SAFE", () => {
    const line = 'Dana Reyes asked you to call Priya at 555-0163.';
    let reminder: string | undefined;
    guardedTurn({ warn: vi.fn() } as never, 'replay-alias', llm.ChatContext.empty(), () => {
      // A turn the crisis gate passed (crisis-turn-mark.ts), so the alias context is built.
      const userData = {};
      markCrisisTurn(userData, 'pass');
      expect(
        safe.aliasNoteFor(unlockViewFor(undefined), { userData }, request(line), false)
      ).toEqual(expect.objectContaining({ agentSaid: line }));
      attempt('identityCheck', boom, '', IDENTITY);
      reminder = unverifiedReminder([line]);
      return llm.ChatContext.empty();
    });
    expect(reminder).toContain(UNVERIFIED_SPEAKER_NOTE);
    expect(reminder).not.toContain('555-0163');
  });

  it('a verified turn still carries every one of them', () => {
    const out = text(withTurnReminder(request(), session()));
    expect(out).not.toContain(UNVERIFIED_SPEAKER_NOTE);
    for (const note of [CLOSE, REPAIR, CORRECTED, GAME, SELF_QUOTE, GOODBYE, 'FERNI-STATE-NOTE'])
      expect(out).toContain(note);
  });
});
