/**
 * CALL_AS_PERSONA, end to end: the owner asks Alex to call David, and Alex
 * places the call. The real callOnBehalf tool records the asking persona, the
 * real orchestrator signs it into the dispatch as persona_id, and the agent job
 * reads that dispatch: the session loads Alex (and Alex's voice), and the
 * script, opener and prompt say "Alex" while keeping the AI disclosure. LiveKit
 * is faked at the SDK; fictional people and words only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OnBehalfCallRequest } from '../../../tools/domains/telephony/types.js';

const createDispatch = vi.hoisted(() =>
  vi.fn(async (_room: string, _agent: string, _opts: { metadata: string }) => ({}))
);
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    createRoom = vi.fn(async () => ({}));
    listParticipants = vi.fn(async () => [{ kind: 4 }]); // the agent is in (agent-join.ts)
  },
  AgentDispatchClient: class {
    createDispatch = createDispatch;
  },
  SipClient: class {
    createSipParticipant = vi.fn(async () => ({ participantId: 'PA_1' }));
  },
}));
vi.mock('@livekit/agents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@livekit/agents')>()),
  llm: { tool: (config: Record<string, unknown>) => config },
}));
// Calling hours and pending calls are deferred-calls.ts's own tests: here the call is placed now.
vi.mock('../deferred-calls.js', () => ({
  placeOrHold: vi.fn(
    async (request: OnBehalfCallRequest, place: (r: OnBehalfCallRequest) => Promise<string>) => ({
      callId: await place(request),
    })
  ),
  holdForCallHours: vi.fn(async () => undefined),
  alreadySetReply: vi.fn(),
  pendingCallTo: vi.fn(async () => null),
  wantsCallNow: vi.fn(() => false),
}));
vi.mock('../call-retry.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../call-retry.js')>()),
  isCallOptedOut: vi.fn(async () => false),
}));
vi.mock('../message-enrichment.js', () => ({
  enrichMessage: vi.fn(async (c: { originalMessage: string }) => ({
    message: c.originalMessage,
    metadata: { enrichmentType: 'none' },
  })),
}));
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
vi.mock('../../../memory/entity-store/integration.js', () => ({
  isEntityStoreReady: () => false,
  findContactForTelephony: vi.fn(),
}));
vi.mock('../../contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async () => []),
  getContacts: vi.fn(async () => []),
  upsertContact: vi.fn(async () => undefined),
}));
vi.mock('../../global-services.js', () => ({
  getGlobalServicesSync: () => ({ store: { getProfile: async () => ({ name: 'Riley Test' }) } }),
}));
// Only a signed dispatch begins call state; the spy is that signal, kept off Firestore.
const beginOnBehalfCall = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../../agents/outbound-call/on-behalf-call-lifecycle.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../agents/outbound-call/on-behalf-call-lifecycle.js')
  >()),
  beginOnBehalfCall,
}));

vi.stubEnv('LIVEKIT_URL', 'wss://example.livekit.cloud');
vi.stubEnv('LIVEKIT_API_KEY', 'k');
vi.stubEnv('LIVEKIT_API_SECRET', 's');
vi.stubEnv('DISPATCH_SIGNING_SECRET', 'dispatch-secret');
vi.stubEnv('SIP_TRUNK_ID', 'ST_test');

const { createCallOnBehalfTool } =
  await import('../../../tools/domains/telephony/call-on-behalf.js');
const { dispatchVerifySecrets, verifyOnBehalfDispatch } = await import('../on-behalf-dispatch.js');
const { parseJobMetadata, setupCallTypeContexts } =
  await import('../../../agents/voice-agent-entry/metadata-parser.js');
const { getOutboundCallContext, outboundCallContextBuilder, AI_DISCLOSURE_RULE } =
  await import('../../../intelligence/context-builders/external/outbound-call-context.js');
const { outboundOpener, partiesOf } = await import('../opening-line.js');
const { voicemailMessage } = await import('../../../agents/shared/line-screen.js');
const { getVoiceIdForPersona } = await import('../../../config/voice-ids.js');
const { buildCallScript, personalScript } =
  await import('../../../tools/domains/telephony/scripts/index.js');

/** The business template's disclosure line (the brand copy check keeps its wording out of tests). */
const DISCLOSURE = /\nI'm an AI \w+ authorized by Riley Test to make this call\./;

