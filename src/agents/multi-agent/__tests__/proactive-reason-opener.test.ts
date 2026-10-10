/**
 * When Ferni phones its own user, the opener says why it called. Prod
 * 2026-10-10 (session AJ_6gTw8RUcxwBC): dispatched as proactive_outreach with
 * triggerReason "Seth asked Ferni to give him a call so he can hear how Ferni
 * sounds on the phone", Ferni opened "Hey Seth, how's your week been treating
 * you?": the greeting was told "they just called you" and never saw the reason.
 *
 * These run the real orchestrator greeting path (metadata parser → orchestrator
 * → directedGreeting → director → actor); only the model behind the actor is
 * faked, so the test sees the exact prompt the director would send.
 */
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const actor = vi.hoisted(() => ({
  prompts: [] as string[],
  reply: undefined as string | undefined,
  fail: false,
}));
vi.mock('../../../config/generative-model.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../config/generative-model.js')>()),
  getGenerativeModel: async () => ({
    generateContent: async (prompt: string) => {
      actor.prompts.push(prompt);
      if (actor.fail) throw new Error('model down');
      return { response: { text: () => actor.reply ?? '' } };
    },
  }),
}));

const { setupCallTypeContexts } = await import('../../voice-agent-entry/metadata-parser.js');
const { AgentOrchestrator } = await import('../orchestrator.js');
const { GREETING_DIRECTION, PROACTIVE_GREETING_DIRECTION, proactiveFallback } =
  await import('../greeting-direction.js');

const SETH_ASKED =
  'Seth asked Ferni to give him a call so he can hear how Ferni sounds on the phone';

/** The job metadata the prod call was dispatched with, reason optional. */
function proactiveMetadata(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'proactive_outreach',
    userId: 'seth-uid',
    userName: 'Seth',
    triggerType: 'silence',
    ...extra,
  };
}

/** Starts the real orchestrator with a stub agent; `say` records what it says. */
async function startCall(
  sessionId: string,
  metadata: Record<string, unknown>,
  room: EventEmitter = new EventEmitter(),
  participant: object = { identity: 'app_seth', attributes: {} }
) {
  await setupCallTypeContexts(metadata, 'proactive_outreach', sessionId, `room-${sessionId}`);
  const say = vi.fn();
  const orchestrator = new AgentOrchestrator({
    ctx: {} as never,
    room: room as never,
    userParticipant: participant as never,
    createPersonaAgent: async () =>
      ({
        id: 'agent-1',
        personaId: 'ferni',
        say,
        setMuted: vi.fn(),
        userData: { userName: 'Seth' },
        session: {},
      }) as never,
    sessionId,
  });
  await orchestrator.start('ferni');
  return say;
}

/** The opener said on an app (non-phone) proactive session. */
async function openerFor(sessionId: string, metadata: Record<string, unknown>): Promise<string> {
  const say = await startCall(sessionId, metadata);
  await vi.waitFor(() => expect(say).toHaveBeenCalledTimes(1), { timeout: 3000 });
  return String(say.mock.calls[0][0]);
}

function phoneSeth(callStatus: string) {
  return { identity: 'sip_seth', attributes: { 'sip.callStatus': callStatus } };
}

