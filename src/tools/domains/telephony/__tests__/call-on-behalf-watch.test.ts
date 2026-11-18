/**
 * The owner's call watches the call it places (CALL_RESULT_LIVE_REPORT across
 * workers, services/outreach/call-result-watch.ts): the real callOnBehalf tool
 * (through placeOrHold, deferred-calls.ts) starts the watch for a placed call, with the requesting call's id and the
 * placed call's id, and none for a call held for later.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async () => [
    { id: 'c-sam', name: 'Sam', phone: '(801) 555-0199', relationship: 'brother' },
  ]),
  upsertContact: vi.fn(async () => undefined),
}));
vi.mock('../../../../memory/entity-store/integration.js', () => ({
  isEntityStoreReady: () => false,
  findContactForTelephony: vi.fn(),
}));
vi.mock('../../../../services/global-services.js', () => ({ getGlobalServicesSync: () => null }));
vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => null,
}));
vi.mock('../../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => null,
}));
const watchCallResult = vi.hoisted(() => vi.fn((..._args: unknown[]) => null));
vi.mock('../../../../services/outreach/call-result-watch.js', () => ({ watchCallResult }));

const { createCallOnBehalfTool, registerOnBehalfCallInitiator } =
  await import('../call-on-behalf.js');

interface Exec {
  execute: (args: Record<string, unknown>, opts?: unknown) => Promise<unknown>;
}
const run = async () => {
  const tool = createCallOnBehalfTool({ userId: 'user-1', sessionId: 'sess-owner' } as never);
  return String(
    await (tool as Exec).execute({ contactQuery: 'my brother', purpose: 'say happy birthday' })
  );
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('callOnBehalf starts the owner call watch', () => {
  it('a placed call: watched from the call that asked for it', async () => {
    registerOnBehalfCallInitiator(async () => 'onbehalf_123_abcde');
    expect(await run()).toMatch(/calling Sam/);
    expect(watchCallResult).toHaveBeenCalledTimes(1);
    const [request, callId] = watchCallResult.mock.calls[0];
    expect(callId).toBe('onbehalf_123_abcde');
    expect(request).toMatchObject({ originalSessionId: 'sess-owner', userId: 'user-1' });
  });

  it('says how the result reaches them; flag off, the old line word for word (CALL_RESULT_WATCHDOG)', async () => {
    registerOnBehalfCallInitiator(async () => 'onbehalf_123_abcde');
    vi.stubEnv('CALL_RESULT_LIVE_REPORT', 'off');
    vi.stubEnv('CALL_RESULT_TEXT', 'off');
    const calling = "Got it! I'm calling Sam now to say happy birthday.";
    expect(await run()).toBe(`${calling} I'll let you know how it goes once the call is complete.`);
    vi.stubEnv('CALL_RESULT_WATCHDOG', 'on');
    expect(await run()).toBe(`${calling} You'll see how it went in the app.`);
  });

  it('a call held for later: nothing watched', async () => {
    registerOnBehalfCallInitiator(async () => 'deferred_123_abcde');
    expect(await run()).toMatch(/^Nothing was dialed yet/);
    expect(watchCallResult).not.toHaveBeenCalled();
  });
});
