/**
 * On an unverified turn only notes marked SAFE ride (#3091, turn-note-guard.ts): an allowlist, so
 * a builder nobody marked (a director note, the journal steer, one added later) is dropped by
 * default. The safety notes and the style and state notes are SAFE and stay; Ferni's self-quotes
 * (state's `last`) do not. Every name here is made up.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fail = vi.hoisted(() => ({ identity: false }));
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
/** An identity note whose check fails: the turn becomes unverified. */
vi.mock('../call-me-note.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  callMeNote: () => {
    if (fail.identity) throw new Error('the owner check inside the call-me note failed');
    return '';
  },
}));
vi.mock('../../../utils/minor-care.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  minorCareNote: () => 'MINOR-CARE-NOTE',
}));
vi.mock('../sexual-boundary.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sexualBoundaryNote: () => 'SEXUAL-BOUNDARY-NOTE',
}));
/** COMMITMENT_INVITE's journal ask: an account-action steer ("save it"). */
const JOURNAL = 'Offer to save what Dana Reyes said about Pine Hollow to their journal.';
vi.mock('../journal-ask.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  journalAskFor: () => JOURNAL,
}));
/** Builders that return objects: their `text` / `note` is recorded as SAFE, never `last`. */
vi.mock('../ferni-state.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ferniStateTurn: () => ({ note: 'FERNI-STATE-NOTE', last: 'FERNI-SELF-SHARE' }),
}));
vi.mock('../turn-request-style.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  styleFor: () => ({ text: 'STYLE-NOTE' }),
}));

const { withTurnReminder } = await import('../turn-request.js');
const { attempt, guardedTurn, IDENTITY, SAFE, UNVERIFIED_SPEAKER_NOTE, unverifiedReminder } =
  await import('../turn-note-guard.js');
const { setDirector } = await import('../director-notes.js');

/** A prior director note and its "told" line, naming a pet and a vet. */
const DIRECTOR_NOTE = "Ask how Biscuit's checkup with Dr. Okafor went.";
const TOLD = 'You already brought up Biscuit and Dr. Okafor; let them lead.';

let calls = 0;
function session(): object {
  // A session id, or exits-held.ts holds every director note (a call it can't check for risk).
  const s = { userData: { userName: 'Dana Reyes', services: { sessionId: `allow-${++calls}` } } };
  const director = { current: () => [DIRECTOR_NOTE], told: () => TOLD, hardRule: () => '' };
  setDirector(s, director as never);
  return s;
}
function request(): llm.ChatContext {
  const c = llm.ChatContext.empty();
  c.addMessage({ role: 'assistant', content: 'Hey, good to hear you.' });
  c.addMessage({ role: 'user', content: 'long day, honestly' });
  return c;
}
const boom = (): string => {
  throw new Error('the identity check failed');
};
const text = (ctx: llm.ChatContext): string =>
  ctx.items.map((i) => (i as { textContent?: string }).textContent ?? '').join('\n');

beforeEach(() => {
  fail.identity = false;
});

describe('an unverified turn keeps only SAFE notes (#3091)', () => {
  it('a director note and its told line do not reach an unverified turn', () => {
    fail.identity = true;
    const out = text(withTurnReminder(request(), session()));
    expect(out).toContain(UNVERIFIED_SPEAKER_NOTE);
    expect(out).not.toContain('Biscuit');
    expect(out).not.toContain('Okafor');
  });

  it('a builder not marked SAFE is dropped by default', () => {
    let reminder: string | undefined;
    guardedTurn({ warn: vi.fn() } as never, 'call-1', llm.ChatContext.empty(), () => {
      const added = attempt('newBuilder', () => 'Their landlord is Casey Lin.', '');
      const kept = attempt('safeBuilder', () => 'SAFE-NOTE', '', SAFE);
      attempt('identityCheck', boom, '', IDENTITY);
      reminder = unverifiedReminder([added, kept]);
      return llm.ChatContext.empty();
    });
    expect(reminder).toContain(UNVERIFIED_SPEAKER_NOTE);
    expect(reminder).toContain('SAFE-NOTE');
    expect(reminder).not.toContain('Casey Lin');
  });

  it('the invite journal steer is dropped', () => {
    fail.identity = true;
    const out = text(withTurnReminder(request(), session()));
    expect(out).toContain(UNVERIFIED_SPEAKER_NOTE);
    expect(out).not.toContain('Pine Hollow');
  });

  it('the safety notes (minor care, sexual boundary) are SAFE and survive', () => {
    fail.identity = true;
    const out = text(withTurnReminder(request(), session()));
    expect(out).toContain(UNVERIFIED_SPEAKER_NOTE);
    expect(out).toContain('MINOR-CARE-NOTE');
    expect(out).toContain('SEXUAL-BOUNDARY-NOTE');
  });

  it('notes from builders that return objects survive (style, Ferni state), not his self-quotes', () => {
    fail.identity = true;
    const out = text(withTurnReminder(request(), session()));
    expect(out).toContain(UNVERIFIED_SPEAKER_NOTE);
    expect(out).toContain('STYLE-NOTE');
    expect(out).toContain('FERNI-STATE-NOTE');
    expect(out).not.toContain('FERNI-SELF-SHARE');
  });

  it('a verified turn still carries everything, director notes included', () => {
    const out = text(withTurnReminder(request(), session()));
    expect(out).not.toContain(UNVERIFIED_SPEAKER_NOTE);
    for (const note of [DIRECTOR_NOTE, TOLD, JOURNAL, 'MINOR-CARE-NOTE', 'SEXUAL-BOUNDARY-NOTE'])
      expect(out).toContain(note);
    for (const note of ['STYLE-NOTE', 'FERNI-STATE-NOTE', 'FERNI-SELF-SHARE'])
      expect(out).toContain(note);
  });
});
