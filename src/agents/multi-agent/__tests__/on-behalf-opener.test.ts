/**
 * A call Ferni places for the user opens to the person it called, says it is
 * an AI, and says who it is calling for: never the app greeting addressed to
 * the sponsor. Prod 2026-10-10: Ferni phoned Seth's dad Doug and opened with
 * "Hey Seth, what's going on?" into the ringing line, then "Hey Seth." when he
 * picked up. He hung up.
 */
import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from '@livekit/rtc-node';
import type { AnswerWatchRoom } from '../../shared/outbound-opener.js';

const { identifyFromMetadata } = vi.hoisted(() => ({ identifyFromMetadata: vi.fn() }));
vi.mock('../../../services/superhuman/commitment-prefetch.js', () => ({
  prefetchUserCommitments: vi.fn(async () => {}),
}));
vi.mock('../../../services/identity/user-identification.js', () => ({ identifyFromMetadata }));
vi.mock('../../../services/trust-and-identity/voice-agent-integration.js', () => ({
  onSessionStart: vi.fn(async () => ({})),
}));
vi.mock('../../../services/voice/voice-speaker-change.js', () => ({
  getSpeakerChangeDetector: () => ({ on: vi.fn(), start: vi.fn() }),
}));

const { setupCallTypeContexts } = await import('../../voice-agent-entry/metadata-parser.js');
const { AgentOrchestrator } = await import('../orchestrator.js');
const { identifyUser } = await import('../../voice-agent/user-identification-handler.js');
const { buildUserAwareness } = await import('../../voice-agent/phases/user-awareness.js');
const { outboundCallerAwareness, outboundOpener, outboundPartiesFor, waitForCallAnswered } =
  await import('../../shared/outbound-opener.js');
const { signDispatch } = await import('../../../services/outreach/on-behalf-dispatch.js');
const SECRET = 'test-livekit-secret';
const { outboundCallContextBuilder } =
  await import('../../../intelligence/context-builders/external/outbound-call-context.js');

/** Seth's agreed wording (2026-10-10): the one, light AI disclosure. */
const SETH_TO_DOUG =
  "Hi Doug, it's Ferni, Seth's AI friend. Seth asked me to check in on you. Is now an okay time?";
/** Never said to the person on the line, nor in the prompt that shapes what is said. */
const BANNED = /assistant|companion|hey,? seth/i;

/** The job metadata the prod call was dispatched with (session AJ_TxGXvpFEKevD). */
const onBehalfMetadata = (): Record<string, unknown> => ({
  type: 'on_behalf_call',
  callId: 'doug-checkin-20261010',
  callType: 'personal',
  userId: 'seth-uid',
  userName: 'Seth',
  contact: { name: 'Doug', phone: '+18015550100' },
  purpose: 'Seth asked Ferni to call his dad Doug to check in.',
  complianceScript:
    "Open by saying you're Ferni, an AI companion, calling for his son Seth, who asked you to check in on him.",
  mustNotDo: ['Pretend to be Seth'],
  informationToGather: ['How Doug is doing'],
});

async function onBehalfSession(sessionId: string): Promise<void> {
  await setupCallTypeContexts(onBehalfMetadata(), 'on_behalf_call', sessionId, `room-${sessionId}`);
}

function phoneParticipant(callStatus: string) {
  return { identity: 'phone_doug', attributes: { 'sip.callStatus': callStatus } };
}

/** Starts the real orchestrator with a stub agent and returns what it says. */
function startOrchestrator(sessionId: string, room: EventEmitter, participant: object) {
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
        userData: {},
        session: {},
      }) as never,
    sessionId,
  });
  return { say, started: orchestrator.start('ferni') };
}

