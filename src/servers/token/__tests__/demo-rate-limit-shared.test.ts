/**
 * The token route's demo limit (peek, reserve, release) counts in memory.
 */

import { describe, expect, it } from 'vitest';

const { peekDemoAllowance, releaseDemoSession, reserveDemoSession } =
  await import('../demo-rate-limit-shared.js');

describe('demo limit', () => {
  it('limits in memory', async () => {
    expect((await reserveDemoSession('10.0.0.1')).allowed).toBe(true);
    expect((await reserveDemoSession('10.0.0.1')).reason).toBe('cooldown');
    expect((await peekDemoAllowance('10.0.0.1')).allowed).toBe(false);
  });

  it('giving a demo back clears the in-memory count and cooldown', async () => {
    expect((await reserveDemoSession('10.0.0.3')).allowed).toBe(true);
    expect((await peekDemoAllowance('10.0.0.3')).reason).toBe('cooldown');
    await releaseDemoSession('10.0.0.3');
    const again = await peekDemoAllowance('10.0.0.3');
    expect(again.allowed).toBe(true);
    expect(again.sessionsRemaining).toBe(3);
  });
});
