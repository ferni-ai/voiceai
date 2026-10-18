/**
 * The dedicated token key (OAUTH_ENCRYPTION_KEY) seals; LOG_HASH_SECRET stays
 * on the ring as read-only legacy, so every envelope written before the switch
 * still opens until the migration re-seals it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keyIdOf, openEnvelope, tokenKeyId } from '../token-encryption.js';
import { openTokens, sealTokens } from '../token-at-rest.js';

const warn = vi.hoisted(() => vi.fn());
vi.mock('../safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() };
  return { createLogger: () => logger, getLogger: () => logger };
});

const NEW = 'fixture-dedicated-token-key';
const LEGACY = 'fixture-log-hash-secret';
const RAW = { access_token: 'fixture-access', refresh_token: 'fixture-refresh' };

const saved = { o: process.env.OAUTH_ENCRYPTION_KEY, l: process.env.LOG_HASH_SECRET };
function keys(o?: string, l?: string) {
  if (o === undefined) delete process.env.OAUTH_ENCRYPTION_KEY;
  else process.env.OAUTH_ENCRYPTION_KEY = o;
  if (l === undefined) delete process.env.LOG_HASH_SECRET;
  else process.env.LOG_HASH_SECRET = l;
}

describe('token keyring', () => {
  afterEach(() => keys(saved.o, saved.l));

  it('encrypts with OAUTH_ENCRYPTION_KEY when it is set', () => {
    keys(NEW, LEGACY);
    const sealed = sealTokens(RAW);
    expect(JSON.parse(sealed.encrypted).kid).toBe(keyIdOf(NEW));
    expect(tokenKeyId()).toBe(keyIdOf(NEW));
    keys(NEW, undefined); // opens with the new key alone
    expect(openTokens(sealed, 't')).toEqual(RAW);
  });

  it('decrypt falls back to the legacy LOG_HASH_SECRET for envelopes it sealed', () => {
    keys(undefined, LEGACY);
    const old = sealTokens(RAW);
    keys(NEW, LEGACY);
    expect(openTokens(old, 't')).toEqual(RAW);
    expect(openEnvelope(old.encrypted)?.kid).toBe(keyIdOf(LEGACY));
  });

  it('opens a pre-kid envelope by trying each key, new key first', () => {
    keys(undefined, LEGACY);
    const envelope = JSON.parse(sealTokens(RAW).encrypted) as Record<string, unknown>;
    delete envelope.kid;
    keys(NEW, LEGACY);
    expect(openEnvelope(JSON.stringify(envelope))).toEqual({ value: RAW, kid: keyIdOf(LEGACY) });
  });

  it('without the fallback the legacy envelopes would not open', () => {
    keys(undefined, LEGACY);
    const old = sealTokens(RAW);
    keys(NEW, undefined);
    expect(openTokens(old, 'oura_tokens')).toBeNull();
  });

  it('logs a kid that matches no key on the ring', () => {
    keys('some-other-key', undefined);
    const foreign = sealTokens(RAW);
    keys(NEW, LEGACY);
    warn.mockClear();
    expect(openTokens(foreign, 'oura_tokens')).toBeNull();
    expect(warn.mock.calls[0][0]).toMatchObject({
      store: 'oura_tokens',
      reason: 'kid-mismatch',
      envelopeKid: keyIdOf('some-other-key'),
      kid: keyIdOf(NEW),
    });
  });
});
