/**
 * "Help shape Ferni" consent over the shared fake Firestore: it holds only for a standing
 * agreement before CALL_CAPTURE_UNTIL, with the flag on; withdrawing stamps the record and runs
 * onCaptureWithdrawn; askedAt survives a later agreement.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFakeFirestore } from '../../tests/helpers/fake-firestore.js';

const fake = await vi.hoisted(async () =>
  (await import('../../tests/helpers/fake-firestore.js')).newFakeFirestoreState()
);
vi.mock('../../utils/firestore-utils.js', async (importOriginal) => {
  const { createFakeFirestore } = await import('../../tests/helpers/fake-firestore.js');
  return {
    ...(await importOriginal<typeof import('../../utils/firestore-utils.js')>()),
    getFirestoreDb: createFakeFirestore(fake),
  };
});
const logged = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/safe-logger.js')>()),
  createLogger: () => ({ ...logged, child: () => logged }),
}));

const consent = await import('../call-capture-consent.js');
const { captureConsentHolds, captureUntil, markCaptureAsked, recordCaptureConsent } = consent;
const { onCaptureWithdrawn, withdrawCaptureConsent } = consent;

const ON = { CALL_CAPTURE_CONSENT: 'on' };
const NOW = new Date('2026-11-02T12:00:00.000Z');
const AGREE = {
  version: '2026-11-01',
  agreedAt: '2026-11-02T11:59:00.000Z',
  source: 'web' as const,
};
const stored = (uid: string) => fake.docs.get(`call_capture_consent/${uid}`);
const withdrawnLogs = () =>
  logged.info.mock.calls.filter(([, msg]) => msg === 'Call capture consent withdrawn');

beforeEach(() => {
  resetFakeFirestore(fake);
  vi.clearAllMocks();
});

describe('captureConsentHolds', () => {
  it('is false with no record', async () => {
    expect(stored('riley')).toBeUndefined();
    expect(await captureConsentHolds('riley', NOW, { env: ON })).toBe(false);
  });

  it('is true once the person agrees, and only for them', async () => {
    await recordCaptureConsent('riley', AGREE, { now: NOW });
    expect(await captureConsentHolds('riley', NOW, { env: ON })).toBe(true);
    expect(await captureConsentHolds('sam', NOW, { env: ON })).toBe(false);
  });

  it('is false after withdrawal, and the withdrawal hook ran once', async () => {
    await recordCaptureConsent('riley', AGREE, { now: NOW });
    expect(withdrawnLogs()).toHaveLength(0);

    const withdrawn = await withdrawCaptureConsent('riley', { now: NOW });

    expect(withdrawn?.withdrawnAt).toBe(NOW.toISOString());
    expect(await captureConsentHolds('riley', NOW, { env: ON })).toBe(false);
    expect(withdrawnLogs()).toHaveLength(1);
    // Count only, never who
    expect(JSON.stringify(withdrawnLogs()[0])).not.toContain('riley');
    // Withdrawing again changes nothing and runs no second deletion
    await withdrawCaptureConsent('riley');
    expect(withdrawnLogs()).toHaveLength(1);
  });

  it('the withdrawal hook logs a count, never who', async () => {
    onCaptureWithdrawn('riley');
    expect(withdrawnLogs()).toEqual([[{ withdrawn: 1 }, 'Call capture consent withdrawn']]);
  });

  it('withdrawing with no agreement is a no-op', async () => {
    expect(await withdrawCaptureConsent('riley')).toBeNull();
    expect(withdrawnLogs()).toHaveLength(0);
  });

  it('is false once now reaches CALL_CAPTURE_UNTIL (default 2027-03-01)', async () => {
    await recordCaptureConsent('riley', AGREE, { now: NOW });
    const end = new Date('2027-03-01T00:00:00.000Z');
    expect(captureUntil({}).toISOString()).toBe(end.toISOString());
    expect(await captureConsentHolds('riley', new Date(end.getTime() - 1), { env: ON })).toBe(true);
    expect(await captureConsentHolds('riley', end, { env: ON })).toBe(false);
    const renewed = { ...ON, CALL_CAPTURE_UNTIL: '2027-09-01' };
    expect(await captureConsentHolds('riley', end, { env: renewed })).toBe(true);
    const ended = { ...ON, CALL_CAPTURE_UNTIL: '2026-11-01' };
    expect(await captureConsentHolds('riley', NOW, { env: ended })).toBe(false);
  });

  it('an end date that is not a date falls back to the default, never to "forever"', () => {
    expect(captureUntil({ CALL_CAPTURE_UNTIL: 'someday' }).toISOString()).toBe(
      '2027-03-01T00:00:00.000Z'
    );
  });

  it('never holds while CALL_CAPTURE_CONSENT is off', async () => {
    await recordCaptureConsent('riley', AGREE, { now: NOW });
    expect(await captureConsentHolds('riley', NOW, { env: {} })).toBe(false);
    expect(await captureConsentHolds('riley', NOW, { env: { CALL_CAPTURE_CONSENT: 'off' } })).toBe(
      false
    );
  });

  it('an unreadable record means no consent', async () => {
    await recordCaptureConsent('riley', AGREE, { now: NOW });
    const broken = {
      collection: () => ({ doc: () => ({ get: async () => Promise.reject(new Error('down')) }) }),
    };
    expect(await captureConsentHolds('riley', NOW, { env: ON, db: broken as never })).toBe(false);
  });

  it('an "asked" record alone is not consent, and askedAt survives a later yes', async () => {
    await markCaptureAsked('riley', { now: NOW });
    expect(await captureConsentHolds('riley', NOW, { env: ON })).toBe(false);
    await recordCaptureConsent('riley', AGREE, { now: NOW });
    expect(stored('riley')).toMatchObject({ askedAt: NOW.toISOString(), source: 'web' });
  });
});
