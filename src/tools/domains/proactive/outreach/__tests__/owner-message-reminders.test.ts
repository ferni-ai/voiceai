/**
 * Every reminder can be texted to the owner (reminder-text-guard.ts), so each
 * reminder tool goes through ownerMessagePolicy like the #3227 tools. With
 * UNVERIFIED_OWNER_MESSAGE_FILTER on, an unverified call's reminder is
 * filtered, carries the footer, and counts toward the same per-call cap; a
 * verified call, and everyone with the flag off, is unchanged. Each tool is
 * reached the way a live session reaches it: the domain's exported
 * definitions, and the Alex agent's own tool set. Mocked at the edges only:
 * the reminder store, promises, Firestore. All data is fictional.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const OWNER = { id: 'owner-uid', phone: '+12125550143' };
const PHISH = 'your bank needs you to call 212 555 0198 today';

const edges = vi.hoisted(() => ({
  reminder: vi.fn(async (..._a: unknown[]) => ({ id: 'reminder-r1', scheduledFor: new Date() })),
}));
vi.mock('../../../../../services/scheduling/reminder-scheduler.js', async (orig) => ({
  ...(await orig<object>()),
  createReminder: edges.reminder,
  startReminderScheduler: () => undefined,
}));
vi.mock('../../../../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordScheduledPromise: async () => undefined,
  recordReminderPromise: async () => undefined,
}));
vi.mock('../../../../../memory/firestore-store.js', () => ({
  getFirestoreStore: () => ({
    getDatabase: async () => {
      throw new Error('no Firestore in tests');
    },
  }),
}));

import type { Tool, ToolContext, ToolDefinition } from '../../../../registry/types.js';
import { definitions as communicationDefs } from '../../../communication/index.js';
import { definitions as productivityDefs } from '../../../productivity/index.js';
import { definitions as utilityDefs } from '../../../simple-utilities/index.js';
import { setCallUserPort, type CallUserPort } from '../call-user-port.js';
import {
  UNVERIFIED_CAP_REFUSAL,
  UNVERIFIED_CONTENT_REFUSAL,
  UNVERIFIED_FOOTER,
  UNVERIFIED_NOTHING_SENT_REFUSAL,
  ownerMessageSpecs,
} from '../owner-message-policy.js';

const ctx: ToolContext = { userId: OWNER.id, agentId: 'ferni', agentDisplayName: 'Ferni' };
let calls = 0;
const run = (userData: Record<string, unknown>) => ({ toolCallId: 't', ctx: { userData } });
/** A fresh live call each time: session-manager's services carry its id. */
const unverified = () =>
  run({ userId: OWNER.id, verifiedCaller: false, services: { sessionId: `session-RM_${++calls}` } }); // prettier-ignore
const verified = () => run({ userId: OWNER.id, verifiedCaller: true });

const fromDefs = (defs: ToolDefinition[], id: string): Tool => {
  const def = defs.find((d) => d.id === id);
  if (!def) throw new Error(`no ${id} in the domain's definitions`);
  return def.create(ctx);
};
async function alexTools(): Promise<Record<string, Tool>> {
  const { AlexAgent } = await import('../../../../../agents/personas/alex-agent.js');
  return new AlexAgent('You are Alex.').toolCtx.functionTools as unknown as Record<string, Tool>;
}
/** Alex's communication tools as built, before the agent's later tool sets shadow any. */
async function alexCommunicationTools(): Promise<Record<string, Tool>> {
  const { buildCommunicationTools } = await import('../../../../../agents/personas/alex-agent.js');
  return buildCommunicationTools() as unknown as Record<string, Tool>;
}

/** One reminder path: how to run it with the model-written words, and where those words land. */
interface ReminderPath {
  name: string;
  tool: () => Promise<Tool>;
  args: (words: string) => Record<string, unknown>;
}
const PATHS: ReminderPath[] = [
  {
    name: 'setReminder (productivity)',
    tool: async () => fromDefs(productivityDefs, 'setReminder'),
    args: (message) => ({ message, when: 'tomorrow at 9am' }),
  },
  {
    name: "Alex's setReminder (communication tool set)",
    tool: async () => (await alexCommunicationTools()).setReminder,
    args: (message) => ({ message, when: 'tomorrow at 9am' }),
  },
  {
    name: "Alex's scheduleCall (its 15-minute reminder text)",
    tool: async () => (await alexTools()).scheduleCall,
    args: (purpose) => ({ contact: 'Dr. Okafor', purpose, dateTime: 'tomorrow at 2pm' }),
  },
  {
    name: 'scheduleReminder (communication domain)',
    tool: async () => fromDefs(communicationDefs, 'scheduleReminder'),
    args: (title) => ({ type: 'reminder', title, when: 'tomorrow at 9am' }),
  },
  {
    name: 'recurringReminder',
    tool: async () => fromDefs(utilityDefs, 'recurringReminder'),
    args: (message) => ({ message, pattern: 'daily', time: '9am' }),
  },
];

