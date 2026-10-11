/**
 * The plan webhooks leave a Seed Fund gift alone: completing, changing or cancelling a
 * gift subscription must not change the giver's plan. The plan handlers act only on
 * subscriptions carrying ferni_user_id, which a gift (seed-fund-checkout.ts) never has.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  getProfile: vi.fn(async () => ({
    userId: 'u1',
    subscription: { tier: 'partner', status: 'active' },
  })),
  saveProfile: vi.fn(async () => undefined),
}));
vi.mock('../../../memory/store-factory.js', () => ({ getStore: async () => store }));
vi.mock('../../seeds/payment-bonuses.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  awardFoundingSeeds: vi.fn(async () => null),
  awardContributionSeeds: vi.fn(async () => null),
}));

const { handleWebhookEvent } = await import('../stripe-subscription.js');
const giftMetadata = { garden_type: 'monthly', seeds_uid: 'u1' };
const deliver = (type: string, object: Record<string, unknown>) =>
  handleWebhookEvent({ id: `evt_${type}`, type, data: { object } } as never);

beforeEach(() => {
  store.getProfile.mockClear();
  store.saveProfile.mockClear();
});

describe('a Seed Fund gift never touches the plan', () => {
  it('completing, changing and cancelling a gift subscription leave the plan as it was', async () => {
    await deliver('checkout.session.completed', {
      id: 'cs_1',
      subscription: 'sub_gift',
      metadata: giftMetadata,
    });
    await deliver('customer.subscription.updated', {
      id: 'sub_gift',
      status: 'active',
      metadata: giftMetadata,
    });
    await deliver('customer.subscription.deleted', {
      id: 'sub_gift',
      status: 'canceled',
      metadata: giftMetadata,
    });

    expect(store.getProfile).not.toHaveBeenCalled();
    expect(store.saveProfile).not.toHaveBeenCalled();
  });

  it('(control) a plan subscription with ferni_user_id still syncs', async () => {
    await deliver('customer.subscription.deleted', {
      id: 'sub_plan',
      status: 'canceled',
      metadata: { ferni_user_id: 'u1', tier: 'friend' },
    });
    expect(store.saveProfile).toHaveBeenCalled();
  });
});
