/**
 * With WORKER_PUBSUB=on a worker pulls prod's subscription. A process on a
 * non-prod Firestore database (dev) must not: it would take and ack prod's
 * messages and act on them against its own database.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const subscription = vi.hoisted(() => vi.fn(() => ({ on: vi.fn() })));
vi.mock('@google-cloud/pubsub', () => ({
  PubSub: class {
    subscription = subscription;
  },
}));
vi.mock('../../services/async-events/index.js', () => ({
  AsyncEvents: { onAll: () => () => undefined },
}));

const { LocalWorker } = await import('../base-worker.js');

class TestWorker extends LocalWorker {
  constructor() {
    super({ name: 'TestWorker', subscriptionName: 'ferni-test-sub', projectId: 'johnb-2025' });
  }
  protected async process(): Promise<void> {}
}

afterEach(() => {
  vi.unstubAllEnvs();
  subscription.mockClear();
});

describe('worker Pub/Sub listen on a non-prod Firestore database', () => {
  it("on prod's database, the worker pulls its subscription", async () => {
    vi.stubEnv('WORKER_PUBSUB', 'on');
    const worker = new TestWorker();
    await worker.start();
    await worker.stop();
    expect(subscription).toHaveBeenCalledWith('ferni-test-sub', expect.anything());
  });

  it('on ferni-dev, it does not', async () => {
    vi.stubEnv('WORKER_PUBSUB', 'on');
    vi.stubEnv('FIRESTORE_DATABASE', 'ferni-dev');
    const worker = new TestWorker();
    await worker.start();
    await worker.stop();
    expect(subscription).not.toHaveBeenCalled();
  });
});