/** The text each stored reminder would deliver. */
const stored = (): string[] =>
  edges.reminder.mock.calls.map((c) => String((c[0] as { message: string }).message));
/** Everything the reminder sender delivers to the owner: the message and, for email, the subject. */
const delivered = (): string[] =>
  edges.reminder.mock.calls.flatMap((c) => {
    const r = c[0] as { message?: unknown; subject?: unknown };
    return [r.message, r.subject].filter((t): t is string => typeof t === 'string');
  });

beforeEach(() => {
  edges.reminder.mockClear();
  setCallUserPort({ verifiedPhone: async () => OWNER.phone } as unknown as CallUserPort);
  vi.stubEnv('UNVERIFIED_OWNER_MESSAGE_FILTER', 'on');
});
afterEach(() => {
  setCallUserPort(undefined);
  vi.unstubAllEnvs();
});

describe.each(PATHS)('$name', (path) => {
  it('an unverified call cannot store a phishing reminder', async () => {
    const tool = await path.tool();
    expect(await tool.execute(path.args(PHISH), unverified())).toBe(UNVERIFIED_CONTENT_REFUSAL);
    expect(edges.reminder).not.toHaveBeenCalled();
  });

  it("an unverified call's ordinary reminder is stored with the footer", async () => {
    const tool = await path.tool();
    await tool.execute(path.args('pick up the dry cleaning'), unverified());
    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toContain(`pick up the dry cleaning\n\n${UNVERIFIED_FOOTER}`);
  });

  it('a verified call is unchanged: no filter, no footer', async () => {
    const tool = await path.tool();
    await tool.execute(path.args(PHISH), verified());
    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toContain(PHISH);
    expect(stored()[0]).not.toContain(UNVERIFIED_FOOTER);
  });

  it('every argument that reaches the delivered reminder is screened (derived from the sender)', async () => {
    const tool = await path.tool();
    const ordinary = path.args('pick up the dry cleaning');
    for (const [name, value] of Object.entries(ordinary)) {
      if (typeof value !== 'string') continue;
      await tool.execute({ ...ordinary, [name]: PHISH }, unverified());
      expect(
        delivered().filter((t) => t.includes(PHISH)),
        name
      ).toEqual([]);
    }
  });

  it('with the flag off, an unverified call is unchanged', async () => {
    vi.stubEnv('UNVERIFIED_OWNER_MESSAGE_FILTER', 'off');
    const tool = await path.tool();
    await tool.execute(path.args(PHISH), unverified());
    expect(stored()).toEqual([expect.not.stringContaining(UNVERIFIED_FOOTER)]);
  });
});

describe('the spec table', () => {
  it.each(ownerMessageSpecs())(
    '%s screens at least the field its footer goes on',
    (_name, spec) => {
      expect(spec.texts.length).toBeGreaterThan(0);
      expect(spec.texts).toContain(spec.footerOn);
    }
  );
});

describe("Alex's live setReminder", () => {
  it("is the conversation tools' note, which stores and sends nothing", async () => {
    const tools = await alexTools();
    const out = await tools.setReminder.execute(
      { reminder: PHISH, timeframe: 'soon' },
      unverified()
    );
    expect(String(out)).toMatch(/^I've made a note/);
    expect(edges.reminder).not.toHaveBeenCalled();
  });
});

describe('the cap and the fail-closed cases', () => {
  it('reminders share the per-call cap with every other owner message', async () => {
    const setReminder = fromDefs(productivityDefs, 'setReminder');
    const recurring = fromDefs(utilityDefs, 'recurringReminder');
    const sameCall = unverified();
    await setReminder.execute({ message: 'water the plants', when: 'tomorrow at 9am' }, sameCall);
    await recurring.execute({ message: 'stretch', pattern: 'daily', time: '9am' }, sameCall);
    const third = { contact: 'Dr. Okafor', purpose: 'checkup', dateTime: 'tomorrow at 2pm' };
    expect(await (await alexTools()).scheduleCall.execute(third, sameCall)).toBe(
      UNVERIFIED_CAP_REFUSAL
    );
    expect(stored()).toHaveLength(2);
  });

  it('a run with no call session stores nothing (a routed run)', async () => {
    const tool = fromDefs(utilityDefs, 'recurringReminder');
    const routed = run({ userId: OWNER.id, verifiedCaller: false });
    const args = { message: 'stretch', pattern: 'daily', time: '9am' };
    expect(await tool.execute(args, routed)).toBe(UNVERIFIED_NOTHING_SENT_REFUSAL);
    expect(edges.reminder).not.toHaveBeenCalled();
  });

  it('a calendar event from scheduleReminder sends the owner nothing, so it skips the policy', async () => {
    const tool = fromDefs(communicationDefs, 'scheduleReminder');
    const event = { type: 'event', title: 'Dentist, 212 555 0198', when: 'tomorrow at 3pm' };
    const out = String(await tool.execute(event, unverified()));
    expect(out).not.toBe(UNVERIFIED_CONTENT_REFUSAL);
    expect(edges.reminder).not.toHaveBeenCalled();
  });
});
