/**
 * The shared LEAVING regex ends first calls (FIRST_GOODBYE_NOTE), presence sounds, commitment
 * invites and journal asks under every TURN_LENGTH value. A caller who says they should sleep
 * and then says something heavy is not leaving: none of those may treat it as a goodbye. The
 * bed/sleep pattern TURN_LENGTH=adaptive needs lives in turn-substance.ts, never here (verify
 * of #3151 at 84e21183e). Lines are written for this test.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/journal/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getJournalService: () => ({ createEntry: async () => ({}) }),
}));

const { LEAVING, leavingNow } = await import('../call-farewell.js');
const { FIRST_GOODBYE_NOTE, FIRST_GOODBYE_PLAIN, firstCallNote } =
  await import('../../personas/first-call-rapport.js');
const { presenceCallEnding } = await import('../../integrations/presence-closing.js');
const { inviteFits } = await import('../../personas/commitment-invite.js');
const { journalAskFits } = await import('../../personas/journal-ask.js');
const { withTurnReminder } = await import('../../personas/turn-request.js');

const HEAVY_AT_BEDTIME = [
  'I know I should go to sleep, but I keep thinking about ending it all',
  "I should go to sleep, but I can't stop crying",
];
const ON = { FIRST_CALL_RAPPORT: 'on' };
const firstCall = () => ({ userData: { userId: 'caller-555-0142', isReturningUser: false } });

function chat(said: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'assistant', content: 'Hey, how is your night going?' });
  ctx.addMessage({ role: 'user', content: said });
  return ctx;
}
const lastText = (ctx: llm.ChatContext): string => {
  const last = ctx.items.at(-1);
  return last?.type === 'message' ? (last.textContent ?? '') : '';
};

const KEYS = ['FIRST_CALL_RAPPORT', 'TURN_LENGTH'];
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('shared LEAVING: a heavy turn at bedtime is not a goodbye', () => {
  it.each(HEAVY_AT_BEDTIME)('LEAVING and leavingNow do not match "%s"', (said) => {
    expect(LEAVING.test(said)).toBe(false);
    expect(leavingNow(said)).toBe(false);
  });

  it.each(HEAVY_AT_BEDTIME)('a first call gets no goodbye note for "%s"', (said) => {
    for (const scriptFree of [false, true]) {
      const note = firstCallNote(chat(said), firstCall(), said, ON, scriptFree);
      expect(note).not.toBe(FIRST_GOODBYE_NOTE);
      expect(note).not.toBe(FIRST_GOODBYE_PLAIN);
    }
  });

  it.each(HEAVY_AT_BEDTIME)(
    'the crisis-path reminder (shape:false) carries no goodbye note for "%s"',
    (said) => {
      process.env.FIRST_CALL_RAPPORT = 'on';
      for (const mode of [undefined, 'off', 'learned', 'adaptive']) {
        if (mode) process.env.TURN_LENGTH = mode;
        else delete process.env.TURN_LENGTH;
        const text = lastText(withTurnReminder(chat(said), firstCall(), { shape: false }));
        expect(text).not.toContain(FIRST_GOODBYE_NOTE);
        expect(text).not.toContain(FIRST_GOODBYE_PLAIN);
      }
    }
  );

  it.each(HEAVY_AT_BEDTIME)('presence sounds do not read "%s" as the call ending', (said) => {
    const session = { userData: {}, history: { items: chat(said).items } };
    expect(presenceCallEnding(session)).toBe(false);
  });

  // What the merge-base gives (4cda43857): invites and journal asks already stand down here,
  // through TENDER and happy-exits' sayingGoodbye, before LEAVING is read. Pinned so a wider
  // LEAVING cannot change the reason; a crisis hold on these notes is #3187's, not this PR's.
  it.each([
    [HEAVY_AT_BEDTIME[0], 'goodbye', 'goodbye'],
    [HEAVY_AT_BEDTIME[1], 'careful', 'goodbye'],
  ])('invites and journal asks read "%s" as the merge-base does', (said, invite, journal) => {
    const callerTurns = ['hey', said];
    expect(inviteFits({ said, callerTurns, ferniLines: [], careful: false, firstCall: true })).toBe(
      invite
    );
    expect(
      journalAskFits({
        said,
        callerTurns,
        careful: false,
        userData: { userId: 'caller-555-0143', services: { sessionId: 'leaving-shared' } },
        phoneOnly: false,
        outbound: false,
        closing: false,
        inviting: false,
      })
    ).toBe(journal);
  });
});
