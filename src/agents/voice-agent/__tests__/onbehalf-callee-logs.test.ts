/**
 * The person on a call Ferni places for a member (session `onbehalf:<callId>`) never signed
 * up: what they say and their name never reach a log line. Through the REAL loggers (the
 * global setup mocks safe-logger; this unmocks it): the LiveKit logger writes to stdout and
 * safe-logger to stderr under vitest, so every line the process writes is read back.
 *
 * The real transcript handler runs on a final transcript; only persisting writers are faked.
 * A member's turn is the control: its STT trace still carries the words (that line is
 * pending a product decision, call-log-surface-guard.test.ts), which proves the capture
 * sees the field when it is there.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../../../utils/safe-logger.js');

const w = vi.hoisted(() => ({
  bth: vi.fn(async () => ({})),
  ftis: vi.fn(async () => ({ handled: false })),
  fastCapture: vi.fn(async () => ({ mentionedEntities: [], asyncJobId: undefined })),
}));
vi.mock('../../integrations/better-than-human-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  processTranscriptForBetterThanHuman: w.bth,
}));
vi.mock('../../processors/tool-routing-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  runFTISRouting: w.ftis,
}));
const rec = await vi.hoisted(async () => {
  const { createWriteRecorder } = await import('../../../tests/helpers/write-recorder.js');
  return createWriteRecorder();
});
vi.mock('../../../utils/shared-firestore.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  sharedFirestore: () => rec.db,
}));
vi.mock('../../../memory/dynamic/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fastCapture: w.fastCapture,
  recordTurn: vi.fn(),
}));

import { createTranscriptHandler } from '../transcript-handler.js';
import {
  trackOutboundCall,
  removePendingCall,
} from '../../../services/outreach/outbound-call-tracker.js';
import { upsertContact } from '../../../services/contacts/contact-relationship-service.js';
import { contactIdForLog } from '../../../services/contacts/contact-log-id.js';

// Fictional: the words a called person says, with a name in them.
const SAID = 'Riley Test here, tell Marcus zqxcallee I will be home after six';
const WORDS = ['riley', 'marcus', 'zqxcallee', 'home after six'];

let out: string[];
beforeEach(() => {
  out = [];
  const keep = (chunk: string | Uint8Array): boolean => {
    out.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stdout, 'write').mockImplementation(keep);
  vi.spyOn(process.stderr, 'write').mockImplementation(keep);
});
afterEach(() => vi.restoreAllMocks());

/** Anything the handler touches that isn't under test: every property is a no-op. */
function stub(): never {
  const fn = (): unknown => proxy;
  const proxy: unknown = new Proxy(fn, {
    get: (_t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : proxy),
    apply: () => proxy,
  });
  return proxy as never;
}

let n = 0;
/** One final turn through the real handler; the log lines written while it ran. */
async function turn(userId: string): Promise<string> {
  const sessionId = `callee-logs-${++n}`;
  const { handler } = createTranscriptHandler({
    room: stub(),
    session: stub(),
    services: stub(),
    sessionPersona: { id: 'ferni', name: 'Ferni' } as never,
    conversationManager: { isAgentSpeaking: () => false } as never,
    voiceHumanization: null,
    userData: { userId, turnCount: 2 } as never,
    userId,
    sessionId,
    silenceContext: { topicsDiscussed: [], memorableMoments: [] } as never,
    dynamicToolLoader: {
      processMessage: async () => [],
      getLoadedDomains: () => [],
      getToolsForDomains: () => ({}),
    },
    agent: stub(),
    autoOptimizer: { processUserMessage: vi.fn() },
  });
  handler({ transcript: SAID, isFinal: true } as never);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 400);
  });
  return out.join('');
}

const carried = (text: string): string[] => WORDS.filter((x) => text.toLowerCase().includes(x));

describe('the called person on an on-behalf call, through the real loggers', () => {
  it("the STT trace logs the turn's length, never the words or a name in them", async () => {
    const written = await turn('onbehalf:test-call-0101');
    expect(written).toContain('E2E_USER_INPUT'); // the line ran
    expect(written).toContain(`"fullLength":${SAID.length}`);
    expect(carried(written)).toEqual([]);
  });

  it("control: a member's turn still carries its words there (so the capture sees them)", async () => {
    const written = await turn('member-uid-0102');
    expect(written).toContain('E2E_USER_INPUT');
    expect(carried(written)).toContain('zqxcallee');
  });

  it("tracking the placed call logs the call ids, never the contact's name", () => {
    trackOutboundCall('ext-0103', {
      callId: 'call-0103',
      userId: 'member-uid-0103',
      contactName: 'Riley Test',
      purpose: 'ask Marcus about dinner',
      objective: 'deliver_message' as never,
      callType: 'personal',
      originalSessionId: 'session-0103',
      startedAt: new Date(0).toISOString(),
    });
    removePendingCall('ext-0103');
    const written = out.join('');
    expect(written).toContain('Tracking outbound on-behalf call');
    expect(written).toContain('call-0103');
    expect(carried(written)).toEqual([]);
  });

  it("saving the called contact to the member's list logs neither name nor number", async () => {
    // As call-on-behalf.ts saveContactForFuture saves a number the member gave.
    await upsertContact('member-uid-0104', {
      name: 'Riley Test',
      contactId: 'phone_+15555550142',
      phone: '+15555550142',
      relationship: 'friend',
    });
    const written = out.join('');
    expect(written).toContain('Contact saved');
    expect(written).toContain('"hasName":true');
    expect(carried(written)).toEqual([]);
    expect(written).not.toMatch(/5550142/);
  });

  it('a contact id built from a number or an address logs as its kind only', () => {
    expect(contactIdForLog('phone_+15555550142')).toBe('phone');
    expect(contactIdForLog('riley@example.com')).toBe('email');
    expect(contactIdForLog('contact_1793560000000_abc1234')).toBe('contact_1793560000000_abc1234');
  });
});