describe('the opener of a call placed on the user’s behalf', () => {
  it('waits for the phone to be answered, then greets Doug as Seth’s AI friend', async () => {
    await onBehalfSession('ob-opener');
    const room = new EventEmitter();
    const { say, started } = startOrchestrator('ob-opener', room, phoneParticipant('ringing'));
    await started;

    await new Promise((r) => {
      setTimeout(r, 50);
    });
    expect(say, 'nothing is said into a ringing line').not.toHaveBeenCalled();

    room.emit(
      'participantAttributesChanged',
      { 'sip.callStatus': 'active' },
      phoneParticipant('active')
    );
    await vi.waitFor(() => expect(say).toHaveBeenCalledTimes(1), { timeout: 3000 });

    const opener = String(say.mock.calls[0][0]);
    expect(opener).toMatch(/\bDoug\b/);
    expect(opener).toMatch(/\bAI\b/);
    expect(opener).toBe(SETH_TO_DOUG);
    expect(opener).toContain("Ferni, Seth's AI friend");
    expect(opener).not.toMatch(BANNED);
    expect(opener).not.toMatch(/hey,? seth/i);
    expect(opener.indexOf('Doug')).toBeLessThan(opener.indexOf('Seth'));
  });

  it('reads the sponsor from the requester field of the current dispatch shape', async () => {
    const { userId: _userId, userName: _userName, ...rest } = onBehalfMetadata();
    const dispatch = {
      ...rest,
      session_id: 'onbehalf:doug',
      requester: { userId: 'seth-uid', name: 'Seth', timezone: 'UTC', originalSessionId: '' },
    };
    await setupCallTypeContexts(dispatch, 'on_behalf_call', 'ob-requester', 'room-ob-requester');
    const room = new EventEmitter();
    const { say, started } = startOrchestrator('ob-requester', room, phoneParticipant('active'));
    await started;
    await vi.waitFor(() => expect(say).toHaveBeenCalledTimes(1), { timeout: 3000 });
    const opener = String(say.mock.calls[0][0]);
    expect(opener).toBe(SETH_TO_DOUG);
  });

  it('names the requester from a signed dispatch with no requester id, for display only', async () => {
    // Dev 2026-10-10: a call to Seth's sister said "it's Ferni, an AI friend", without "Seth's".
    const { userId: _userId, ...noId } = onBehalfMetadata();
    const signed = signDispatch(noId, SECRET);
    const openerOf = async (sessionId: string, dispatch: object): Promise<string> => {
      const raw = JSON.stringify(dispatch);
      await setupCallTypeContexts(
        JSON.parse(raw),
        'on_behalf_call',
        sessionId,
        `r-${sessionId}`,
        raw
      );
      const room = new EventEmitter();
      const { say, started } = startOrchestrator(sessionId, room, phoneParticipant('active'));
      await started;
      await vi.waitFor(() => expect(say).toHaveBeenCalledTimes(1), { timeout: 3000 });
      return String(say.mock.calls[0][0]);
    };
    const prior = process.env.LIVEKIT_API_SECRET;
    process.env.LIVEKIT_API_SECRET = SECRET;
    try {
      expect(await openerOf('ob-no-id', signed)).toBe(SETH_TO_DOUG);
      // Unsigned or altered: the top-level name must not reach Ferni's mouth.
      const forged = { ...signed, userName: 'Mallory' };
      expect(await openerOf('ob-no-id-forged', forged)).not.toMatch(/Seth|Mallory/);
      expect(await openerOf('ob-no-id-unsigned', noId)).not.toMatch(/Seth/);
    } finally {
      process.env.LIVEKIT_API_SECRET = prior;
    }
  });

  it('says nothing when the phone hangs up unanswered', async () => {
    await onBehalfSession('ob-hangup');
    const room = new EventEmitter();
    const { say, started } = startOrchestrator('ob-hangup', room, phoneParticipant('ringing'));
    await started;
    room.emit(
      'participantAttributesChanged',
      { 'sip.callStatus': 'hangup' },
      phoneParticipant('hangup')
    );
    await new Promise((r) => {
      setTimeout(r, 50);
    });
    expect(say).not.toHaveBeenCalled();
  });
});

