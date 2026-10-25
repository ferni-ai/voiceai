/**
 * The intelligence worker pulls intelligence-events and reads prod's (default)
 * database, so a process on another database (dev) publishes nothing there.
 * PUBSUB_ENABLED is read at import, so each case imports the module fresh.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const publishMessage = vi.hoisted(() => vi.fn(async () => 'msg-1'));
const topic = vi.hoisted(() => vi.fn(() => ({ publishMessage })));
vi.mock('@google-cloud/pubsub', () => ({
  PubSub: class {
    topic = topic;
  },
}));
const add = vi.hoisted(() => vi.fn(async () => ({ id: 'q1' })));
vi.mock('firebase-admin', () => ({
  default: { firestore: () => ({ collection: () => ({ add }) }) },
}));
vi.mock('../../../memory/profile-store.js', () => ({ getProfileStore: async () => ({}) }));

const event = { type: 'key_moment' as const, userId: 'u1', sessionId: 's1', payload: {} };

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('INTELLIGENCE_QUEUE', 'on');
  vi.stubEnv('INTELLIGENCE_PUBSUB_ENABLED', 'true');
});
afterEach(() => {
  vi.unstubAllEnvs();
  publishMessage.mockClear();
  topic.mockClear();
  add.mockClear();
});

describe('intelligence-events on a non-prod Firestore database', () => {
  it("on prod's database, an event and a batch are published to intelligence-events", async () => {
    const { publishIntelligenceEvent, publishIntelligenceEventsBatch } =
      await import('../intelligence-publisher.js');
    await publishIntelligenceEvent(event);
    await publishIntelligenceEventsBatch([event]);
    expect(topic).toHaveBeenCalledWith('intelligence-events');
    expect(publishMessage).toHaveBeenCalledTimes(2);
  });

  it('on ferni-dev, nothing is published (and nothing queued in its place)', async () => {
    vi.stubEnv('FIRESTORE_DATABASE', 'ferni-dev');
    const { publishIntelligenceEvent, publishIntelligenceEventsBatch } =
      await import('../intelligence-publisher.js');
    await publishIntelligenceEvent(event);
    await publishIntelligenceEventsBatch([event]);
    expect(publishMessage).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });
});
