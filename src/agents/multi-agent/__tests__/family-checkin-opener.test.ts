/**
 * A family check-in call runs the same way as a call placed on the user's
 * behalf: the person on the line is the family member, Ferni opens as the
 * sponsor's AI friend once they pick up, and the sponsor's name is never used
 * for the person on the line. Before, the agent didn't recognise the
 * 'family_checkin' dispatch at all and greeted with the app hello.
 */
import { EventEmitter } from 'events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Room } from '@livekit/rtc-node';

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
const { outboundCallContextBuilder } =
  await import('../../../intelligence/context-builders/external/outbound-call-context.js');
const { signDispatch } = await import('../../../services/outreach/on-behalf-dispatch.js');
const { outboundPartiesFor } = await import('../../shared/outbound-opener.js');
const { generateOpeningLine } =
  await import('../../../intelligence/context-builders/family/family-wellbeing-context.js');

// 2026-10-10 19:30 in Salt Lake City.
const NOW = new Date('2026-10-11T01:30:00Z');
const SCHEDULE = { timezone: 'America/Denver' };
const DOUG = { displayName: 'Doug' };
const SETH = { name: 'Seth', relationship: 'sponsor' };
const daysAgo = (days: number) => ({
  callStartedAt: new Date(NOW.getTime() - days * 86_400_000).toISOString(),
});

/** What family-checkin-caller.ts dispatches for a first call. */
const checkinDispatch = (openingLine?: string): Record<string, unknown> => ({
  type: 'family_checkin',
  callId: 'checkin-doug-1',
  sponsorName: 'Seth',
  familyMemberName: 'Doug',
  relationship: 'father',
  systemPrompt: 'You are checking in on Doug. Ask about his garden and his knee.',
  ...(openingLine === undefined ? {} : { openingLine }),
  maxDurationMinutes: 10,
});

// The agent honours a family check-in only when it carries our server's signature.
const SECRET = 'test-livekit-secret';
let priorSecret: string | undefined;
beforeAll(() => {
  priorSecret = process.env.LIVEKIT_API_SECRET;
  process.env.LIVEKIT_API_SECRET = SECRET;
});
afterAll(() => {
  process.env.LIVEKIT_API_SECRET = priorSecret;
});

/** Runs the job metadata exactly as dispatched through the real parser. */
async function dispatch(sessionId: string, payload: object): Promise<void> {
  const raw = JSON.stringify(payload);
  await setupCallTypeContexts(
    JSON.parse(raw),
    'family_checkin',
    sessionId,
    `room-${sessionId}`,
    raw
  );
}

async function openerFor(sessionId: string, metadata: Record<string, unknown>): Promise<string> {
  await dispatch(sessionId, signDispatch(metadata, SECRET));
  const room = new EventEmitter();
  const phone = { identity: 'phone_doug', attributes: { 'sip.callStatus': 'ringing' } };
  const say = vi.fn();
  await new AgentOrchestrator({
    ctx: {} as never,
    room: room as never,
    userParticipant: phone as never,
    createPersonaAgent: async () =>
      ({
        id: 'a1',
        personaId: 'ferni',
        say,
        setMuted: vi.fn(),
        userData: {},
        session: {},
      }) as never,
    sessionId,
  }).start('ferni');
  await new Promise((r) => {
    setTimeout(r, 50);
  });
  expect(say, 'nothing is said into a ringing line').not.toHaveBeenCalled();
  room.emit('participantAttributesChanged', { 'sip.callStatus': 'active' }, phone);
  await vi.waitFor(() => expect(say).toHaveBeenCalledTimes(1), { timeout: 3000 });
  return String(say.mock.calls[0][0]);
}

