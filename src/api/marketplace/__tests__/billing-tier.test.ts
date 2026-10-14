/**
 * The marketplace quota tier comes from the caller's account, never from a header.
 * A client could send `x-subscription-tier: partner` to get unlimited executions.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearBillingData, recordUsage } from '../../../marketplace/billing/index.js';
import type { MarketplaceId, UserId } from '../../../marketplace/schema/types.js';
import { getSubscriptionInfo } from '../../../services/billing/stripe-subscription.js';
import type { SubscriptionTier } from '../../../types/subscription.js';
import { handleUsageRoutes } from '../billing-routes.js';

vi.mock('../../../services/billing/stripe-subscription.js', () => ({
  getSubscriptionInfo: vi.fn(),
}));

// Keep usage in memory: no Firestore in unit tests.
vi.mock('../../../marketplace/billing/persistence.js', () => ({
  getBillingStore: vi.fn(async () => {
    throw new Error('no persistence in tests');
  }),
  resetBillingStore: vi.fn(),
}));

const mockedGetSubscriptionInfo = vi.mocked(getSubscriptionInfo);

type SubscriptionInfo = Awaited<ReturnType<typeof getSubscriptionInfo>>;

function storedTier(tier: SubscriptionTier): void {
  mockedGetSubscriptionInfo.mockResolvedValue({ tier } as unknown as SubscriptionInfo);
}

/** A verified caller (x-firebase-uid is only set by the auth door) claiming the partner tier. */
function createReq(headers: Record<string, string>): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'GET';
  req.headers = { 'x-firebase-uid': 'user-tier-test', ...headers };
  return req;
}

function createRes(): ServerResponse & { _status: number; _body: unknown } {
  const res = {
    _status: 0,
    _body: null as unknown,
    writeHead: function (this: { _status: number }, status: number) {
      this._status = status;
    },
    end: function (this: { _body: unknown }, data?: string) {
      this._body = data ? JSON.parse(data) : null;
    },
    setHeader: () => undefined,
  };
  return res as unknown as ServerResponse & { _status: number; _body: unknown };
}

interface UsageBody {
  quota: { maxExecutions: number; maxExecutionTimeMs: number };
}

async function usageQuota(headers: Record<string, string>): Promise<UsageBody['quota']> {
  const res = createRes();
  const handled = await handleUsageRoutes(
    createReq(headers),
    res,
    '/api/marketplace/usage/habit-tracker-pro',
    'GET'
  );
  expect(handled).toBe(true);
  expect(res._status).toBe(200);
  return (res._body as UsageBody).quota;
}

const PARTNER_HEADER = { 'x-subscription-tier': 'partner' };

describe('marketplace quota tier', () => {
  beforeEach(() => {
    mockedGetSubscriptionInfo.mockReset();
    clearBillingData();
  });

  it('gives a free account the free quota even when it sends x-subscription-tier: partner', async () => {
    storedTier('free');

    const quota = await usageQuota(PARTNER_HEADER);

    expect(quota.maxExecutions).toBe(100);
    expect(quota.maxExecutionTimeMs).toBe(60_000);
    expect(mockedGetSubscriptionInfo).toHaveBeenCalledWith('user-tier-test');
  });

  it('gives a partner account the partner (unlimited) quota with no header', async () => {
    storedTier('partner');

    const quota = await usageQuota({});

    expect(quota.maxExecutions).toBe(-1);
    expect(quota.maxExecutionTimeMs).toBe(-1);
  });

  it('gives a friend account the friend quota', async () => {
    storedTier('friend');

    const quota = await usageQuota(PARTNER_HEADER);

    expect(quota.maxExecutions).toBe(1000);
    expect(quota.maxExecutionTimeMs).toBe(600_000);
  });

  it('falls back to the free quota when the account lookup fails', async () => {
    mockedGetSubscriptionInfo.mockRejectedValue(new Error('firestore unavailable'));

    const quota = await usageQuota(PARTNER_HEADER);

    expect(quota.maxExecutions).toBe(100);
    expect(quota.maxExecutionTimeMs).toBe(60_000);
  });

  it('refuses a free account at the free limit even when it sends x-subscription-tier: partner', async () => {
    storedTier('free');
    recordUsage({
      userId: 'user-tier-test' as UserId,
      itemId: 'habit-tracker-pro' as MarketplaceId,
      itemType: 'tool',
      timestamp: new Date().toISOString(),
      metrics: { executions: 100, executionTimeMs: 0, dataTransferBytes: 0 },
    });
    const res = createRes();

    await handleUsageRoutes(
      createReq(PARTNER_HEADER),
      res,
      '/api/marketplace/quota/check/habit-tracker-pro',
      'GET'
    );

    expect(res._status).toBe(200);
    expect(res._body).toEqual({
      allowed: false,
      reason: 'Monthly quota exceeded (100/100 executions)',
      upgradeRequired: true,
    });
  });
});