/** The owner asks the persona `agentId` to call David; the reply and the raw dispatch. */
async function ownerAsks(agentId: string): Promise<{ reply: string; raw: string }> {
  createDispatch.mockClear();
  const tool = createCallOnBehalfTool({
    userId: 'owner-1',
    sessionId: 'owner-call-1',
    agentId,
    agentDisplayName: agentId,
  } as never) as unknown as { execute: (p: Record<string, unknown>) => Promise<string> };
  const reply = await tool.execute({
    contactQuery: 'David',
    phoneNumber: '213-555-0100',
    purpose: 'tell him dinner is at seven',
    recordingConsent: false,
  });
  expect(createDispatch).toHaveBeenCalledTimes(1);
  return { reply: String(reply), raw: createDispatch.mock.calls[0][2].metadata };
}

/** The agent job reading a dispatch: the persona it loads and the call's outbound context. */
async function agentReads(raw: string, sessionId: string) {
  const { personaId } = parseJobMetadata({ job: { metadata: raw } } as never);
  await setupCallTypeContexts(
    JSON.parse(raw),
    'on_behalf_call',
    sessionId,
    `room-${sessionId}`,
    raw
  );
  const context = getOutboundCallContext(sessionId);
  if (!context) throw new Error('no outbound context was set');
  return { personaId, context, opener: outboundOpener(partiesOf(context)) };
}

async function promptOf(sessionId: string): Promise<string> {
  const injections = await outboundCallContextBuilder.build({ services: { sessionId } } as never);
  return injections.map((i) => String(i.content)).join('\n');
}

beforeEach(() => {
  vi.stubEnv('CALL_AS_PERSONA', 'on');
  beginOnBehalfCall.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('LIVEKIT_URL', 'wss://example.livekit.cloud');
  vi.stubEnv('LIVEKIT_API_KEY', 'k');
  vi.stubEnv('LIVEKIT_API_SECRET', 's');
  vi.stubEnv('DISPATCH_SIGNING_SECRET', 'dispatch-secret');
  vi.stubEnv('SIP_TRUNK_ID', 'ST_test');
});

