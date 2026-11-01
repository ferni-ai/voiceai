/**
 * quickCapture saves some thoughts as reminders, and the delivery job may text
 * any reminder to the owner (reminder-text-guard.ts). With
 * UNVERIFIED_OWNER_MESSAGE_FILTER on, that reminder branch, and only that
 * branch, goes through ownerMessagePolicy: filtered, with the footer, within
 * the per-call cap, nothing without a call session. Notes, tasks and shopping
 * items reach no one and are not gated. Reached through the simple-utilities
 * domain's exported definitions; mocked at the edges only (reminder store,
 * promises, productivity store). All data is fictional.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const OWNER = 'owner-uid';
const PHISH_REMINDER = 'remind me tomorrow: your bank needs you to call 212 555 0198';

const edges = vi.hoisted(() => ({
  reminder: vi.fn(async (..._a: unknown[]) => ({ id: 'reminder-q1', scheduledFor: new Date() })),
  saved: vi.fn((..._a: unknown[]) => undefined),
  logged: vi.fn((..._a: unknown[]) => undefined),
}));
vi.mock('../../../../../utils/safe-logger.js', async (orig) => {
  const real = await orig<typeof import('../../../../../utils/safe-logger.js')>();
  const logger: Record<string, unknown> = { info: edges.logged, warn: vi.fn(), error: vi.fn() };
  Object.assign(logger, { debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(), child: () => logger });
  return { ...real, getLogger: () => logger };
});
vi.mock('../../../../../services/scheduling/reminder-scheduler.js', async (orig) => ({
  ...(await orig<object>()),
  createReminder: edges.reminder,
  startReminderScheduler: () => undefined,
}));
vi.mock('../../../../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordScheduledPromise: async () => undefined,
  recordReminderPromise: async () => undefined,
}));
vi.mock('../../../../../services/stores/productivity-store.js', () => ({
  getProductivityStore: () => ({
    setTask: edges.saved,
    setNote: edges.saved,
    setShoppingList: edges.saved,
  }),
}));

import type { Tool, ToolContext } from '../../../../registry/types.js';
import { definitions as utilityDefs } from '../../../simple-utilities/index.js';
import {
  UNVERIFIED_CAP_REFUSAL,
  UNVERIFIED_CONTENT_REFUSAL,
  UNVERIFIED_FOOTER,
  UNVERIFIED_NOTHING_SENT_REFUSAL,
} from '../owner-message-policy.js';

const ctx: ToolContext = { userId: OWNER, agentId: 'ferni', agentDisplayName: 'Ferni' };
let calls = 0;
const run = (userData: Record<string, unknown>) => ({ toolCallId: 't', ctx: { userData } });
/** A fresh live call each time: session-manager's services carry its id. */
const unverified = () =>
  run({ userId: OWNER, verifiedCaller: false, services: { sessionId: `session-QC_${++calls}` } }); // prettier-ignore
const verified = () => run({ userId: OWNER, verifiedCaller: true });

const quickCapture = (): Tool => {
  const def = utilityDefs.find((d) => d.id === 'quickCapture');
  if (!def) throw new Error("no quickCapture in the domain's definitions");
  return def.create(ctx);
};
const capture = (thought: string, opts: unknown) => quickCapture().execute({ thought }, opts);
const stored = (): string[] =>
  edges.reminder.mock.calls.map((c) => String((c[0] as { message: string }).message));

beforeEach(() => {
  edges.reminder.mockClear();
  edges.saved.mockClear();
  edges.logged.mockClear();
  vi.stubEnv('UNVERIFIED_OWNER_MESSAGE_FILTER', 'on');
});
afterEach(() => vi.unstubAllEnvs());

describe('quickCapture, reminder branch', () => {
  it('an unverified call cannot save a phishing reminder', async () => {
    expect(await capture(PHISH_REMINDER, unverified())).toBe(UNVERIFIED_CONTENT_REFUSAL);
    expect(edges.reminder).not.toHaveBeenCalled();
  });

  it("an unverified call's ordinary reminder is saved with the footer, at the time it said", async () => {
    const out = String(await capture('remind me to water the plants tomorrow', unverified()));
    expect(stored()).toEqual([`remind me to water the plants tomorrow\n\n${UNVERIFIED_FOOTER}`]);
    expect(out).toContain('Saved one reminder');
  });

  it('a verified call is unchanged: no filter, no footer', async () => {
    await capture(PHISH_REMINDER, verified());
    expect(stored()).toEqual([PHISH_REMINDER]);
  });

  it('with the flag off, an unverified call is unchanged', async () => {
    vi.stubEnv('UNVERIFIED_OWNER_MESSAGE_FILTER', 'off');
    await capture(PHISH_REMINDER, unverified());
    expect(stored()).toEqual([PHISH_REMINDER]);
  });

  it('counts toward the per-call cap', async () => {
    const sameCall = unverified();
    await capture('remind me to stretch tomorrow', sameCall);
    await capture('remind me to call the vet tomorrow', sameCall);
    expect(await capture('remind me to buy stamps tomorrow', sameCall)).toBe(UNVERIFIED_CAP_REFUSAL); // prettier-ignore
    expect(stored()).toHaveLength(2);
  });

  it('an allowed reminder that is then not saved is logged as delivery_failed, without the text', async () => {
    edges.reminder.mockRejectedValueOnce(new Error('store down'));
    await capture('remind me to stretch tomorrow', unverified());
    const failed = edges.logged.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(failed).toContainEqual(expect.objectContaining({ tool: 'quickCapture', reason: 'delivery_failed' })); // prettier-ignore
    expect(JSON.stringify(edges.logged.mock.calls)).not.toContain('stretch');
  });

  it('a run with no call session saves no reminder (a routed run)', async () => {
    const routed = run({ userId: OWNER, verifiedCaller: false });
    expect(await capture('remind me to stretch tomorrow', routed)).toBe(UNVERIFIED_NOTHING_SENT_REFUSAL); // prettier-ignore
    expect(edges.reminder).not.toHaveBeenCalled();
  });
});

describe('quickCapture, other branches reach no one and are not gated', () => {
  it.each([
    ['an idea', 'idea: ask the plumber at 212 555 0198 about the sink'],
    ['a task', 'need to renew the car registration, form 5550198'],
    ['a shopping item', 'buy the 212 555 0198 replacement filter'],
  ])('%s with a number is saved for an unverified call', async (_kind, thought) => {
    const out = String(await capture(thought, unverified()));
    expect(out).not.toBe(UNVERIFIED_CONTENT_REFUSAL);
    expect(edges.saved).toHaveBeenCalledTimes(1);
    expect(edges.reminder).not.toHaveBeenCalled();
  });

  it('and they do not spend the per-call cap', async () => {
    const sameCall = unverified();
    for (const thought of ['idea: a garden bench', 'buy oat milk', 'need to fix the gate']) {
      await capture(thought, sameCall);
    }
    await capture('remind me to stretch tomorrow', sameCall);
    await capture('remind me to call the vet tomorrow', sameCall);
    expect(stored()).toHaveLength(2);
  });
});
