/**
 * The family circle hook fails closed without swallowing the failure: a
 * decision that throws gives null, and the hook logs it with the session id, a
 * reason code and the error's class only (never its message). Fictional data.
 */
import type { Room } from '@livekit/rtc-node';
import { describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const spy = (...args: unknown[]): void => void logged.push(args);
  const logger = { info: spy, warn: spy, debug: spy, error: spy, child: () => logger };
  return { ...real, createLogger: () => logger };
});

const { familyCircleMember, registerFamilyCircleDecision } =
  await import('../family-circle-hook.js');

describe('familyCircleMember', () => {
  it('is null before a decision is registered', async () => {
    expect(await familyCircleMember({} as Room, 'hook-0')).toBeNull();
  });

  it('logs a failed decision and is null', async () => {
    registerFamilyCircleDecision(async () => {
      throw new TypeError('+15555550101 Test Member');
    });
    expect(await familyCircleMember({} as Room, 'hook-1')).toBeNull();
    expect(logged).toContainEqual([
      { sessionId: 'hook-1', reason: 'error', error: 'TypeError' },
      'family_circle refused',
    ]);
    expect(JSON.stringify(logged)).not.toContain('Test Member');
  });
});
