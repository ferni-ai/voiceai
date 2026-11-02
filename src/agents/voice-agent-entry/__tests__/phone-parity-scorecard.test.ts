/**
 * Phone vs app parity scorecard.
 *
 * The same person starts a call three ways through the real session-start
 * path: from the app (dispatch names the account, browser zone), by phone from
 * their own number with a signed attestation A (CALLER_RECOGNITION), and by
 * phone from that number with no signed attestation (a spoofable caller ID).
 * Each row reads what the call actually gets: identifyUser's result, the zone
 * settleCallerZone puts on userData and on the memory writers, the greeting
 * facts, the prompt's date/time section, the turn-1 commitment prefetch and
 * the STT turn detection. Only Firebase Auth, the attestation check and the
 * Firestore-backed services are faked. Places no call.
 *
 * SCORECARD=1 prints the table.
 */
import type { Room } from '@livekit/rtc-node';
import { ParticipantKind } from '@livekit/rtc-node';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { getFirebaseUserByPhone, identifyFromMetadata, prefetchUserCommitments } = vi.hoisted(
  () => ({
    getFirebaseUserByPhone: vi.fn(),
    identifyFromMetadata: vi.fn(),
    prefetchUserCommitments: vi.fn(async (_userId: string | undefined) => {}),
  })
);

vi.mock('../../../services/identity/firebase-auth.js', () => ({ getFirebaseUserByPhone }));
vi.mock('../../../services/identity/user-identification.js', () => ({ identifyFromMetadata }));
vi.mock('../../../services/superhuman/commitment-prefetch.js', () => ({ prefetchUserCommitments }));
vi.mock('../../../services/trust-and-identity/voice-agent-integration.js', () => ({
  onSessionStart: async () => ({ identityContext: {} }),
}));
vi.mock('../../../services/voice/voice-speaker-change.js', () => ({
  getSpeakerChangeDetector: () => ({ on: vi.fn(), start: vi.fn() }),
}));
vi.mock('../../../tools/domains/entertainment/spotify.js', () => ({ setStreamIntoCall: () => {} }));

const { identifyUser } = await import('../../voice-agent/user-identification-handler.js');
const { productionRecognitionDeps } = await import('../caller-recognition.js');
const { settleCallerZone } = await import('../phone-parity.js');
const { trackDeferredProfileLoad } = await import('../../../services/session/deferred-profile.js');
const { greetingFacts, partOfDayFor } = await import('../../multi-agent/greeting-direction.js');
const { callerHour, timeContext } = await import('../../shared/time-context.js');
const { callerTimeZoneFor } = await import('../../../memory/operations/call-moment.js');
const { buildCascadeSTTOptions } = await import('../../model-provider/cartesia-cascade.js');

const SETH = '+15555550100';
const ZONE = 'America/New_York';
const PROFILE = { name: 'Seth Ford', contactInfo: { timezone: ZONE } };
const realSigned = productionRecognitionDeps.signedAttestation;
const NOW = new Date('2026-10-11T23:30:00Z'); // 7:30 pm in New York

type Way = 'app' | 'phone, signed A' | 'phone, unsigned';
type Row = Record<string, boolean>;

