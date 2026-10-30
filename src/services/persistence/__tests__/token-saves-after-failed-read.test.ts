/**
 * A new OAuth grant saves even when the last read of that user's tokens failed.
 *
 * setImmediate rejects while a key's latest load has failed (read-guard.ts), so a write built
 * on that read can't replace real data. Token saves aren't built on a read: they store a grant
 * the provider just issued. Each one passes { safeWithoutRead: true }; without it, a user whose
 * token read failed once could never connect Plaid, Spotify, a wearable or Gmail send again in
 * that process. Real token modules and the real store on the Firestore merge fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
  type MergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@google-cloud/firestore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));

const state: MergeFakeState = newMergeFakeState();
const failed = new Set<string>();
state.failReads = failed;
fake.db = createMergeFakeFirestore(state);

const plaid = await import('../../../servers/api/services/plaid.js');
const spotifyLink = await import('../../../servers/token/oauth/spotify.js');
const spotifyApi = await import('../../../servers/api/services/spotify.js');
const wearables = await import('../../../servers/token/oauth/wearables.js');
const gmail = await import('../../identity/gmail-send-as-user.js');

const writesTo = (path: string) => state.writes.filter((w) => w.path === path);
const tokens = { access_token: 'at-new', refresh_token: 'rt-new', expires_at: Date.now() + 3600e3 };

/** Seed `path`, make one read of it fail, then let reads work again. */
async function afterAFailedRead(path: string, read: () => Promise<unknown>): Promise<void> {
  state.docs.set(path, { encrypted: 'old-grant', updated_at: 1 });
  failed.add(path);
  await read();
  failed.clear();
}

beforeEach(() => {
  state.docs.clear();
  state.writes.length = 0;
  failed.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('token saves after a failed token read', () => {
  it('Plaid: storeToken saves the new item', async () => {
    const path = 'bogle_users/u-plaid/plaid_tokens/data';
    await afterAFailedRead(path, () => plaid.loadTokensForUser('u-plaid'));
    await plaid.storeToken('u-plaid', 'access-new', 'item-new');
    expect(writesTo(path)).toHaveLength(1);
  });

  it('Spotify link (per user): saveTokens saves the new grant', async () => {
    const path = `bogle_users/u-spot/${spotifyLink.SPOTIFY_LINK_COLLECTION}/data`;
    await afterAFailedRead(path, () => spotifyLink.getTokens('u-spot'));
    await spotifyLink.saveTokens('u-spot', tokens as never);
    expect(writesTo(path)).toHaveLength(1);
  });

  it('Spotify app tokens (global): saveTokens saves the refreshed tokens', async () => {
    const path = 'spotify_tokens/global';
    await afterAFailedRead(path, () => spotifyApi.loadTokens());
    await spotifyApi.saveTokens('at-new', 'rt-new', 3600, 'streaming');
    expect(writesTo(path)).toHaveLength(1);
  });

  it('Wearables: saveTokens saves the new grant', async () => {
    const path = 'bogle_users/u-wear/wearable_whoop_tokens/data';
    await afterAFailedRead(path, () => wearables.getTokens('whoop', 'u-wear'));
    await wearables.saveTokens('whoop', 'u-wear', tokens as never);
    expect(writesTo(path)).toHaveLength(1);
  });

  it('Gmail send: completing the consent saves the grant', async () => {
    const path = 'bogle_users/u-mail/gmail_send_tokens/data';
    await afterAFailedRead(path, () => gmail.getGmailSendAddress('u-mail'));
    const claims = Buffer.from(JSON.stringify({ email: 'sam@example.com' })).toString('base64url');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          access_token: 'at-new',
          expires_in: 3600,
          scope: gmail.GMAIL_SEND_SCOPE,
          id_token: `h.${claims}.s`,
        }),
      }))
    );
    await expect(gmail.completeGmailSendConnect('u-mail', 'code')).resolves.toMatchObject({
      ok: true,
    });
    expect(writesTo(path)).toHaveLength(1);
  });
});
