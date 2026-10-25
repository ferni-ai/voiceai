/**
 * Pub/Sub's topics are prod's: the outreach and intelligence workers that pull
 * them read the (default) database. A process on another database (the dev
 * agent, PR previews) publishes in-process instead and never subscribes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const emit = vi.hoisted(() => vi.fn());
vi.mock('../../async-events/index.js', () => ({ AsyncEvents: { emit } }));

const { default: PubSubClient } = await import('../pubsub-client.js');

/** A client whose GCP side is a fake that records what reaches it. */
function clientWithFakeGcp() {
  const publishMessage = vi.fn(async () => 'gcp-msg-1');
  const createSubscription = vi.fn(async () => [
    { on: vi.fn(), setOptions: vi.fn(), removeAllListeners: vi.fn() },
  ]);
  const client = new PubSubClient();
  const internals = client as unknown as {
    client: unknown;
    initialized: boolean;
    topics: Map<string, unknown>;
  };
  internals.client = { topic: vi.fn(), subscription: vi.fn(), close: vi.fn() };
  internals.topics.set('outreach-triggers', { publishMessage, createSubscription });
  internals.initialized = true;
  return { client, publishMessage, createSubscription };
}

const trigger = { type: 'outreach:commitment_check', data: { userId: 'u1' } };

afterEach(() => {
  vi.unstubAllEnvs();
  emit.mockClear();
});

describe('Pub/Sub on a non-prod Firestore database', () => {
  it("on prod's database, an outreach trigger goes to the GCP topic", async () => {
    vi.stubEnv('PUBSUB_ENABLED', 'true');
    const { client, publishMessage, createSubscription } = clientWithFakeGcp();
    expect(client.isEnabled()).toBe(true);

    const result = await client.publish('outreach-triggers', trigger);
    await client.subscribe('outreach-triggers', 'outreach-worker', async () => undefined);

    expect(publishMessage).toHaveBeenCalledTimes(1);
    expect(result?.messageId).toBe('gcp-msg-1');
    expect(createSubscription).toHaveBeenCalledTimes(1);
  });

  it('on ferni-dev, the trigger stays in-process and nothing subscribes to prod', async () => {
    vi.stubEnv('PUBSUB_ENABLED', 'true');
    vi.stubEnv('FIRESTORE_DATABASE', 'ferni-dev');
    const { client, publishMessage, createSubscription } = clientWithFakeGcp();
    expect(client.isEnabled()).toBe(false);

    const result = await client.publish('outreach-triggers', trigger);
    await client.subscribe('outreach-triggers', 'outreach-worker', async () => undefined);

    expect(publishMessage).not.toHaveBeenCalled();
    expect(createSubscription).not.toHaveBeenCalled();
    expect(result?.topic).toBe('local-outreach-triggers');
    expect(emit).toHaveBeenCalledWith('outreach:commitment_check', { userId: 'u1' });
  });
});
