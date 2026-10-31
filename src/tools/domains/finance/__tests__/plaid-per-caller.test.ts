/**
 * The Plaid tools run as the call's own caller, and say honestly what a read came to.
 *
 * Before: seven tools took `userId` from the model's arguments, so a caller could
 * ask for someone else's balances; and a failed Plaid read came back as [] and was
 * spoken as "no transactions" or a $0 net position. Plaid and the item store are
 * mocked; every name, token and amount here is fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fx = vi.hoisted(() => {
  process.env.PLAID_CLIENT_ID = 'client-id-fixture';
  process.env.PLAID_SECRET = 'secret-fixture';
  process.env.PLAID_ENV = 'sandbox';
  return { tokens: new Map<string, string>(), reads: [] as string[] };
});

vi.mock('@livekit/agents', () => ({
  llm: { tool: (config: Record<string, unknown>) => ({ ...config }) },
  log: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../rate-limiter.js', () => ({ getRateLimiter: () => ({ tryAcquire: () => true }) }));

// The one door to the caller's Plaid Item (plaid-items.ts); records whose link was read.
vi.mock('../plaid-items.js', () => {
  const read = (uid: string) => {
    fx.reads.push(uid);
    return fx.tokens.get(uid) ?? null;
  };
  return {
    getStoredAccessToken: vi.fn(async (uid: string) => read(uid)),
    getTokenData: vi.fn(async (uid: string) => {
      const token = read(uid);
      return token
        ? { access_token: token, item_id: `item-${uid}`, linked_at: '2026-10-01T00:00:00Z', institution: { name: 'First Platypus Bank' } } // prettier-ignore
        : null;
    }),
    hasLinkedAccounts: vi.fn(async (uid: string) => read(uid) !== null),
    removeAccessToken: vi.fn(async (uid: string) => fx.tokens.delete(uid)),
    storeAccessToken: vi.fn(async () => ({ ok: true })),
  };
});

import { createPlaidTools } from '../plaid.js';
import { createFinancialHabitsTools } from '../financial-habits.js';
import { PLAID_LINES } from '../plaid-caller.js';
import { getBankingToolDefinitions } from '../index.js';
import { perCallerTool } from '../../../registry/per-caller-tool.js';
import financeExecutor from '../../../../agents/shared/tool-executors/finance-executor.js';
import { runWithLinkedTokenUse, takeLinkedTokenUse } from '../../../../utils/linked-token-use.js';
import type { ToolContext } from '../../../registry/types.js';

const ALICE = 'uid-alice-fixture';
const BOB = 'uid-bob-fixture';
const ALICE_TOKEN = 'access-sandbox-alice-fixture';
const BOB_TOKEN = 'access-sandbox-bob-fixture';

type Run = (args: Record<string, unknown>, opts?: unknown) => Promise<string>;
const toolsFor = (ctx?: { userId?: string }) =>
  createPlaidTools(ctx) as unknown as Record<string, { execute: Run }>;
/** LiveKit's tool-call opts for a call whose caller is `uid`. */
const callOf = (uid: string | undefined, toolCallId = 'call-1') => ({
  ctx: { userData: { userId: uid } },
  toolCallId,
});

const account = (name: string, current: number) => ({
  account_id: `acct-${name}`,
  name,
  type: 'depository',
  subtype: 'checking',
  balances: { current, iso_currency_code: 'USD' },
  mask: '0000',
});
const txn = (name: string, amount: number, category: string[], pending = false) => ({
  transaction_id: `txn-${name}-${amount}`,
  account_id: 'acct-fixture',
  amount,
  date: '2026-10-20',
  name,
  merchant_name: name,
  category,
  pending,
  payment_channel: 'in store',
});
const DINING = ['Food and Drink', 'Restaurants'];
/** A sandbox-shaped /transactions/get page: 70.88 of settled dining, plus noise that must not count. */
const BOB_TRANSACTIONS = [
  txn('Tasty Fixture Diner', 23.45, DINING),
  txn('Sandbox Noodle Bar', 41.1, DINING),
  txn('Fictional Coffee Co', 6.33, DINING),
  txn('Pending Fixture Bistro', 50, DINING, true), // not settled yet
  txn('Tasty Fixture Diner', -10, DINING), // a refund is money in
  txn('Fixture Rideshare', 12, ['Travel', 'Taxi']),
  txn('Imaginary Hardware', 100, ['Shops', 'Hardware Store']),
];

