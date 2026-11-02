/**
 * setCallCaptureConsent: the proven owner's spoken yes or no is recorded; every refusal (not the
 * owner, a crisis read on the call, any sign of a minor, flag off) writes nothing. The crisis and
 * minor signals are the real in-process modules; only Firestore and the shared hold's store are
 * doubles.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFakeFirestore } from '../../../tests/helpers/fake-firestore.js';

const fake = await vi.hoisted(async () =>
  (await import('../../../tests/helpers/fake-firestore.js')).newFakeFirestoreState()
);
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => {
  const { createFakeFirestore } = await import('../../../tests/helpers/fake-firestore.js');
  return {
    ...(await importOriginal<typeof import('../../../utils/firestore-utils.js')>()),
    getFirestoreDb: createFakeFirestore(fake),
  };
});

const { setCaptureConsentByVoice, withCaptureConsentTool, SET_CALL_CAPTURE_CONSENT } =
  await import('../call-capture-tool.js');
const { noteCrisisRisk, resetCrisisCallRisk, trackCrisisRead } =
  await import('../../../services/safety/crisis-call-risk.js');
const { bindSessionUser, noteCallerWords, resetMinorCare } =
  await import('../../../utils/minor-care.js');
const { setHoldStore } = await import('../../../services/outreach/minor-care-shared-hold.js');
const { isEssentialTool } = await import('../../../config/tool-config.js');
const { recordCaptureConsent } = await import('../../../services/call-capture-consent.js');

const UID = 'riley-test-uid';
const SESSION = 'call-riley-1';
const owner = { userId: UID, verifiedCaller: true };
const stored = () => fake.docs.get(`call_capture_consent/${UID}`);

beforeEach(() => {
  resetFakeFirestore(fake);
  resetCrisisCallRisk();
  resetMinorCare();
  setHoldStore({ heldUntil: async () => undefined, write: async () => undefined });
  vi.stubEnv('CALL_CAPTURE_CONSENT', 'on');
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
});
afterEach(() => {
  setHoldStore();
  vi.unstubAllEnvs();
});

describe('the verified owner', () => {
  it('yes records consent by voice and stamps askedAt', async () => {
    const result = await setCaptureConsentByVoice(true, { userData: owner, sessionId: SESSION });
    expect(result.status).toBe('agreed');
    expect(stored()).toMatchObject({
      uid: UID,
      source: 'voice',
      version: '2026-11-01',
      askedAt: expect.any(String),
    });
    expect(stored()?.withdrawnAt).toBeUndefined();
  });

  it('no after a yes withdraws; no with nothing to withdraw only notes the ask', async () => {
    await setCaptureConsentByVoice(true, { userData: owner, sessionId: SESSION });
    expect(
      (await setCaptureConsentByVoice(false, { userData: owner, sessionId: SESSION })).status
    ).toBe('withdrawn');
    expect(stored()?.withdrawnAt).toEqual(expect.any(String));

    resetFakeFirestore(fake);
    expect(
      (await setCaptureConsentByVoice(false, { userData: owner, sessionId: SESSION })).status
    ).toBe('declined');
    expect(stored()).toEqual({ uid: UID, askedAt: expect.any(String) });
  });
});

describe('refusals write nothing', () => {
  it.each([
    ['a caller the server did not verify', { userId: UID, verifiedCaller: false }],
    ['a session with no verified bit', { userId: UID }],
    ['an anon caller marked verified', { userId: 'anon:abc', verifiedCaller: true }],
    ['a family member a sponsor set up', { userId: 'family_sp1', verifiedCaller: true }],
    ['a test or eval account', { userId: 'voice-eval-riley', verifiedCaller: true }],
  ])('%s', async (_label, userData) => {
    const result = await setCaptureConsentByVoice(true, { userData, sessionId: SESSION });
    expect(result.status).toBe('not_owner');
    expect(fake.docs.size).toBe(0);
  });

  it('the answerer of a call Ferni placed (PLACED_CALL_NOT_OWNER_PROOF on)', async () => {
    vi.stubEnv('PLACED_CALL_NOT_OWNER_PROOF', 'on');
    const placed = { ...owner, placedCall: true };
    const result = await setCaptureConsentByVoice(true, { userData: placed, sessionId: SESSION });
    expect(result.status).toBe('not_owner');
    expect(fake.docs.size).toBe(0);
  });

  it('crisis risk noted on the call', async () => {
    noteCrisisRisk(SESSION);
    const result = await setCaptureConsentByVoice(true, { userData: owner, sessionId: SESSION });
    expect(result.status).toBe('crisis');
    expect(fake.docs.size).toBe(0);
  });

  it('a crisis read still in flight on the call', async () => {
    void trackCrisisRead(
      SESSION,
      'i do not know',
      new Promise<never>(() => {
        /* a read that never answers */
      })
    );
    const result = await setCaptureConsentByVoice(true, { userData: owner, sessionId: SESSION });
    expect(result.status).toBe('crisis');
    expect(fake.docs.size).toBe(0);
  });

  it('the caller said they are under 18 on this call', async () => {
    expect(noteCallerWords(SESSION, "I'm 15 years old", { userId: UID })).toBe(true);
    const result = await setCaptureConsentByVoice(true, { userData: owner, sessionId: SESSION });
    expect(result.status).toBe('minor');
    expect(fake.docs.size).toBe(0);
  });

  it('the same person sounded under 18 on another live call (shared hold off)', async () => {
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'off'); // sharedHeldStrict reads userHeld itself when on
    expect(noteCallerWords('call-riley-0', "I'm 15 years old", { userId: UID })).toBe(true);
    bindSessionUser('call-riley-0', UID);
    const result = await setCaptureConsentByVoice(true, { userData: owner, sessionId: SESSION });
    expect(result.status).toBe('minor');
    expect(fake.docs.size).toBe(0);
  });

  it('a minor-care hold from another call (the shared hold)', async () => {
    setHoldStore({ heldUntil: async () => Date.now() + 60_000, write: async () => undefined });
    const result = await setCaptureConsentByVoice(true, { userData: owner, sessionId: SESSION });
    expect(result.status).toBe('minor');
    expect(fake.docs.size).toBe(0);
  });

  it('a shared hold that cannot be read counts as held', async () => {
    setHoldStore({
      heldUntil: async () => Promise.reject(new Error('down')),
      write: async () => undefined,
    });
    const result = await setCaptureConsentByVoice(true, { userData: owner, sessionId: SESSION });
    expect(result.status).toBe('minor');
    expect(fake.docs.size).toBe(0);
  });

  it('the flag is off', async () => {
    vi.stubEnv('CALL_CAPTURE_CONSENT', 'off');
    const result = await setCaptureConsentByVoice(true, { userData: owner, sessionId: SESSION });
    expect(result.status).toBe('off');
    expect(fake.docs.size).toBe(0);
  });
});