describe('the opener of a call Ferni places to its own user', () => {
  beforeEach(() => {
    actor.prompts = [];
    actor.reply = undefined;
    actor.fail = false;
    vi.stubEnv('PROACTIVE_REASON_OPENER', 'on');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('is directed to say why Ferni called, with the reason the job gave', async () => {
    actor.reply =
      "Hey Seth, it's Ferni. You wanted to hear how I sound on the phone, so here I am.";
    const opener = await openerFor('pro-reason', proactiveMetadata({ triggerReason: SETH_ASKED }));

    expect(actor.prompts).toHaveLength(1);
    const prompt = actor.prompts[0];
    expect(prompt).toContain(`- why you called them: ${SETH_ASKED}`);
    expect(prompt).toContain(PROACTIVE_GREETING_DIRECTION);
    expect(prompt).not.toContain(GREETING_DIRECTION);
    expect(opener).toBe(actor.reply);
  });

  it('carries a commitment and the last talk as facts, never as an invented reason', async () => {
    actor.reply = "Hey Seth, it's Ferni. You had the board meeting today, how'd it go?";
    await openerFor(
      'pro-commitment',
      proactiveMetadata({
        triggerType: 'commitment_followup',
        relatedCommitment: { summary: 'present the plan at the board meeting today' },
        lastSessionSummary: 'Prepping slides for the board meeting.',
      })
    );
    const prompt = actor.prompts[0];
    expect(prompt).toContain(
      '- something they said they would do: present the plan at the board meeting today'
    );
    expect(prompt).toContain(
      '- what you talked about last time: Prepping slides for the board meeting.'
    );
    // The parser's "Proactive check-in" default is not a reason.
    expect(prompt).not.toMatch(/why you called them/);
  });

  it('gives no reason when the job gave none', async () => {
    actor.reply = "Hey Seth, it's Ferni, just calling to check in.";
    await openerFor('pro-none', proactiveMetadata());
    const prompt = actor.prompts[0];
    expect(prompt).not.toMatch(/why you called them|something they said|talked about last time/);
    expect(prompt).not.toMatch(/proactive check-in/i);
    expect(prompt).toContain('If no reason is given, just say you were calling to check in');
  });

  it('falls back to a plain check-in, not the "you called me" hello, when the model fails', async () => {
    actor.fail = true;
    const opener = await openerFor('pro-fail', proactiveMetadata({ triggerReason: SETH_ASKED }));
    expect(opener).toBe(proactiveFallback('Seth'));
    expect(opener).toBe("Hey Seth, it's Ferni, just calling to check in.");
    expect(opener).not.toMatch(/phone|sound/i);
  });

  it('is unchanged with PROACTIVE_REASON_OPENER off', async () => {
    vi.stubEnv('PROACTIVE_REASON_OPENER', '');
    actor.reply = "Hey Seth, how's your week been treating you?";
    await openerFor('pro-off', proactiveMetadata({ triggerReason: SETH_ASKED }));
    const prompt = actor.prompts[0];
    expect(prompt).toContain(GREETING_DIRECTION);
    expect(prompt).not.toContain(SETH_ASKED);
  });
});

describe('a call Ferni places to its own phone', () => {
  beforeEach(() => {
    actor.prompts = [];
    actor.reply = "Hey Seth, it's Ferni. You wanted to hear how I sound on the phone.";
    actor.fail = false;
    vi.stubEnv('PROACTIVE_REASON_OPENER', 'on');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('says nothing while the phone rings, then opens once Seth picks up', async () => {
    const room = new EventEmitter();
    const say = await startCall(
      'pro-ringing',
      proactiveMetadata({ triggerReason: SETH_ASKED }),
      room,
      phoneSeth('ringing')
    );
    await new Promise((r) => {
      setTimeout(r, 50);
    });
    expect(say, 'nothing is said into a ringing line').not.toHaveBeenCalled();

    room.emit('participantAttributesChanged', { 'sip.callStatus': 'active' }, phoneSeth('active'));
    await vi.waitFor(() => expect(say).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(String(say.mock.calls[0][0])).toBe(actor.reply);
  });

  it('says nothing when the phone hangs up unanswered', async () => {
    const room = new EventEmitter();
    const say = await startCall('pro-hangup', proactiveMetadata(), room, phoneSeth('ringing'));
    await vi.waitFor(() => expect(room.listenerCount('participantAttributesChanged')).toBe(1));
    room.emit('participantAttributesChanged', { 'sip.callStatus': 'hangup' }, phoneSeth('hangup'));
    await new Promise((r) => {
      setTimeout(r, 50);
    });
    expect(say).not.toHaveBeenCalled();
    expect(room.listenerCount('participantAttributesChanged')).toBe(0);
  });
});
