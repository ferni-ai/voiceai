/**
 * An unverified turn carries only safety guidance and who is speaking (#3091, turn-note-guard.ts).
 * SAFE is a fixed set of 7 builders, pinned here: adding one fails this test until it is updated
 * on purpose, with a test that its text carries no data and no action steer. Planning steers
 * (Alex's chief-of-staff line, the team-by-need "fits Alex" line) are not in it. Names are made up.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fail = vi.hoisted(() => ({ identity: false }));
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
vi.mock('../call-me-note.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  callMeNote: () => {
    if (fail.identity) throw new Error('the owner check inside the call-me note failed');
    return '';
  },
}));

const { withTurnReminder } = await import('../turn-request.js');
const { safeBuilderNames, UNVERIFIED_SPEAKER_NOTE } = await import('../turn-note-guard.js');

/** The whole SAFE set. Change it only with a test for the new builder's text. */
const SAFE_SET = [
  'ferniState',
  'minorCare',
  'personaVoice',
  'returningFlow',
  'sexualBoundary',
  'style',
  'teammateIdentity',
];

let calls = 0;
const session = (): object => ({
  userData: { userName: 'Dana Reyes', services: { sessionId: `safe-set-${++calls}` } },
});
function planning(): llm.ChatContext {
  const c = llm.ChatContext.empty();
  c.addMessage({ role: 'assistant', content: 'Hey, good to hear you.' });
  c.addMessage({ role: 'user', content: "what's on my calendar, remind me to call her" });
  return c;
}
const text = (ctx: llm.ChatContext): string =>
  ctx.items.map((i) => (i as { textContent?: string }).textContent ?? '').join('\n');

beforeEach(() => {
  fail.identity = false;
  vi.stubEnv('ALEX_CHIEF_OF_STAFF', 'on');
  vi.stubEnv('TEAM_BY_NEED', 'on');
});
afterEach(() => vi.unstubAllEnvs());

describe('SAFE is a fixed set: safety guidance and who is speaking (#3091)', () => {
  it('an unverified planning turn carries neither the chief-of-staff nor the fits-Alex line', () => {
    fail.identity = true;
    const out = text(withTurnReminder(planning(), session()));
    expect(out).toContain(UNVERIFIED_SPEAKER_NOTE);
    expect(out).not.toContain('chief of staff');
    expect(out).not.toContain('offer Alex now');
    expect(out).not.toContain('fits Alex');
    expect(out).not.toContain('Teammates you can bring in');
  });

  it('a verified planning turn still carries both lines', () => {
    const out = text(withTurnReminder(planning(), session()));
    expect(out).not.toContain(UNVERIFIED_SPEAKER_NOTE);
    expect(out).toContain('offer Alex now');
    expect(out).toContain('fits Alex');
  });

  it('the SAFE set is exactly these 7 builders', () => {
    withTurnReminder(planning(), session()); // registers any SAFE attempt() in turn-request.ts too
    expect(safeBuilderNames()).toEqual(SAFE_SET);
  });

  it('alias (the previous assistant line, for heardTeammate) is not SAFE', () => {
    withTurnReminder(planning(), session());
    expect(safeBuilderNames()).not.toContain('aliasNote');
  });
});
