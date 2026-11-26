/**
 * SIGNED_DISPATCH_PERSONA (#4111): a dispatch type only our server places picks
 * the session's persona and voice from persona_id only when the dispatch, as
 * sent, carries a valid signature. A tampered one gets the default persona.
 *
 * The signed types are the ones a signer in the tree produces (signDispatch):
 * on-behalf calls (on-behalf-call-orchestrator.ts, call-retry.ts), family
 * check-ins (family-checkin-caller.ts) and proactive outreach (self-call.ts).
 * Ordinary room joins are not signed and keep reading persona_id as before.
 *
 * @module agents/voice-agent-entry/__tests__/signed-dispatch-persona.test
 */
import type { JobContext } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseJobMetadata } from '../metadata-parser.js';
import {
  buildOnBehalfDispatch,
  signDispatch,
} from '../../../services/outreach/on-behalf-dispatch.js';
import { selfCallDispatch } from '../../../services/outreach/proactive-channels/self-call.js';

const SECRET = 'test-dispatch-secret';
const ASKED = 'alex-chen';

const job = (metadata: unknown, roomMetadata?: unknown): JobContext =>
  ({
    job: {
      metadata: JSON.stringify(metadata),
      ...(roomMetadata !== undefined && { room: { metadata: JSON.stringify(roomMetadata) } }),
    },
  }) as unknown as JobContext;

const personaOf = (ctx: JobContext): string => parseJobMetadata(ctx).personaId;

// One dispatch per signed type, shaped as its producer builds it, with no persona yet.
const SIGNED_TYPES: Record<string, Record<string, unknown>> = {
  on_behalf_call: {
    ...buildOnBehalfDispatch({
      callId: 'call_1',
      requester: {
        userId: 'u_riley',
        name: 'Riley Test',
        timezone: 'UTC',
        originalSessionId: 's1',
      },
      contact: { name: 'Dr. Lee', phone: '+15550100' },
      purpose: 'move the appointment',
      objective: 'reschedule',
      callType: 'business',
    }),
  },
  family_checkin: {
    type: 'family_checkin',
    callId: 'call_2',
    sponsorUserId: 'u_riley',
    sponsorName: 'Riley Test',
    familyMemberName: 'Sam',
    systemPrompt: 'Check in kindly.',
  },
  proactive_outreach: selfCallDispatch(
    'u_riley',
    'call_3',
    { kind: 'silence', reason: 'a week quiet' } as never,
    'ferni'
  ),
};

beforeEach(() => {
  vi.stubEnv('DISPATCH_SIGNING_SECRET', SECRET);
  vi.stubEnv('LIVEKIT_API_SECRET', '');
  vi.stubEnv('PERSONA_ID', '');
  vi.stubEnv('SIGNED_DISPATCH_PERSONA', 'on');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(Object.entries(SIGNED_TYPES))('signed dispatch type %s', (type, dispatch) => {
  it('is the type its producer dispatches', () => {
    expect(dispatch.type).toBe(type);
  });

  it('valid signature: the asked persona', () => {
    expect(personaOf(job(signDispatch({ ...dispatch, persona_id: ASKED }, SECRET)))).toBe(ASKED);
  });

  it('persona_id changed after signing: the default persona', () => {
    const signed = signDispatch({ ...dispatch, persona_id: 'ferni' }, SECRET);
    expect(personaOf(job({ ...signed, persona_id: ASKED }))).toBe('ferni');
  });

  it('signed with another key: the default persona', () => {
    expect(personaOf(job(signDispatch({ ...dispatch, persona_id: ASKED }, 'not-our-key')))).toBe(
      'ferni'
    );
  });

  it('no signature at all: the default persona', () => {
    expect(personaOf(job({ ...dispatch, persona_id: ASKED }))).toBe('ferni');
  });

  it("forged: the deployment's own default persona (PERSONA_ID), never the asked one", () => {
    vi.stubEnv('PERSONA_ID', 'maya-santos');
    expect(personaOf(job({ ...dispatch, persona_id: ASKED }))).toBe('maya-santos');
  });

  it('a persona in room metadata does not stand in for an unsigned one', () => {
    const { persona_id: _named, ...bare } = dispatch;
    const signed = signDispatch(bare, SECRET); // valid, names no persona
    expect(personaOf(job(signed, { persona_id: ASKED }))).toBe('ferni');
  });

  it('flag off: persona_id is read as before, signed or not', () => {
    vi.stubEnv('SIGNED_DISPATCH_PERSONA', 'off');
    expect(personaOf(job({ ...dispatch, persona_id: ASKED }))).toBe(ASKED);
  });
});

describe('unsigned dispatch types are unchanged', () => {
  const join = { persona_id: ASKED, user_id: 'u_riley' };

  it.each(['on', 'off'])('an ordinary room join keeps its persona_id (flag %s)', (flag) => {
    vi.stubEnv('SIGNED_DISPATCH_PERSONA', flag);
    expect(personaOf(job(join))).toBe(ASKED);
    expect(personaOf(job({ user_id: 'u_riley' }, { persona_id: ASKED }))).toBe(ASKED);
  });
});
