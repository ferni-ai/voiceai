/**
 * The token vault must reach Firestore through getAdminFirestore(), which binds the
 * process's database (FIRESTORE_DATABASE). It used admin.firestore(), which always
 * opens '(default)', so a dev process read and wrote prod's vault.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const set = vi.fn(async () => undefined);
  const get = vi.fn(async () => ({ exists: true, data: () => ({ value: 'secret' }) }));
  const doc = vi.fn(() => ({ set, get }));
  const collection = vi.fn(() => ({ doc }));
  const getAdminFirestore = vi.fn(() => ({ collection }));
  return { set, get, doc, collection, getAdminFirestore };
});

vi.mock('../../../utils/firebase-admin-app.js', () => ({
  getAdminFirestore: fake.getAdminFirestore,
}));

const { saveTokenToFirestore, loadTokenFromFirestore, TOKEN_VAULT_COLLECTION } =
  await import('../token-vault-store.js');

describe('token vault store', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves through getAdminFirestore() into token_vault', async () => {
    expect(fake.getAdminFirestore).not.toHaveBeenCalled();
    await saveTokenToFirestore('tok_phone_1', '+15555550100', 'phone');
    expect(fake.getAdminFirestore).toHaveBeenCalledTimes(1);
    expect(fake.collection).toHaveBeenCalledWith(TOKEN_VAULT_COLLECTION);
    expect(fake.doc).toHaveBeenCalledWith('tok_phone_1');
    expect(fake.set).toHaveBeenCalledWith(
      expect.objectContaining({ value: '+15555550100', category: 'phone' })
    );
  });

  it('loads through getAdminFirestore()', async () => {
    await expect(loadTokenFromFirestore('tok_phone_1')).resolves.toBe('secret');
    expect(fake.getAdminFirestore).toHaveBeenCalledTimes(1);
  });

  it('degrades to not persisted when Firestore is unavailable', async () => {
    fake.getAdminFirestore.mockImplementationOnce(() => {
      throw new Error('no default app');
    });
    await expect(loadTokenFromFirestore('tok_phone_1')).resolves.toBeNull();
  });
});