describe('CALL_AS_PERSONA: the persona asked places the call', () => {
  it('Alex asks: signed persona_id alex-chen, an Alex script, voice and opener, and the reply names Alex', async () => {
    const { reply, raw } = await ownerAsks('alex-chen');
    const dispatch = JSON.parse(raw) as Record<string, unknown>;

    expect(reply).toContain('Alex will call David now');
    expect(dispatch.persona_id).toBe('alex-chen');
    expect(verifyOnBehalfDispatch(raw, dispatchVerifySecrets())).toBe(true);
    expect(dispatch.script).toContain('You are Alex, calling David on behalf of Riley Test.');
    expect(dispatch.script).toContain(
      "Hello, my name is Alex and I'm calling on behalf of Riley Test."
    );
    expect(dispatch.script).toMatch(DISCLOSURE); // the AI disclosure stays
    expect(dispatch.script).not.toMatch(/Ferni/);

    const { personaId, context, opener } = await agentReads(raw, 'sess-alex');
    expect(personaId).toBe('alex-chen');
    expect(getVoiceIdForPersona(personaId)).toBe(getVoiceIdForPersona('alex-chen'));
    expect(getVoiceIdForPersona(personaId)).not.toBe(getVoiceIdForPersona('ferni'));
    expect(context.agentName).toBe('Alex');
    expect(opener).toMatch(/^Hi David, it's Alex, Riley(?: Test)?'s AI friend\./);
    expect(voicemailMessage(partiesOf(context))).toMatch(
      /^Hi David, it's Alex, Riley(?: Test)?'s AI friend\./
    );
    expect(beginOnBehalfCall).toHaveBeenCalledTimes(1);

    const prompt = await promptOf('sess-alex');
    expect(prompt).toContain("You are Alex, Riley Test's friend.");
    expect(prompt).toContain(AI_DISCLOSURE_RULE); // the on-behalf disclosure stays
    expect(prompt).not.toMatch(/You are Ferni/);
  });

  it.each([
    ['alex-chen', /I'm Alex, Riley Test's AI \w+\./],
    [undefined, /I'm Ferni, Riley Test's AI \w+\./],
  ])('a personal call script from %j names the caller in its AI disclosure', (id, line) => {
    const script = buildCallScript(personalScript, {
      callingPersonaId: id,
      userName: 'Riley Test',
      contactName: 'David',
      purpose: 'tell him dinner is at seven',
      objective: 'deliver_message',
    });
    expect(script).toMatch(line);
  });

  it.each(['nobody-123', 'john-bogle', 'seth', ''])(
    'an asking id %j the team does not hold: Ferni places the call',
    async (agentId) => {
      const { reply, raw } = await ownerAsks(agentId);
      const dispatch = JSON.parse(raw) as Record<string, unknown>;

      expect(reply).toContain("I'm calling David now");
      expect(dispatch.persona_id ?? 'ferni').toBe('ferni');
      expect(dispatch.script).toContain('You are Ferni, calling David');
      const { personaId, opener } = await agentReads(raw, `sess-unknown-${agentId}`);
      expect(personaId).toBe('ferni');
      expect(opener).toMatch(/^Hi David, it's Ferni,/);
    }
  );

  it('an unknown persona_id in a signed dispatch is read as Ferni', async () => {
    const { raw } = await ownerAsks('alex-chen');
    const { signDispatch } = await import('../on-behalf-dispatch.js');
    const {
      requesterSignature: _s,
      signedAt: _t,
      ...body
    } = JSON.parse(raw) as Record<string, unknown>;
    const resigned = JSON.stringify(signDispatch({ ...body, persona_id: 'mallory-x' }));
    expect(verifyOnBehalfDispatch(resigned, dispatchVerifySecrets())).toBe(true);

    const { personaId, context, opener } = await agentReads(resigned, 'sess-resigned');
    expect(personaId).toBe('ferni');
    expect(context.agentName).toBe('Ferni');
    expect(opener).toMatch(/it's Ferni,/);
  });

  it('a tampered persona_id fails the signature: no call state, and the call does not say the new name', async () => {
    const { raw } = await ownerAsks('alex-chen');
    const tampered = JSON.stringify({ ...JSON.parse(raw), persona_id: 'jordan-taylor' });

    expect(verifyOnBehalfDispatch(tampered, dispatchVerifySecrets())).toBe(false);
    const { context, opener } = await agentReads(tampered, 'sess-tampered');
    expect(beginOnBehalfCall).not.toHaveBeenCalled();
    expect(context.agentName).toBeUndefined();
    expect(opener).not.toMatch(/Jordan|Alex/);
    expect(await promptOf('sess-tampered')).toContain('You are Ferni,');
  });

  it('flag off: Alex asks and Ferni calls, as on main (no persona_id key at all)', async () => {
    vi.stubEnv('CALL_AS_PERSONA', 'off');
    const { reply, raw } = await ownerAsks('alex-chen');
    const dispatch = JSON.parse(raw) as Record<string, unknown>;

    expect(reply).toContain("Got it! I'm calling David now to tell him dinner is at seven.");
    expect(Object.keys(dispatch)).not.toContain('persona_id');
    expect(raw).not.toContain('persona_id');
    expect(dispatch.script).toContain('You are Ferni, calling David on behalf of Riley Test.');
    expect(dispatch.script).toContain(
      "Hello, my name is Ferni and I'm calling on behalf of Riley Test."
    );
    expect(dispatch.script).toMatch(DISCLOSURE); // the AI disclosure stays

    const { personaId, context, opener } = await agentReads(raw, 'sess-off');
    expect(personaId).toBe('ferni');
    expect(context.agentName).toBeUndefined();
    expect(opener).toMatch(/^Hi David, it's Ferni, Riley(?: Test)?'s AI friend\./);
    expect(await promptOf('sess-off')).toContain("You are Ferni, Riley Test's friend.");
  });
});
