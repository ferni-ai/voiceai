/**
 * Verification codes: drawn from the CSPRNG, compared in constant time, and
 * used once. (The store's in-memory fallback; Firestore is not available here.)
 */
import { describe, expect, it, vi } from 'vitest';

const crypto = vi.hoisted(() => ({ randomInt: vi.fn(), timingSafeEqual: vi.fn() }));
vi.mock('node:crypto', async (orig) => {
  const real = await orig<typeof import('node:crypto')>();
  crypto.randomInt.mockImplementation((a: number, b: number) => real.randomInt(a, b));
  crypto.timingSafeEqual.mockImplementation((a: Buffer, b: Buffer) => real.timingSafeEqual(a, b));
  return { ...real, randomInt: crypto.randomInt, timingSafeEqual: crypto.timingSafeEqual };
});
vi.mock('firebase-admin/firestore', async (orig) => ({
  ...(await orig<object>()),
  getFirestore: () => {
    throw new Error('no firestore');
  },
}));

const { createVerificationCode, verifyCode } = await import('../verification-store.js');

describe('verification codes', () => {
  it('are six digits from crypto.randomInt', async () => {
    const { code } = await createVerificationCode('u1', '+12125550100');
    expect(code).toMatch(/^\d{6}$/);
    expect(crypto.randomInt).toHaveBeenCalledWith(100000, 1000000);
  });

  it('are compared in constant time, and work once', async () => {
    const { code } = await createVerificationCode('u2', '+12125550100');
    crypto.timingSafeEqual.mockClear();
    expect(await verifyCode('u2', code)).toEqual({
      valid: true,
      reason: 'success',
      phone: '+12125550100',
    });
    expect(crypto.timingSafeEqual).toHaveBeenCalled();
    expect((await verifyCode('u2', code)).valid).toBe(false); // used up
  });

  it('a wrong or different-length code is refused', async () => {
    const { code } = await createVerificationCode('u3', '+12125550100');
    expect((await verifyCode('u3', code.slice(0, 5))).valid).toBe(false);
    expect((await verifyCode('u3', code === '000000' ? '111111' : '000000')).valid).toBe(false);
    expect((await verifyCode('u3', code)).valid).toBe(true); // still within its attempts
  });
});