describe('a no always turns it off, like DELETE', () => {
  const agreed = () =>
    recordCaptureConsent(UID, {
      version: '2026-11-01',
      agreedAt: '2026-11-01T00:00:00.000Z',
      source: 'web',
    });

  it('under a minor-care hold', async () => {
    await agreed();
    setHoldStore({ heldUntil: async () => Date.now() + 60_000, write: async () => undefined });
    const result = await setCaptureConsentByVoice(false, { userData: owner, sessionId: SESSION });
    expect(result.status).toBe('withdrawn');
    expect(stored()?.withdrawnAt).toEqual(expect.any(String));
    expect(stored()?.askedAt).toBeUndefined();
  });

  it('during a crisis read', async () => {
    await agreed();
    noteCrisisRisk(SESSION);
    const result = await setCaptureConsentByVoice(false, { userData: owner, sessionId: SESSION });
    expect(result.status).toBe('withdrawn');
    expect(stored()?.withdrawnAt).toEqual(expect.any(String));
  });

  it('under a hold with nothing to withdraw, writes nothing', async () => {
    expect(noteCallerWords(SESSION, "I'm 15 years old", { userId: UID })).toBe(true);
    const result = await setCaptureConsentByVoice(false, { userData: owner, sessionId: SESSION });
    expect(result.status).toBe('declined');
    expect(fake.docs.size).toBe(0);
  });

  it('a yes that a later withdrawal outranks is not saved', async () => {
    const withdrawnAt = new Date(Date.now() + 60_000).toISOString(); // another instance, clock ahead
    fake.docs.set(`call_capture_consent/${UID}`, {
      uid: UID,
      version: '2026-11-01',
      agreedAt: '2026-11-01T00:00:00.000Z',
      withdrawnAt,
    });
    const result = await setCaptureConsentByVoice(true, { userData: owner, sessionId: SESSION });
    expect(result.status).toBe('not_saved');
    expect(stored()?.withdrawnAt).toBe(withdrawnAt);
  });
});

describe('offered to the agent', () => {
  it('only while CALL_CAPTURE_CONSENT is on, and then never capped out', () => {
    const tools = { getWeather: {} };
    vi.stubEnv('CALL_CAPTURE_CONSENT', 'off');
    expect(withCaptureConsentTool(tools, { sessionId: SESSION })).toBe(tools);
    expect(isEssentialTool(SET_CALL_CAPTURE_CONSENT)).toBe(false);

    vi.stubEnv('CALL_CAPTURE_CONSENT', 'on');
    const offered = withCaptureConsentTool(tools, { sessionId: SESSION });
    expect(Object.keys(offered)).toEqual(['getWeather', SET_CALL_CAPTURE_CONSENT]);
    expect(isEssentialTool(SET_CALL_CAPTURE_CONSENT)).toBe(true);
  });

  it('is not open to a phone-only caller', async () => {
    const { phoneSafeTool } = await import('../../shared/phone-safe-tools.js');
    expect(phoneSafeTool(SET_CALL_CAPTURE_CONSENT)).toBe(false);
  });
});
