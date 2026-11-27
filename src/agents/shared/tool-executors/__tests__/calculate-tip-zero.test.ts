/**
 * calculateTip read a 0% tip as "no percentage" and used 20%: `args.percentage || 20`, in the
 * settings executor and in the legacy fallback (a third copy in the legacy fallback is shadowed
 * by the first). The primary tool keeps a 0 (`z.number().default(20)`), so these now do too.
 * Fictional amounts.
 */
import { describe, expect, it } from 'vitest';
import { executeLegacyFallback } from '../legacy-fallback-executor.js';
import { settingsExecutor } from '../settings-executor.js';

const ctx = { userId: 'user-fictional', sessionId: 's-1', personaId: 'ferni' } as never;

const executors = {
  settings: (args: Record<string, unknown>) => settingsExecutor.execute('calculateTip', args, ctx),
  'legacy fallback': (args: Record<string, unknown>) =>
    executeLegacyFallback('calculateTip', args, ctx),
};

describe.each(Object.entries(executors))('%s calculateTip percentage', (_name, run) => {
  const say = async (args: Record<string, unknown>) => String(await run(args));

  it('keeps a 0% tip at 0%', async () => {
    expect(await say({ amount: 80, percentage: 0 })).toBe(
      'On a $80.00 bill with 0% tip: The tip is $0.00, making the total $80.00.'
    );
  });

  it('keeps a given percentage', async () => {
    expect(await say({ amount: 80, percentage: 15 })).toBe(
      'On a $80.00 bill with 15% tip: The tip is $12.00, making the total $92.00.'
    );
  });

  it.each([undefined, null])('uses 20% when the percentage is %s', async (percentage) => {
    expect(await say({ amount: 80, percentage })).toBe(
      'On a $80.00 bill with 20% tip: The tip is $16.00, making the total $96.00.'
    );
  });
});
