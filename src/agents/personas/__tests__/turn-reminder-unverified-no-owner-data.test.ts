/**
 * An unverified turn carries no owner-only context (#3091). When a note about who is speaking
 * can't be built, the turn gets UNVERIFIED_SPEAKER_NOTE (turn-note-guard.ts), and the request
 * must not then hand the model the owner's life facts, the call's recalled memories (the context
 * packet) or the call report, which that note tells it not to share. Crisis guidance, added after
 * the reminder by gatedReply, stays exactly as it is. Every name and number here is made up.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fail = vi.hoisted(() => ({ owner: false }));
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
vi.mock('../../../utils/minor-care.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  minorCareNote: () => {
    if (fail.owner) throw new Error('the owner check failed');
    return 'OWNER-CHECK-NOTE';
  },
}));
/** An OWNER note (it names the owner and a number) and an ordinary one (turn-notes-guarded.ts). */
vi.mock('../call-me-note.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  callMeNote: () => 'Ring Robin Vale back on 555-0187 now.',
}));
vi.mock('../../../tools/handoff/team-by-need-note.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  teamByNeedNote: () => 'ORDINARY-NOTE',
}));
/** The owner's world facts, loaded for the call (in-call-load.ts). */
const FACT = 'Robin Vale starts at Harbor Point Clinic on Monday.';
vi.mock('../../../intelligence/world-model/temporal/in-call-load.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  worldFactLinesFor: () => [FACT],
  worldFactsNoteFor: () => `Where their life stands: ${FACT}`,
}));
/** The call report's delivery mark: an unverified turn must not mark a report it never sent. */
const confirm = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock(
  '../../../intelligence/context-builders/external/call-report.js',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    confirmCallReportReached: confirm,
  })
);

const { withTurnReminder } = await import('../turn-request.js');
const { UNVERIFIED_SPEAKER_NOTE } = await import('../turn-note-guard.js');
const { rememberForPacket } = await import('../context-packet/turn-packet.js');
const { REPORT_HEADER } =
  await import('../../../intelligence/context-builders/external/call-report.js');
const { gatedReply } = await import('../crisis-gate.js');
const { buildCrisisGuidance, detectCrisis } = await import('../../safety/crisis-guard.js');
const { resetCrisisClassifierCache } =
  await import('../../../services/safety/crisis-classifier.js');

/** A recalled memory about someone else in the owner's life. */
const MEMORY = 'Juniper Lane Bakery';
const REPORT = `${REPORT_HEADER}\nThe pharmacy at 555-0142 confirmed the refill for Robin Vale.`;

function session(): { userData: unknown } {
  const s = { userData: { userName: 'Robin Vale', callerTimezone: 'America/Denver' } };
  rememberForPacket(s, {
    facts: [{ entity: 'sister', key: 'favorite_bakery', value: MEMORY, confidence: 0.9 }],
    rest: null,
    userName: 'Robin Vale',
  });
  return s;
}
function request(said = 'long day, honestly', report = false): llm.ChatContext {
  const c = llm.ChatContext.empty();
  if (report) c.addMessage({ role: 'system', content: REPORT });
  c.addMessage({ role: 'assistant', content: 'Hey, good to hear you.' });
  c.addMessage({ role: 'user', content: said });
  return c;
}
const text = (ctx: llm.ChatContext): string =>
  ctx.items.map((i) => (i as { textContent?: string }).textContent ?? '').join('\n');

beforeEach(() => {
  fail.owner = false;
  confirm.mockClear();
  vi.stubEnv('WORLD_FACTS_IN_CALL', 'on');
  vi.stubEnv('CONTEXT_PACKET', 'off');
  resetCrisisClassifierCache();
});
afterEach(() => vi.unstubAllEnvs());

describe('an unverified turn carries no owner-only context (#3091)', () => {
  it("the verifier's probe: a throwing identity note with world facts loaded sends no facts", () => {
    fail.owner = true;
    const out = text(withTurnReminder(request(), session()));
    expect(out).toContain(UNVERIFIED_SPEAKER_NOTE);
    expect(out).not.toContain(FACT);
    expect(out).not.toContain('Robin Vale');
  });

  it('CONTEXT_PACKET=on: no recalled memory and no facts ride the unverified turn', () => {
    vi.stubEnv('CONTEXT_PACKET', 'on');
    fail.owner = true;
    const out = text(withTurnReminder(request(), session()));
    expect(out).toContain(UNVERIFIED_SPEAKER_NOTE);
    expect(out).not.toContain(MEMORY);
    expect(out).not.toContain(FACT);
  });

  it('an OWNER note is left out of an unverified turn; notes with no owner data stay', () => {
    fail.owner = true;
    const out = text(withTurnReminder(request(), session()));
    expect(out).toContain(UNVERIFIED_SPEAKER_NOTE);
    expect(out).not.toContain('555-0187');
    expect(out).toContain('ORDINARY-NOTE');
  });

  it('no call report rides an unverified turn, and none is marked delivered', () => {
    fail.owner = true;
    const out = text(withTurnReminder(request('long day, honestly', true), session()));
    expect(out).toContain(UNVERIFIED_SPEAKER_NOTE);
    expect(out).not.toContain('555-0142');
    expect(out).not.toContain(REPORT_HEADER);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('a verified turn (nothing throws) still carries the facts, memories and call report', () => {
    const plainOut = text(withTurnReminder(request('long day, honestly', true), session()));
    expect(plainOut).toContain(FACT);
    expect(plainOut).toContain('555-0142');
    expect(plainOut).toContain('OWNER-CHECK-NOTE');
    expect(plainOut).toContain('555-0187');
    expect(plainOut).not.toContain(UNVERIFIED_SPEAKER_NOTE);
    expect(confirm).toHaveBeenCalledTimes(1);
    vi.stubEnv('CONTEXT_PACKET', 'on');
    const packetOut = text(withTurnReminder(request(), session()));
    expect(packetOut).toContain(MEMORY);
    expect(packetOut).toContain(FACT);
    expect(packetOut).not.toContain(UNVERIFIED_SPEAKER_NOTE);
  });

  it('an unverified crisis turn keeps its crisis guidance, and still no owner facts', async () => {
    fail.owner = true;
    const said = "I hope I don't wake up tomorrow";
    const model = vi.fn(
      async (_ctx: llm.ChatContext) =>
        new ReadableStream<string>({
          start(c) {
            c.enqueue('ok');
            c.close();
          },
        })
    );
    await gatedReply(
      request(said),
      session(),
      model as never,
      { wrap: (s: unknown) => s } as never,
      {
        env: { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' },
      }
    );
    expect(model).toHaveBeenCalledTimes(1);
    const sent = text(model.mock.calls[0]![0]);
    expect(sent).toContain(buildCrisisGuidance(detectCrisis(said)));
    expect(sent).toContain(UNVERIFIED_SPEAKER_NOTE);
    expect(sent).not.toContain(FACT);
  });
});
