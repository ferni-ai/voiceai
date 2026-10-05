/**
 * The LinkedIn awareness builder tells the model nothing (and reads no stored
 * LinkedIn tokens) while LinkedIn is switched off (LINKEDIN_ENABLED).
 * The REAL builder runs; only the LinkedIn service's I/O is mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextBuilderInput } from '../../core/types.js';

const li = vi.hoisted(() => ({
  hasLinkedInConnected: vi.fn(() => false),
  initializeLinkedIn: vi.fn(async () => true),
  syncLinkedInData: vi.fn(async () => undefined),
  generateLinkedInInsight: vi.fn(() => ({
    type: 'milestone',
    message: 'Work anniversary next week',
    priority: 'high',
  })),
}));
vi.mock('../../../../services/linkedin/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../services/linkedin/index.js')>()),
  ...li,
}));

const { linkedInAwarenessBuilder } = await import('../linkedin-awareness.js');

// A user per case: the builder keeps per-user sync/cooldown state in memory.
const inputFor = (userId: string) => ({ services: { userId } }) as unknown as ContextBuilderInput;

beforeEach(() => {
  for (const fn of Object.values(li)) fn.mockClear();
  vi.stubEnv('LINKEDIN_CLIENT_ID', 'li-id');
  vi.stubEnv('LINKEDIN_CLIENT_SECRET', 'li-secret');
});
afterEach(() => vi.unstubAllEnvs());

describe('linkedin-awareness builder', () => {
  it('switched off: injects nothing and never loads LinkedIn tokens', async () => {
    vi.stubEnv('LINKEDIN_ENABLED', '');
    expect(await linkedInAwarenessBuilder.build(inputFor('u-off'))).toEqual([]);
    expect(li.initializeLinkedIn).not.toHaveBeenCalled();
    expect(li.syncLinkedInData).not.toHaveBeenCalled();
  });

  it('switched on: loads the connection and injects the insight as before', async () => {
    vi.stubEnv('LINKEDIN_ENABLED', 'true');
    const injections = await linkedInAwarenessBuilder.build(inputFor('u-on'));
    expect(li.initializeLinkedIn).toHaveBeenCalledWith('u-on');
    expect(injections.map((i) => i.content)).toContain('Work anniversary next week');
  });
});