function roomWith(participant: object | null): Room {
  return {
    remoteParticipants: new Map(participant ? [['caller', participant]] : []),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as Room;
}

const sipCaller = {
  identity: `sip_${SETH}`,
  kind: ParticipantKind.SIP,
  attributes: { 'sip.phoneNumber': SETH, 'sip.callStatus': 'active' } as Record<string, string>,
};

let n = 0;
/** Start one call the given way and read back what it got. */
async function startCall(way: Way): Promise<Row> {
  const sessionId = `parity-${n++}`;
  const app = way === 'app';
  productionRecognitionDeps.signedAttestation = async (_p, e164) =>
    way === 'phone, signed A' && e164 === SETH ? 'A' : null;
  // The app's dispatch names the account and carries the browser zone; the
  // prod SIP dispatch rule carries only the persona.
  const jobMetadata = app
    ? JSON.stringify({ userId: 'user-seth', timezone: ZONE })
    : JSON.stringify({ persona_id: 'ferni' });
  identifyFromMetadata.mockResolvedValue(
    app
      ? { userId: 'user-seth', source: { type: 'firebase' }, profile: PROFILE }
      : { userId: undefined, source: { type: 'anonymous' } }
  );
  prefetchUserCommitments.mockClear();

  const who = await identifyUser({
    jobMetadata,
    room: roomWith(app ? null : sipCaller),
    sessionId,
  });
  // The multi-agent fast path (the default) loads an identified account's
  // profile after session start; none for an anonymous caller.
  const services: { userProfile: typeof PROFILE | null; realtimeConversationId: string } = {
    userProfile: null,
    realtimeConversationId: `conv-${sessionId}`,
  };
  if (who.userId)
    trackDeferredProfileLoad(
      services,
      Promise.resolve().then(() => void (services.userProfile = PROFILE))
    );
  const userData: { callerTimezone?: string } = {};
  const call = { sessionId, userId: who.userId, onBehalf: false };
  await settleCallerZone(call, app ? ZONE : undefined, services, userData);

  const hour = callerHour(NOW, userData.callerTimezone);
  const facts = greetingFacts(hour === null ? '' : partOfDayFor(hour), who.userName, undefined);
  const stt = buildCascadeSTTOptions({}, { phone: !app });
  const appStt = buildCascadeSTTOptions({}, {});
  return {
    'account identified (memory, profile)': who.userId === 'user-seth',
    'greeting uses their name':
      facts['their name'] === 'Seth' || facts['their name'] === 'Seth Ford',
    'greeting knows time of day': facts['time of day'] === 'evening',
    'prompt has their local time': !timeContext(NOW, userData.callerTimezone).includes(
      "You don't know the caller's local time"
    ),
    'memories dated in their zone': callerTimeZoneFor(sessionId) === ZONE,
    'turn-1 commitments prefetched': prefetchUserCommitments.mock.calls.some(
      ([id]) => id === 'user-seth'
    ),
    'STT turn detection as app':
      JSON.stringify(stt.turnDetection) === JSON.stringify(appStt.turnDetection),
  };
}

const card: Array<{ way: Way; row: Row }> = [];
async function scored(way: Way): Promise<Row> {
  const row = await startCall(way);
  card.push({ way, row });
  return row;
}

describe('phone vs app parity scorecard', () => {
  beforeEach(() => {
    process.env.CALLER_RECOGNITION = 'on';
    getFirebaseUserByPhone.mockReset();
    getFirebaseUserByPhone.mockImplementation(async (e164: string) =>
      e164 === SETH ? { uid: 'user-seth', displayName: 'Seth Ford' } : null
    );
  });
  afterAll(() => {
    delete process.env.CALLER_RECOGNITION;
    productionRecognitionDeps.signedAttestation = realSigned;
    if (process.env.SCORECARD !== '1') return;
    const rows = Object.keys(card[0].row);
    const cols = card.map((c) => c.way);
    const lines = [`| | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`];
    for (const r of rows)
      lines.push(`| ${r} | ${card.map((c) => (c.row[r] ? 'yes' : 'no')).join(' | ')} |`);
    process.stdout.write(`\n${lines.join('\n')}\n`);
  });

  it('the app gets everything', async () => {
    expect(Object.values(await scored('app')).every(Boolean)).toBe(true);
  });

  it('a recognised phone caller is named and dated, but gets no local time or turn-1 prefetch', async () => {
    const row = await scored('phone, signed A');
    expect(row['account identified (memory, profile)']).toBe(true);
    expect(row['greeting uses their name']).toBe(true);
    expect(row['greeting knows time of day']).toBe(false);
    expect(row['prompt has their local time']).toBe(false);
    expect(row['memories dated in their zone']).toBe(true);
    expect(row['turn-1 commitments prefetched']).toBe(false);
  });

  it('an unsigned call from the same number gets nothing from the account', async () => {
    const row = await scored('phone, unsigned');
    expect(row['account identified (memory, profile)']).toBe(false);
    expect(row['greeting uses their name']).toBe(false);
    expect(row['greeting knows time of day']).toBe(false);
    expect(row['memories dated in their zone']).toBe(false);
    expect(row['turn-1 commitments prefetched']).toBe(false);
  });

  it('production has no signed-attestation check wired yet: no phone caller is recognised', async () => {
    productionRecognitionDeps.signedAttestation = realSigned;
    expect(await realSigned(sipCaller, SETH)).toBeNull();
  });
});
