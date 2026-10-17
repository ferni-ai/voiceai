/**
 * An unrecognised caller gets ONE anonymous id for the whole session, and two
 * sessions never share one.
 *
 * Every identifyFromMetadata call used to mint `anon:${Date.now()}`. A session
 * calls it several times on the same parsed dispatch (the voice agent's
 * identifyUser, then the identity session, then natural auth through
 * identifyWithVoice), so one phone caller got ids 30 ms apart, and memory
 * written under one was never read under the other. Sessions that started in
 * the same millisecond shared an id. Date.now is pinned in the collision tests
 * so the old code fails them deterministically.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryStore } from '../../../memory/storage/in-memory-store.js';
import { UserIdentificationService } from '../../di/user-identification-di.js';
import { isSuccess } from '../../../types/index.js';

const store = new InMemoryStore();
vi.mock('../../../memory/firestore-store.js', () => ({ getFirestoreStore: () => store }));
vi.mock('../identity-linking.js', () => ({ autoLinkOnAuth: vi.fn(async () => undefined) }));

const { identifyFromMetadata, setGlobalStore } = await import('../user-identification.js');
const { identifyWithVoice } = await import('../../voice/voice-identification.js');

/** What an inbound SIP rule sends: fixed, so every stranger's dispatch looks the same */
const sipDispatch = (): Record<string, unknown> => ({ source: 'sip', persona_id: 'ferni' });

beforeEach(() => setGlobalStore(store));
afterEach(() => vi.restoreAllMocks());

describe('one anonymous id per session', () => {
  it('every identification path in one session returns the same id', async () => {
    const metadata = sipDispatch();

    const first = await identifyFromMetadata(metadata);
    // The identity session's own call, later in the same session
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 30);
    const identitySession = await identifyFromMetadata(metadata);
    // Natural auth's call, through voice identification
    const naturalAuth = await identifyWithVoice(metadata, store, null);

    expect(first.source.type).toBe('anonymous');
    expect(first.userId).toMatch(/^anon:[0-9a-f-]{36}$/);
    expect(identitySession.userId).toBe(first.userId);
    expect(naturalAuth.userId).toBe(first.userId);
  });

  it('two strangers with identical dispatch metadata get different ids', async () => {
    const a = await identifyFromMetadata(sipDispatch());
    const b = await identifyFromMetadata(sipDispatch());
    expect(a.userId).not.toBe(b.userId);
  });

  it('sessions starting in the same millisecond never collide', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_760_400_000_000);
    const ids = await Promise.all(
      Array.from({ length: 500 }, async () => (await identifyFromMetadata(sipDispatch())).userId)
    );
    expect(new Set(ids).size).toBe(500);
  });

  it('keeps a session_id the dispatch already carries', async () => {
    const result = await identifyFromMetadata({ session_id: 'onbehalf:call-1' });
    expect(result.userId).toBe('onbehalf:call-1');
  });
});

describe('DI identifyByWebSession anonymous ids', () => {
  it('two unvalidated web sessions in the same millisecond get different ids', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_760_400_000_000);
    const service = new UserIdentificationService({ store });
    const [a, b] = await Promise.all([
      service.identifyByWebSession('token-a'),
      service.identifyByWebSession('token-b'),
    ]);
    if (!isSuccess(a) || !isSuccess(b)) throw new Error('identification failed');
    expect(a.data.userId).toMatch(/^anon:/);
    expect(a.data.userId).not.toBe(b.data.userId);
  });
});

describe('a dispatch session_id is only ever anonymous', () => {
  it('prefixes a session_id that could name a real account', async () => {
    const result = await identifyFromMetadata({ session_id: 'victim-uid-0000000000000000' });
    expect(result.userId).toBe('anon:victim-uid-0000000000000000');
    expect(result.profile).toBeNull();
  });

  it('keeps session ids that already name no account', async () => {
    expect((await identifyFromMetadata({ session_id: 'anon:abc' })).userId).toBe('anon:abc');
    expect((await identifyFromMetadata({ session_id: 'onbehalf:c1' })).userId).toBe('onbehalf:c1');
  });

  it('mints an id when session_id is not a usable string', async () => {
    const { userId } = await identifyFromMetadata({ session_id: 42 });
    expect(userId).toMatch(/^anon:[0-9a-f-]{36}$/);
  });
});