type Reply = { status: number; body: unknown } | Error;
let plaidReply: (endpoint: string, accessToken: string) => Reply;
const fetchMock = vi.fn(async (url: string, init: { body: string }) => {
  const endpoint = new URL(url).pathname;
  const reply = plaidReply(endpoint, JSON.parse(init.body).access_token);
  if (reply instanceof Error) throw reply;
  return new Response(JSON.stringify(reply.body), { status: reply.status });
});
const plaidCalls = (): Array<Record<string, unknown>> =>
  fetchMock.mock.calls.map(([url, init]) => ({
    endpoint: new URL(url).pathname,
    ...(JSON.parse(init.body) as Record<string, unknown>),
  }));
const sandboxBank = (endpoint: string, accessToken: string): Reply => {
  const who = accessToken === ALICE_TOKEN ? 'Alice' : accessToken === BOB_TOKEN ? 'Bob' : null;
  if (!who) return { status: 400, body: { error_code: 'INVALID_ACCESS_TOKEN' } };
  if (endpoint === '/accounts/balance/get') {
    return { status: 200, body: { accounts: [account(`${who} Checking`, who === 'Alice' ? 98765 : 120)] } }; // prettier-ignore
  }
  const transactions =
    who === 'Bob' ? BOB_TRANSACTIONS : [txn('Alice Only Steakhouse', 900, DINING)];
  return { status: 200, body: { accounts: [], transactions, total_transactions: transactions.length } }; // prettier-ignore
};

/** Every caller-facing read, each with a model-supplied userId naming someone else. */
const READS: Array<[string, Record<string, unknown>]> = [
  ['checkBankLinkStatus', { userId: ALICE }],
  ['getAccountBalances', { userId: ALICE }],
  ['getSpendingAnalysis', { userId: ALICE, period: 'month' }],
  ['getRecentTransactions', { userId: ALICE }],
  ['checkFinancialHealth', { userId: ALICE }],
  ['unlinkBankAccount', { userId: ALICE, confirm: true }],
];

