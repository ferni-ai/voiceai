/**
 * Call start never logs what the caller said. A proactive call's
 * triggerReason, an on-behalf call's purpose, the raw job metadata (which
 * carries both, plus commitments and the last talk) and the profile's last
 * conversation summary went to stderr, so to Cloud Logging, on every call,
 * past the safe logger's redaction. Real paths: parseJobMetadata and
 * setupCallTypeContexts, and the identity diagnostics and participant line
 * voice-agent-entry/index.ts writes. Every channel is captured: stderr,
 * stdout, console and the safe logger.
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
    child: logger,
  });
  return { ...real, createLogger: logger, getLogger: logger };
});

const { parseJobMetadata, setupCallTypeContexts } = await import('../metadata-parser.js');
const { identityDiagnosticsText, participantKind } = await import('../startup-log.js');
const { signDispatch } = await import('../../../services/outreach/on-behalf-dispatch.js');

const SECRET = 'lk-test-secret';
const REASON = 'you said you would file the divorce papers by Friday';
const PURPOSE = 'ask Dr. Patel about the biopsy results';
const SUMMARY = 'They cried about the miscarriage and the divorce';

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
    const all = text();
    expect(all).toContain('commitment_followup');
    expect(all).toContain(String(REASON.length));
    for (const secret of ['divorce', 'miscarriage', 'Friday']) expect(all).not.toContain(secret);
  });

  it("an inbound call: never the caller's name or notes", async () => {
    const metadata = signDispatch(
      {
        type: 'inbound_call',
        callSid: 'CA-log',
        callerPhone: '+15555550123',
        callerName: 'Rosalind Okafor',
        notes: 'grieving her husband',
        isKnownCaller: true,
      },
      SECRET
    );
    const raw = JSON.stringify(metadata);
    const text = capture();
    const parsed = parseJobMetadata({ job: { metadata: raw, room: {} } } as never);
    await setupCallTypeContexts(parsed.metadata, 'inbound_call', 'log-in', undefined, raw);
    const all = text();
    for (const secret of ['Rosalind', 'Okafor', 'grieving', '5555550123']) {
      expect(all).not.toContain(secret);
    }
  });

  it('an on-behalf call: never the purpose or the contact', async () => {
    const metadata = {
      type: 'on_behalf_call',
      callId: 'c-log',
      purpose: PURPOSE,
      contact: { name: 'Dr. Patel', phone: '+15555550123' },
    };
    const raw = JSON.stringify(metadata);
    const text = capture();
    const parsed = parseJobMetadata({ job: { metadata: raw, room: {} } } as never);
    await setupCallTypeContexts(parsed.metadata, 'on_behalf_call', 'log-obc', undefined, raw);
    const all = text();
    for (const secret of ['biopsy', 'Patel', '5555550123']) expect(all).not.toContain(secret);
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
    const all = identityDiagnosticsText(
      'member-log-privacy',
      profile as never,
      diagnostics as never
    );
    expect(all).toContain('hasName: YES');
    expect(all).toContain(`lastConversationSummary: YES (${SUMMARY.length} chars)`);
    for (const secret of ['Sam', 'Rivera', 'miscarriage', 'divorce']) {
      expect(all).not.toContain(secret);
    }
  });

  it('the participant line: the kind of participant, never a phone number', () => {
    expect(participantKind('sip_+15555550123')).toBe('sip');
    expect(participantKind('app_member-1')).toBe('app');
    expect(participantKind('anonymous')).toBe('other');
  });
});
