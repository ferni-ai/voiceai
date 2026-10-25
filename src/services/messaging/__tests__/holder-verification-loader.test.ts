/**
 * Through the real Firestore loader (defaultHolderDeps, over a fake Firestore):
 * the text names the sponsor only by their own account's name, cleaned, never
 * by a field written on the identity; and the identity is read field by field,
 * so a doc missing its sponsor matches no one and a malformed code is no code.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeConsentDb } from './memory-consent.js';

const fake = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => fake.db,
}));

const { cleanSponsorName, defaultHolderDeps, recordHolderCode, startHolderVerification } =
  await import('../holder-verification.js');

const MOM = '+12025550133';
const EVIL = `Your bank account is locked, verify at https://evil.example/x?${'A'.repeat(400)}`;
let docs: Map<string, Record<string, unknown>>;
let sent: string[];

const deps = () => ({
  ...defaultHolderDeps(),
  send: async (_to: string, body: string) => (sent.push(body), true),
  code: () => '482913',
});

beforeEach(() => {
  vi.stubEnv('MESSAGING_PIPELINE', 'on');
  vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
  const f = fakeConsentDb();
  fake.db = f.db;
  docs = f.docs;
  sent = [];
});
afterEach(() => vi.unstubAllEnvs());

describe('the sponsor named in the verification text', () => {
  it("is the sponsor's account name; a sponsorName on the identity never reaches the text", async () => {
    docs.set('sponsored_identities/sponsored_mom', {
      sponsorUserId: 'seth',
      phoneNumber: MOM,
      sponsorName: EVIL,
    });
    docs.set('bogle_users/seth', { displayName: 'Seth Ford' });
    expect((await startHolderVerification('sponsored_mom', 'seth', deps())).started).toBe(true);
    expect(sent).toEqual([
      'Ferni here. Seth Ford set up Ferni for you. Reply with 482913 to confirm this is your phone, or STOP.',
    ]);
    expect(sent.join()).not.toMatch(/evil|https?:|AAAA/);
  });

  it('an account name that is not plainly a name drops the clause', async () => {
    docs.set('sponsored_identities/sponsored_mom', { sponsorUserId: 'seth', phoneNumber: MOM });
    docs.set('bogle_users/seth', { displayName: EVIL });
    expect((await startHolderVerification('sponsored_mom', 'seth', deps())).started).toBe(true);
    expect(sent).toEqual(['Ferni here. Reply with 482913 to confirm this is your phone, or STOP.']);
  });

  it('cleanSponsorName keeps names and refuses links, digits, controls and long strings', () => {
    expect(cleanSponsorName("  Mary-Jo  O'Neil ")).toBe("Mary-Jo O'Neil");
    expect(cleanSponsorName('J. R. Smith')).toBe('J. R. Smith');
    expect(cleanSponsorName('José Núñez')).toBe('José Núñez');
    for (const bad of [
      'evil.example',
      'Seth https://x.co',
      'Call 2025550133',
      'Seth\nReply YES',
      'Seth‮htap',
      'A'.repeat(41),
      '',
      42,
      undefined,
    ]) {
      expect(cleanSponsorName(bad)).toBeUndefined();
    }
  });
});

describe('the real loader (holderOf)', () => {
  it('reads field by field: no sponsor matches no one; a malformed code reads as none', async () => {
    docs.set('sponsored_identities/orphan', {
      phoneNumber: MOM,
      holderVerification: { codeHash: 5, sentAt: 'x', tries: 'many' },
    });
    expect(await defaultHolderDeps().byId('orphan')).toEqual({
      id: 'orphan',
      sponsorUserId: '',
      phoneNumber: MOM,
      phoneVerifiedAt: undefined,
      holderVerification: undefined,
    });
    expect(await startHolderVerification('orphan', '', deps())).toEqual({
      started: false,
      reason: 'not-found',
    });
    const d = { ...deps(), byPhone: async () => defaultHolderDeps().byId('orphan') };
    expect(await recordHolderCode(MOM, '482913', d)).toBe(false);
    expect(docs.get('sponsored_identities/orphan')?.phoneVerifiedAt).toBeUndefined();
    expect(sent).toHaveLength(0);
  });

  it('a well-formed pending code is read back whole', async () => {
    const pending = { codeHash: 'h', phoneHash: 'p', sentAt: 's', expiresAt: 'e', tries: 2 };
    docs.set('sponsored_identities/mom', {
      sponsorUserId: 'seth',
      phoneNumber: MOM,
      holderVerification: pending,
    });
    expect((await defaultHolderDeps().byId('mom'))?.holderVerification).toEqual(pending);
  });
});

describe('the real transaction (defaultHolderDeps.transact)', () => {
  const VICTIM = '+12025550177';
  const momDoc = () => docs.get('sponsored_identities/mom');
  // the cached lookup, standing in for lookupByPhone: maps the sponsor's number to mom
  const viaCache = () => ({ ...deps(), byPhone: async () => defaultHolderDeps().byId('mom') });

  beforeEach(() => {
    docs.set('sponsored_identities/mom', { sponsorUserId: 'seth', phoneNumber: MOM, name: 'Mom' });
  });

  it('stores the code bound to the number and merges the proof, keeping the other fields', async () => {
    expect((await startHolderVerification('mom', 'seth', deps())).started).toBe(true);
    expect(momDoc()?.holderVerification).toMatchObject({ phoneHash: expect.any(String), tries: 0 });
    expect(await recordHolderCode(MOM, '482913', viaCache())).toBe(true);
    expect(momDoc()).toMatchObject({ name: 'Mom', phoneNumber: MOM, holderVerification: null });
    expect(momDoc()?.phoneVerifiedAt).toEqual(expect.any(String));
  });

  it('a number swapped after the code went out gets no proof, even with the code', async () => {
    await startHolderVerification('mom', 'seth', deps());
    docs.set('sponsored_identities/mom', { ...momDoc(), phoneNumber: VICTIM });
    expect(await recordHolderCode(MOM, '482913', viaCache())).toBe(false);
    expect(momDoc()?.phoneVerifiedAt).toBeUndefined();
  });

  it('a pending code stored without its number (before the binding) is no code', async () => {
    await startHolderVerification('mom', 'seth', deps());
    const { phoneHash: _bound, ...unbound } = momDoc()?.holderVerification as Record<
      string,
      unknown
    >;
    docs.set('sponsored_identities/mom', { ...momDoc(), holderVerification: unbound });
    expect(await recordHolderCode(MOM, '482913', viaCache())).toBe(false);
    expect(momDoc()?.phoneVerifiedAt).toBeUndefined();
  });
});