beforeEach(() => {
  fx.tokens.clear();
  fx.tokens.set(ALICE, ALICE_TOKEN);
  fx.tokens.set(BOB, BOB_TOKEN);
  fx.reads.length = 0;
  plaidReply = sandboxBank;
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a Plaid tool reads only the session caller’s bank', () => {
  it('every tool has no userId parameter', () => {
    for (const [name, tool] of Object.entries(toolsFor())) {
      const shape = (tool as unknown as { parameters: { shape: Record<string, unknown> } })
        .parameters.shape;
      expect(Object.keys(shape), name).not.toContain('userId');
    }
  });

  it.each(READS)(
    "%s for Bob with userId: Alice in the args never reads Alice's link",
    async (name, args) => {
      expect(fx.tokens.get(ALICE)).toBe(ALICE_TOKEN); // Alice really is linked: honouring the arg would leak
      const reply = await toolsFor({ userId: BOB })[name].execute(args, callOf(BOB));

      expect(fx.reads.length).toBeGreaterThan(0);
      expect(new Set(fx.reads)).toEqual(new Set([BOB]));
      expect(plaidCalls().every((c) => c.access_token === BOB_TOKEN)).toBe(true);
      expect(reply).not.toMatch(/Alice|98,765|900/);
      expect(fx.tokens.get(ALICE)).toBe(ALICE_TOKEN); // and never unlinks her
    }
  );

  it("Bob's balances, not Alice's, through the registry tool the gateway builds per caller", async () => {
    const def = getBankingToolDefinitions().find((d) => d.id === 'bankData')!;
    const base: Omit<ToolContext, 'userId'> = {
      agentId: 'gateway',
      agentDisplayName: 'Tool Gateway',
      services: { has: () => false, get: () => { throw new Error('none'); }, getOptional: () => undefined }, // prettier-ignore
    };
    const shared = perCallerTool(def, base) as unknown as { execute: Run };

    const reply = await shared.execute({ userId: ALICE }, callOf(BOB));

    expect(reply).toContain('Bob Checking');
    expect(reply).toContain('$120');
    expect(fx.reads).toEqual([BOB]);
  });

  it("the finance executor runs as the dispatcher's session user, not the args' user", async () => {
    const reply = await financeExecutor.execute('bankData', { userId: ALICE }, { userId: BOB, sessionId: 'session-fixture' }); // prettier-ignore

    expect(String(reply)).toContain('Bob Checking');
    expect(fx.reads).toEqual([BOB]);
  });

  it('a caller with no link gets not connected even when the args name a linked user', async () => {
    fx.tokens.delete(BOB);
    const reply = await toolsFor({ userId: BOB }).getSpendingAnalysis.execute({ userId: ALICE }, callOf(BOB)); // prettier-ignore

    expect(reply).toContain("You haven't linked a bank account yet");
    expect(fx.reads).toEqual([BOB]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("Maya's getActualSpending reads the caller's bank, not the args' user, and none for a stranger", async () => {
    const tool = (createFinancialHabitsTools() as unknown as Record<string, { execute: Run }>).getActualSpending; // prettier-ignore

    const reply = await tool.execute({ userId: ALICE, period: 'month' }, callOf(BOB));
    expect(reply).toContain('Food and Drink: $70.88');
    expect(fx.reads).toEqual([BOB]);

    fx.reads.length = 0;
    const stranger = await tool.execute(
      { userId: ALICE, period: 'month' },
      callOf('anon:9f1c-fixture')
    );
    expect(stranger).toContain("I don't have access to your actual bank data yet");
    expect(fx.reads).toEqual([]);
  });
});

describe('a caller who is not a member has no bank here', () => {
  const STRANGERS = [
    'anon:9f1c-fixture',
    'onbehalf:call-fixture',
    'unknown',
    'anonymous',
    undefined,
  ];

  it.each(STRANGERS)(
    '%s: every read says not connected, with zero store reads and no Plaid call',
    async (who) => {
      const tools = toolsFor({ userId: who });
      for (const [name, args] of READS) {
        const reply = await tools[name].execute(args, callOf(who));
        expect(reply, name).toMatch(
          /haven't linked|need to link|link your bank|nothing to disconnect/i
        );
      }
      expect(fx.reads).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('an anon: caller on the call wins over a member id in the factory ctx', async () => {
    await toolsFor({ userId: BOB }).getAccountBalances.execute({}, callOf('anon:9f1c-fixture'));
    expect(fx.reads).toEqual([]);
  });
});

describe('a failed read is said as a failure, never as $0 or "no transactions"', () => {
  const NOT_EMPTY = /\$0\b|don't see any|no transactions/i;

  it('ITEM_LOGIN_REQUIRED is needs_reauth, with an honest line and the link state recorded', async () => {
    plaidReply = () => ({ status: 400, body: { error_type: 'ITEM_ERROR', error_code: 'ITEM_LOGIN_REQUIRED' } }); // prettier-ignore

    const reply = await runWithLinkedTokenUse('call-reauth', () =>
      toolsFor({ userId: BOB }).getSpendingAnalysis.execute({}, callOf(BOB, 'call-reauth'))
    );

    expect(reply).toBe(PLAID_LINES.needs_reauth);
    expect(reply).not.toMatch(NOT_EMPTY);
    expect(takeLinkedTokenUse('call-reauth')).toMatchObject({ provider: 'plaid', ownerUid: BOB, state: 'needs_reauth' }); // prettier-ignore
  });

  it('a 5xx is unreachable for balances, spending and the health check', async () => {
    plaidReply = () => ({ status: 503, body: { error_code: 'INTERNAL_SERVER_ERROR' } });
    const tools = toolsFor({ userId: BOB });

    for (const name of ['getAccountBalances', 'getSpendingAnalysis', 'checkFinancialHealth']) {
      const reply = await tools[name].execute({}, callOf(BOB));
      expect(reply, name).toBe(PLAID_LINES.unreachable);
    }
    expect(plaidCalls().length).toBeGreaterThan(3); // the 5xx was retried, then given up on
  }, 30_000);

  it('a network failure is unreachable, not an empty list', async () => {
    plaidReply = () => new TypeError('fetch failed');
    const reply = await toolsFor({ userId: BOB }).getRecentTransactions.execute({}, callOf(BOB));
    expect(reply).toBe(PLAID_LINES.unreachable);
  }, 30_000);

  it('a store that cannot be read is unreachable, not "not linked"', async () => {
    const { getStoredAccessToken } = await import('../plaid-items.js');
    vi.mocked(getStoredAccessToken).mockRejectedValueOnce(new Error('firestore unavailable'));
    const reply = await toolsFor({ userId: BOB }).getAccountBalances.execute({}, callOf(BOB));
    expect(reply).toBe(PLAID_LINES.unreachable);
  });
});

describe('data', () => {
  it('a sandbox transactions page gives the correct dining total for the caller', async () => {
    const reply = await toolsFor({ userId: BOB }).getSpendingAnalysis.execute({ period: 'month' }, callOf(BOB)); // prettier-ignore

    // 23.45 + 41.10 + 6.33 settled; the pending 50 and the -10 refund do not count
    expect(reply).toContain('Food and Drink: $70.88 (39%) - 3 transactions');
    expect(reply).toContain('Your spending for the past month: $182.88');
    const [call] = plaidCalls();
    expect(call).toMatchObject({ endpoint: '/transactions/get', access_token: BOB_TOKEN });
  });
});
