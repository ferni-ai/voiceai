import { describe, it, expect } from 'vitest';
import { fulfillDeliveryIntent } from '../delivery-adapter.js';

function mockDb(updates: Array<Record<string, unknown>>) {
  return {
    collection: () => ({
      doc: () => ({
        update: async (data: Record<string, unknown>) => {
          updates.push(data);
        },
      }),
    }),
  };
}

describe('fulfillDeliveryIntent', () => {
  it('dry-run deliver → status delivered with dryRun true', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const result = await fulfillDeliveryIntent(
      { db: mockDb(updates) as never, projectId: 'test', dryRun: true },
      {
        id: 't1',
        userId: 'u1',
        type: 'gentle_nudge',
        priority: 'medium',
        reason: 'test',
        createdAt: new Date(),
        status: 'pending',
      },
      { shouldDeliver: true, channel: 'push', delayMinutes: 0, reason: 'ok' }
    );
    expect(result.status).toBe('delivered');
    expect(result.dryRun).toBe(true);
    expect(updates[0]?.status).toBe('delivered');
    expect(updates[0]?.dryRun).toBe(true);
    expect(updates[0]?.deliveryIntent).toBeTruthy();
  });

  it('shouldDeliver false → skipped', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const result = await fulfillDeliveryIntent(
      { db: mockDb(updates) as never, projectId: 'test', dryRun: true },
      {
        id: 't2',
        userId: 'u1',
        type: 'gentle_nudge',
        priority: 'medium',
        reason: 'test',
        createdAt: new Date(),
        status: 'pending',
      },
      { shouldDeliver: false, channel: 'none', delayMinutes: 0, reason: 'quiet hours' }
    );
    expect(result.status).toBe('skipped');
    expect(updates[0]?.status).toBe('skipped');
  });
});
