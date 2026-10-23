/**
 * Call start, on-behalf calls and their results never log what the caller or
 * the person called said, or who they are. A proactive call's triggerReason,
 * an on-behalf call's purpose, script and contact, the raw job metadata, a
 * parse error's quote of it, names from identification and the profile's
 * last conversation reached stderr (so Cloud Logging) or the safe logger,
 * whose redaction covers phone numbers only. Real paths throughout; every
 * channel is captured: stderr, stdout, console and the safe logger.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => ({ lines: [] as string[] }));
vi.mock('../../../utils/safe-logger.js', async (original) => {
  const real = await original<typeof import('../../../utils/safe-logger.js')>();
  const record =
    () =>
    (...args: unknown[]) => {
      logged.lines.push(JSON.stringify(args));
    };
  const logger = () => ({
    debug: record(),
    info: record(),
    warn: record(),
    error: record(),
    trace: record(),
    child: logger,
  });
  return { ...real, createLogger: logger, getLogger: logger };
});

const { parseJobMetadata, setupCallTypeContexts } = await import('../metadata-parser.js');
const startupLog = await import('../startup-log.js');
const { signDispatch } = await import('../../../services/outreach/on-behalf-dispatch.js');
const { identifyUser } = await import('../../voice-agent/user-identification-handler.js');
const { setOutboundCallContext } =
  await import('../../../intelligence/context-builders/external/outbound-call-context.js');
const { setProactiveSessionContext, proactiveSessionContextBuilder } =
  await import('../../../intelligence/context-builders/external/proactive-session-context.js');
const { initializeOnBehalfCapture } =
  await import('../../integrations/on-behalf-transcript-capture.js');
const { initializeTranscriptCapture } =
  await import('../../../services/outreach/call-transcript-intelligence.js');
const { captureCallResult } = await import('../../../services/outreach/call-result-capture.js');

const SECRET = 'lk-test-secret';
const REASON = 'you said you would file the divorce papers by Friday';
const PURPOSE = 'ask Dr. Patel about the biopsy results';
const SCRIPT = 'Tell them the lumpectomy is booked for Tuesday';
const SUMMARY = 'They cried about the miscarriage and the divorce';
const CONTACT = 'Rosalind Okafor';

function capture(): () => string {
  logged.lines = [];
  const out: string[] = [];
  const keep = (chunk: unknown) => {
    out.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stderr, 'write').mockImplementation(keep);
  vi.spyOn(process.stdout, 'write').mockImplementation(keep);
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void out.push(a.join(' ')));
  }
  return () => [...out, ...logged.lines].join('\n');
}

function neverSaid(all: string, secrets: string[]): void {
  for (const secret of secrets) expect(all).not.toContain(secret);
}

beforeEach(() => vi.stubEnv('LIVEKIT_API_SECRET', SECRET));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('call start logs no caller text', () => {
  it('a proactive call: the trigger kind and the length of its reason, never the reason', async () => {
    const dispatch = signDispatch(
      {
        type: 'proactive_outreach',
        userId: 'member-log-privacy',
        persona_id: 'ferni',
        triggerType: 'commitment_followup',
        triggerReason: REASON,
        relatedCommitment: { summary: REASON },
        lastSessionSummary: SUMMARY,
      },
      SECRET
    );
    const raw = JSON.stringify(dispatch);
    const text = capture();
    const parsed = parseJobMetadata({ job: { metadata: raw, room: {} } } as never);
    await setupCallTypeContexts(parsed.metadata, 'proactive_outreach', 'log-pro', undefined, raw);
    await proactiveSessionContextBuilder.build({ services: { sessionId: 'log-pro' } } as never);
    const all = text();
    expect(all).toContain('commitment_followup');
    expect(all).toContain(String(REASON.length));
    neverSaid(all, ['divorce', 'miscarriage', 'Friday']);
  });

  it('an inbound call: never the caller’s name or notes', async () => {
    const metadata = signDispatch(
      {
        type: 'inbound_call',
        callSid: 'CA-log',
        callerPhone: '+15555550123',
        callerName: CONTACT,
        notes: 'grieving her husband',
        isKnownCaller: true,
      },
      SECRET
    );
    const raw = JSON.stringify(metadata);
    const text = capture();
    const parsed = parseJobMetadata({ job: { metadata: raw, room: {} } } as never);
    await setupCallTypeContexts(parsed.metadata, 'inbound_call', 'log-in', undefined, raw);
    neverSaid(text(), ['Rosalind', 'Okafor', 'grieving', '5555550123']);
  });

  it('an on-behalf call: never the purpose, the script or the contact', async () => {
    const metadata = {
      type: 'on_behalf_call',
      callId: 'c-log',
      purpose: PURPOSE,
      objective: PURPOSE,
      script: SCRIPT,
      contact: { name: 'Dr. Patel', phone: '+15555550123' },
    };
    const raw = JSON.stringify(metadata);
    const text = capture();
    const parsed = parseJobMetadata({ job: { metadata: raw, room: {} } } as never);
    await setupCallTypeContexts(parsed.metadata, 'on_behalf_call', 'log-obc', undefined, raw);
    initializeOnBehalfCapture('log-obc');
    neverSaid(text(), ['biopsy', 'lumpectomy', 'Patel', '5555550123']);
  });

  it('metadata that does not parse: the error class and the length, never a quote of it', () => {
    // Node quotes the start of what it couldn't parse: here, the caller's words.
    const raw = `Rosalind said the lumpectomy is Tuesday ${REASON}`;
    const room = `Rosalind Okafor, persona maya`;
    const text = capture();
    parseJobMetadata({ job: { metadata: raw, room: { metadata: room } } } as never);
    const all = text();
    expect(all).toContain('SyntaxError');
    expect(all).toContain(`${raw.length} chars`);
    neverSaid(all, ['divorce', 'lumpectomy', 'Rosalind']);
  });

  it('the identity diagnostics: whether there is a name and a summary, never what they say', () => {
    const profile = { name: 'Sam Rivera', lastConversationSummary: SUMMARY, totalConversations: 3 };
    const diagnostics = {
      userIdFormat: 'member',
      hasProfile: true,
      hasName: true,
      hasVoiceSketch: false,
      isReturningUser: true,
      totalConversations: 3,
      onboardingComplete: true,
      issues: [],
    };
    const text = capture();
    startupLog.writeIdentityDiagnostics(
      'member-log-privacy',
      profile as never,
      diagnostics as never
    );
    const all = text();
    expect(all).toContain('hasName: YES');
    expect(all).toContain(`lastConversationSummary: YES (${SUMMARY.length} chars)`);
    neverSaid(all, ['Sam', 'Rivera', 'miscarriage', 'divorce']);
  });

  it('the participant line: the kind of participant, never a phone number', () => {
    const text = capture();
    startupLog.writeParticipantReady('early', 'sip_+15555550123');
    startupLog.writeParticipantReady('early', 'app_member-1');
    startupLog.writeParticipantReady('early', 'anonymous');
    const all = text();
    expect(all).toContain('(early): sip');
    expect(all).toContain('(early): app');
    expect(all).toContain('(early): other');
    neverSaid(all, ['5555550123', 'member-1']);
  });

  it('a collected tool call: its name and argument keys, never the values', () => {
    const args = JSON.stringify({ fact: SUMMARY, contactName: CONTACT });
    const all = [
      startupLog.toolCallText({ name: 'rememberAboutUser', arguments: args }, 0, 2),
      startupLog.toolCallText({ name: 'callContact', arguments: { purpose: PURPOSE } }, 1, 2),
      startupLog.toolCallText({ name: 'broken', arguments: `{"fact": "${SUMMARY}` }, 0, 1),
    ].join('\n');
    expect(all).toContain('keys fact, contactName');
    expect(all).toContain('keys purpose');
    neverSaid(all, ['miscarriage', 'Rosalind', 'biopsy']);
  });
});

describe('identification and on-behalf results log no names', () => {
  it("identification on a call placed for the user: never the contact's name", async () => {
    setOutboundCallContext('log-ident', {
      callId: 'c-ident',
      recipientName: CONTACT,
      recipientPhone: '+15555550123',
      purpose: PURPOSE,
      callType: 'personal',
      objective: PURPOSE,
      script: SCRIPT,
      complianceScript: '',
      mustConfirm: [],
      mustNotDo: [],
      informationToGather: [],
      userName: 'Sam Rivera',
      originalSessionId: '',
    } as never);
    const text = capture();
    await identifyUser({
      jobMetadata: JSON.stringify({ user_id: 'member-ident', user_name: 'Sam Rivera' }),
      room: { on: () => undefined, remoteParticipants: new Map() },
      sessionId: 'log-ident',
    } as never);
    const all = text();
    expect(all).toContain('hasName');
    neverSaid(all, ['Rosalind', 'Okafor', 'Sam Rivera', 'biopsy']);
  });

  it('identification with metadata that does not parse: never a quote of it', async () => {
    const text = capture();
    await identifyUser({
      jobMetadata: `${CONTACT} ${SUMMARY}`, // Node's parse error quotes the start of it
      room: { on: () => undefined, remoteParticipants: new Map() },
      sessionId: 'log-ident-bad',
    } as never);
    const all = text();
    expect(all).toContain('SyntaxError');
    neverSaid(all, ['Rosalind', 'miscarriage']);
  });

  it("a call's transcript and result: never the contact's name", async () => {
    const text = capture();
    initializeTranscriptCapture('c-result', CONTACT, 'doctor');
    await captureCallResult(
      'c-result',
      { callId: 'c-result', status: 'completed', objectiveAchieved: true, outcome: 'booked' },
      {
        contactQuery: 'my doctor',
        resolvedContact: { name: CONTACT, phone: '+15555550123' },
        purpose: PURPOSE,
        userId: 'member-result',
        userName: 'Sam',
        userTimezone: 'America/New_York',
        originalSessionId: '',
        recordingConsent: false,
      } as never
    ).catch(() => undefined);
    neverSaid(text(), ['Rosalind', 'Okafor', 'biopsy', '5555550123']);
  });
});

describe('the call reviewer’s metadata line (ferni_logs.py META_RE)', () => {
  const META_RE = /Raw job\.metadata = (\{.*\})/;

  it('carries only the allowlisted keys, and nothing from the rest of the dispatch', () => {
    const metadata = {
      type: 'proactive_outreach',
      persona_id: 'maya',
      source: 'app',
      user_id: 'voice-eval-7',
      firebase_uid: 'fb-123',
      timezone: 'America/Chicago',
      city: 'Austin',
      callerName: CONTACT,
      triggerReason: REASON,
      script: SCRIPT,
      callerPhone: '+15555550123',
    };
    const text = capture();
    parseJobMetadata({ job: { metadata: JSON.stringify(metadata), room: {} } } as never);
    const line = text()
      .split('\n')
      .find((l) => META_RE.test(l));
    expect(line).toBeDefined();
    const parsed = JSON.parse(META_RE.exec(line!)![1]) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(
      ['firebase_uid', 'persona_id', 'source', 'timezone', 'type', 'user_id'].sort()
    );
    expect(parsed).toMatchObject({ persona_id: 'maya', user_id: 'voice-eval-7' });
    for (const key of Object.keys(parsed)) {
      expect(startupLog.REVIEWER_METADATA_KEYS as readonly string[]).toContain(key);
    }
    neverSaid(line!, ['Austin', 'Rosalind', 'divorce', 'lumpectomy', '5555550123']);
  });

  it('a nested or long value in an allowlisted key is left out', () => {
    const line = startupLog.jobMetadataLine({
      persona_id: 'ferni',
      source: { note: SUMMARY },
      user_id: 'x'.repeat(500),
    });
    expect(line).toBe('Raw job.metadata = {"persona_id":"ferni"}');
  });
});