describe('who is on the line on a call placed for the user', () => {
  beforeEach(() => identifyFromMetadata.mockReset());

  it('is the person called, not the sponsor whose profile and name came with the job', async () => {
    await onBehalfSession('ob-identify');
    identifyFromMetadata.mockResolvedValue({
      userId: 'seth-uid',
      source: { type: 'metadata' },
      profile: { name: 'Seth' },
    });
    const result = await identifyUser({
      jobMetadata: JSON.stringify(onBehalfMetadata()),
      room: {} as Room,
      sessionId: 'ob-identify',
    });
    expect(result.userName).toBe('Doug');
  });

  it("an ordinary call still uses the profile's name", async () => {
    identifyFromMetadata.mockResolvedValue({
      userId: 'seth-uid',
      source: { type: 'metadata' },
      profile: { name: 'Seth' },
    });
    const result = await identifyUser({
      jobMetadata: '{"userId":"seth-uid"}',
      room: {} as Room,
      sessionId: 'ordinary-call',
    });
    expect(result.userName).toBe('Seth');
  });

  it("model instructions name Doug and keep the sponsor's profile out", async () => {
    await onBehalfSession('ob-awareness');
    const awareness = outboundCallerAwareness(outboundPartiesFor('ob-awareness'));
    expect(awareness).toMatch(/Doug is the person on the line/);
    expect(awareness).toMatch(/Never call the person on the line Seth/);
    expect(awareness).toMatch(/You are Ferni, Seth's friend\./);
    expect(outboundCallerAwareness(outboundPartiesFor('no-such-call'))).toBe('');

    const injections = await outboundCallContextBuilder.build({
      services: { sessionId: 'ob-awareness' },
    } as never);
    // Ferni's own prompt text; the dispatcher's complianceScript is passed through as given.
    const { complianceScript } = onBehalfMetadata();
    const prompt = injections
      .map((i) => i.content)
      .filter((c) => c !== complianceScript)
      .join('\n');
    expect(prompt).toMatch(/You are Ferni, Seth's friend\./);
    for (const text of [awareness, prompt]) {
      expect(text).not.toMatch(BANNED);
      // Honest when sincerely asked; never told to re-announce being an AI.
      expect(text).toMatch(
        /sincerely asks whether you're a real person, say plainly that you're an AI/
      );
      expect(text).toMatch(/don't bring it up again or add 'as an AI' disclaimers/);
      expect(text).not.toMatch(/say you are an AI|identify yourself as an AI|you are an AI\./i);
    }

    const single = buildUserAwareness({
      sessionId: 'ob-awareness',
      userProfile: { name: 'Seth', totalConversations: 40 } as never,
      isReturningUser: true,
      userName: 'Doug',
      sessionStartTime: new Date(),
    });
    expect(single.instructionsBlock).not.toMatch(/talking to Seth/);
    expect(single.instructionsBlock).toMatch(/Doug/);
  });
});

describe('openers never present Ferni as an assistant', () => {
  it('a business call says Ferni is an AI calling for Seth', () => {
    const opener = outboundOpener({ sponsorName: 'Seth', recipientName: 'Acme', personal: false });
    expect(opener).toBe('Hi, this is Ferni, an AI calling for Seth. Do you have a quick minute?');
  });

  it('without a sponsor name, a personal call is still from an AI friend', () => {
    expect(outboundOpener({ recipientName: 'Doug', personal: true })).toBe(
      "Hi Doug, it's Ferni, an AI friend, calling to check in on you. Is now an okay time?"
    );
  });

  it('every shape discloses the AI and none says assistant', () => {
    for (const personal of [true, false]) {
      for (const sponsorName of ['Seth', undefined]) {
        for (const recipientName of ['Doug', undefined]) {
          const opener = outboundOpener({ sponsorName, recipientName, personal });
          expect(opener).toMatch(/\bAI\b/);
          expect(opener).not.toMatch(BANNED);
        }
      }
    }
  });
});

describe('waitForCallAnswered', () => {
  // A plain emitter stands in for the LiveKit room.
  const roomLike = (emitter: EventEmitter) => emitter as unknown as AnswerWatchRoom;

  it('does not wait for a participant that is not a dialed phone', async () => {
    const room = new EventEmitter();
    await expect(
      waitForCallAnswered(roomLike(room), { identity: 'web-user', attributes: {} }, 1000, 0)
    ).resolves.toBe(true);
  });

  it('gives up when the phone never answers', async () => {
    const room = new EventEmitter();
    await expect(
      waitForCallAnswered(roomLike(room), phoneParticipant('dialing'), 20, 0)
    ).resolves.toBe(false);
    expect(room.listenerCount('participantAttributesChanged')).toBe(0);
  });
});
