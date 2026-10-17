/**
 * Test double for guarded-text's Firestore: the real guards over an in-memory
 * store, sending through the (mocked) sms-delivery sendSMS. Use it in a test
 * that drives a tool or job which texts someone:
 *
 *   vi.mock('<path>/services/outreach/guarded-text.js', async (orig) =>
 *     (await import('<path>/services/outreach/__tests__/memory-text-store.js')).withMemoryTextStore(await orig()));
 *
 * and call resetMemoryTexts() between tests (the 10-minute gap reads what was sent).
 */
import type * as GuardedText from '../guarded-text.js';
import { phoneHash, toE164, type CheckinRecord, type StoredCheckin } from '../checkin-replies.js';
// Static: concurrent dynamic imports of a mocked module can resolve the real one.
import { sendSMS } from '../delivery/sms-delivery.js';
import { atomicClaims } from './atomic-claims.js';

const ENV = { LOG_HASH_SECRET: 'test-secret' };
const sent: StoredCheckin[] = [];
const optedOut = new Set<string>();
let claims = atomicClaims(sent);

export function resetMemoryTexts(): void {
  sent.length = 0;
  optedOut.clear();
  claims = atomicClaims(sent);
}

/** As if `phone` had replied STOP. */
export function memoryOptOut(phone: string): void {
  optedOut.add(phoneHash(toE164(phone) ?? phone, ENV) ?? '');
}

function memoryDeps(send?: GuardedText.TextDeps['send']): GuardedText.TextDeps {
  return {
    env: { ...process.env, ...ENV },
    store: {
      isOptedOut: async (h: string) => optedOut.has(h),
      forPhoneHash: async (h: string) => sent.filter((r) => r.phoneHash === h),
      forUser: async (u: string) => sent.filter((r) => r.userId === u),
      userDoc: async () => undefined,
      legacySmsChannels: async () => undefined,
      sponsoredPhone: async () => undefined,
      add: async (r: CheckinRecord) => {
        sent.push({ ...r, id: `t${sent.length}` });
        return `t${sent.length}`;
      },
      ...claims,
    } as unknown as GuardedText.TextStore,
    authPhone: async () => undefined,
    send: send ?? ((m) => sendSMS(m)),
    now: () => new Date(),
  };
}

export function withMemoryTextStore(real: typeof GuardedText): typeof GuardedText {
  return {
    ...real,
    textOnBehalf: (t, d) => real.textOnBehalf(t, memoryDeps(d?.send)),
    sendOnBehalfText: (t, d) => real.sendOnBehalfText(t, memoryDeps(d?.send)),
  };
}