describe('a family check-in call through the real agent path', () => {
  it("opens to Doug with the dispatched line, as Seth's AI friend", async () => {
    const line = generateOpeningLine(SCHEDULE, DOUG, SETH, [], NOW);
    const opener = await openerFor('fc-line', checkinDispatch(line));
    expect(opener).toBe(
      "Good evening Doug, it's Ferni, Seth's AI friend. Seth asked me to check in on you. Is now an okay time?"
    );
  });

  it('falls back to the on-behalf opener when the dispatch carries no AI disclosure', async () => {
    const opener = await openerFor('fc-old', checkinDispatch('Good evening, Doug! This is Ferni.'));
    expect(opener).toBe(
      "Hi Doug, it's Ferni, Seth's AI friend. Seth asked me to check in on you. Is now an okay time?"
    );
  });

  it('knows the person on the line as Doug, with the check-in prompt as the call script', async () => {
    const signed = signDispatch(checkinDispatch(), SECRET);
    await dispatch('fc-who', signed);
    identifyFromMetadata.mockResolvedValue({ userId: undefined, source: { type: 'anonymous' } });
    const who = await identifyUser({
      jobMetadata: JSON.stringify(signed),
      room: {} as Room,
      sessionId: 'fc-who',
    });
    expect(who.userName).toBe('Doug');

    const injections = await outboundCallContextBuilder.build({
      services: { sessionId: 'fc-who' },
    } as never);
    const prompt = injections.map((i) => i.content).join('\n');
    expect(prompt).toMatch(/You are calling: Doug/);
    expect(prompt).toMatch(/You are Ferni, Seth's friend\./);
    expect(prompt).toMatch(/Ask about his garden and his knee/);
  });
});

describe('the family check-in signature gate (the same one as on-behalf calls)', () => {
  const outboundTreatment = async (sessionId: string) => ({
    parties: outboundPartiesFor(sessionId),
    prompt: await outboundCallContextBuilder.build({ services: { sessionId } } as never),
  });

  it('a signed dispatch gets the outbound call context', async () => {
    await dispatch('fc-signed', signDispatch(checkinDispatch(), SECRET));
    const { parties, prompt } = await outboundTreatment('fc-signed');
    expect(parties).toMatchObject({ recipientName: 'Doug', sponsorName: 'Seth' });
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('an unsigned dispatch is refused', async () => {
    await dispatch('fc-unsigned', checkinDispatch());
    const { parties, prompt } = await outboundTreatment('fc-unsigned');
    expect(parties).toBeUndefined();
    expect(prompt).toEqual([]);
  });

  it('a signed dispatch altered after signing is refused', async () => {
    const forged = { ...signDispatch(checkinDispatch(), SECRET), sponsorName: 'Mallory' };
    await dispatch('fc-forged', forged);
    expect((await outboundTreatment('fc-forged')).parties).toBeUndefined();
  });

  it('a dispatch signed with another secret is refused', async () => {
    await dispatch('fc-wrong-key', signDispatch(checkinDispatch(), 'not-our-secret'));
    expect((await outboundTreatment('fc-wrong-key')).parties).toBeUndefined();
  });
});

describe('every family check-in opening line', () => {
  const variants = {
    first: generateOpeningLine(SCHEDULE, DOUG, SETH, [], NOW),
    lastWeek: generateOpeningLine(SCHEDULE, DOUG, SETH, [daysAgo(3)], NOW),
    twoWeeks: generateOpeningLine(SCHEDULE, DOUG, SETH, [daysAgo(10)], NOW),
    longAgo: generateOpeningLine(SCHEDULE, DOUG, SETH, [daysAgo(40)], NOW),
    noSponsorName: generateOpeningLine(
      SCHEDULE,
      DOUG,
      { name: 'your family member', relationship: 'sponsor' },
      [],
      NOW
    ),
    badTimeZone: generateOpeningLine({ timezone: 'Not/AZone' }, DOUG, SETH, [daysAgo(3)], NOW),
  };

  it.each(Object.entries(variants))(
    '%s: says AI friend, names Doug, no exclamation marks',
    (_, line) => {
      expect(line).toMatch(/AI friend/);
      expect(line).toMatch(/\bDoug\b/);
      expect(line).not.toMatch(/!/);
      expect(line).not.toMatch(/your family member/);
    }
  );

  it('repeat calls still say who Ferni is, and greet by the family member’s clock', () => {
    expect(variants.lastWeek).toBe(
      "Good evening Doug, it's Ferni, Seth's AI friend again. How have you been since we talked?"
    );
    expect(variants.badTimeZone).toMatch(/^Hi Doug, it's Ferni, Seth's AI friend again\./);
    expect(variants.noSponsorName).toMatch(/^Good evening Doug, it's Ferni, an AI friend\./);
  });
});
