/**
 * A voice-eval call reaches the agent as its voice-eval user, labelled eval (#1597).
 *
 * Runs run.sh's job metadata, signed the way sign-meta.ts signs it, through the
 * agent's own identity resolution (identifyFromMetadata, as
 * user-identification-handler.ts calls it) and the TURN_RECEIPT label
 * (userKindOf). Before the signing fixes every eval call arrived as `anon:`,
 * userKind other. The eval key only ever names a voice-eval- user, so the label
 * is all it buys: no account, no owner.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { userKindOf } from '../../../src/agents/shared/turn-receipt.js';
import { InMemoryStore } from '../../../src/memory/storage/in-memory-store.js';
import { signDispatch } from '../../../src/services/outreach/on-behalf-dispatch.js';
import { signEvalMeta } from '../eval-dispatch.js';

const store = new InMemoryStore();
vi.mock('../../../src/memory/firestore-store.js', () => ({ getFirestoreStore: () => store }));

const { identifyFromMetadata, setGlobalStore } =
  await import('../../../src/services/identity/user-identification.js');

/** Fake keys: the agent's eval key, our server's key, and the key LiveKit Cloud injects. */
const AGENT_ENV = {
  EVAL_DISPATCH_SECRET: 'fake-eval-key',
  DISPATCH_SIGNING_SECRET: 'fake-server-key',
  LIVEKIT_API_SECRET: 'fake-injected-key',
};
const UID = 'voice-eval-jokes-20261018093000-ab12';
/** run.sh job_meta: who calls and from where. */
const JOB_META = { user_id: UID, user_name: 'Sam', timezone: 'America/New_York' };

/** What the agent sees: the metadata as `lk token create --job-metadata` carried it. */
async function agentIdentity(meta: Record<string, unknown>) {
  const asDispatched = JSON.parse(JSON.stringify(meta)) as Record<string, unknown>;
  const { userId } = await identifyFromMetadata(asDispatched);
  return { userId: String(userId), kind: userKindOf(userId, AGENT_ENV) };
}

describe('a voice-eval dispatch, through the agent identity resolution', () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(AGENT_ENV)) vi.stubEnv(k, v);
    setGlobalStore(store);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('signed by the harness, is the eval user with userKind eval', async () => {
    const unsigned = await agentIdentity(JOB_META);
    expect(unsigned.userId).toMatch(/^anon:/);
    expect(unsigned.kind).toBe('other');

    const signed = await agentIdentity(signEvalMeta(JOB_META, AGENT_ENV.EVAL_DISPATCH_SECRET));
    expect(signed).toEqual({ userId: UID, kind: 'eval' });
  });

  it('keeps an ordinary anonymous caller anonymous', async () => {
    const caller = await agentIdentity({ user_name: 'Pat', timezone: 'America/Chicago' });
    expect(caller.userId).toMatch(/^anon:/);
    expect(caller.kind).toBe('other');
  });

  it('does not make a forged eval caller eval', async () => {
    const forged = [
      JOB_META, // unsigned
      signEvalMeta(JOB_META, 'guessed-key'),
      signEvalMeta(JOB_META, AGENT_ENV.EVAL_DISPATCH_SECRET, Date.now() - 11 * 60_000), // stale
    ];
    for (const meta of forged) {
      const caller = await agentIdentity(meta);
      expect(caller.userId).toMatch(/^anon:/);
      expect(caller.kind).toBe('other');
    }
  });

  it('never lets the eval key name a real account', async () => {
    const real = signDispatch(
      { ...JOB_META, user_id: 'vdSfkCCXaiXpnVCvgKxHMYrNFr72' },
      AGENT_ENV.EVAL_DISPATCH_SECRET
    );
    const caller = await agentIdentity(real);
    expect(caller.userId).toMatch(/^anon:/);
    expect(caller.kind).toBe('other');
  });

  it('is anonymous on an agent without the eval key', async () => {
    vi.stubEnv('EVAL_DISPATCH_SECRET', '');
    const caller = await agentIdentity(signEvalMeta(JOB_META, AGENT_ENV.EVAL_DISPATCH_SECRET));
    expect(caller.userId).toMatch(/^anon:/);
  });
});
