/**
 * SCHEDULE_CALL_WHO: scheduleCall only rings the caller's own verified phone.
 *
 * The turn shape: Sam asks "Can you schedule a call to my friend Alex at six to
 * wish him happy birthday?", and the model calls scheduleCall with the birthday
 * words and "in 2 hours". Main rings Sam then and plays those words to Sam.
 * With the flag on, the model also fills `recipient`; "other" schedules nothing
 * and writes nothing. Anything else is scheduled exactly as main does, whatever
 * else the call carries (a stray `who` is never read).
 *
 * Every row runs twice: through LiveKit's executeToolCall (JSON args, the zod
 * parse, then execute), as a live call does, and through execute with the raw
 * arguments, as a routed tool path does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The verified phone on the account; the profile's own contact number is someone else's. */
const VERIFIED = '+18015550100';
const PROFILE_PHONE = '+18015550199';

const sent = vi.hoisted(() => ({
  reminder: vi.fn(async (..._a: unknown[]) => ({ id: 'r1' })),
  promise: vi.fn(async (..._a: unknown[]) => undefined),
  dial: vi.fn(),
  lookup: vi.fn(async (..._a: unknown[]) => '+18015550100'),
}));

vi.mock('../../../../services/scheduling/reminder-scheduler.js', async (orig) => ({
  ...(await orig<object>()),
  createReminder: sent.reminder,
  startReminderScheduler: () => undefined,
}));
vi.mock('../../../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordScheduledPromise: sent.promise,
  recordReminderPromise: sent.promise,
}));
vi.mock('../../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({
    getProfile: async () => ({ contactInfo: { phone: '+18015550199' } }),
  }),
}));

import { llm } from '@livekit/agents';
import type { ToolContext } from '../../../registry/types.js';
import { getLogger } from '../../../../utils/safe-logger.js';
import { setCallUserPort } from '../../proactive/outreach/call-user-port.js';
import { definitions } from '../index.js';
import { TOOL_REFUSAL } from '../../../../agents/personas/action-claims.js';
import { NOT_FOR_SOMEONE_ELSE, RECIPIENT_DESCRIPTION } from '../schedule-call-recipient.js';

const ctx: ToolContext = { userId: 'uid-schedule-recipient', agentId: 'ferni', agentDisplayName: 'Ferni' }; // prettier-ignore
const BIRTHDAY = { message: 'Happy birthday, Alex! Talk soon.', when: 'in 2 hours' };

const DEF = definitions.find((d) => d.id === 'scheduleCall');
if (!DEF) throw new Error('scheduleCall is not in the scheduling domain');
interface BuiltTool {
  description: string;
  parameters: unknown;
  execute: (args: unknown, opts: unknown) => unknown;
}
const build = (): BuiltTool => DEF.create(ctx) as unknown as BuiltTool;

/** main's scheduleCall description (scheduling/index.ts before SCHEDULE_CALL_WHO). */
const MAIN_DESCRIPTION = `Schedule a phone call for later.
Use when the user says things like:
- "Call me at 2pm to remind me about the meeting"
- "Give me a wake-up call tomorrow at 7am"
- "Call me tonight if I haven't worked out by 8pm"

The call will play a voice message when answered.`;

/** What the model is sent: the parameters as the Google plugin converts them. */
const declared = () =>
  llm.toJsonSchema(build().parameters as never, false) as {
    properties: Record<string, unknown>;
    required?: string[];
  };

type Path = 'live' | 'routed';
/** One tool run: through LiveKit's parse and execute (live) or execute alone (routed). */
async function run(args: Record<string, unknown>, path: Path): Promise<string> {
  const tool = build();
  if (path === 'routed') return String(await tool.execute(args, {}));
  const toolCtx = new llm.ToolContext({ scheduleCall: tool } as never);
  const call = llm.FunctionCall.create({ callId: 'c1', name: 'scheduleCall', args: JSON.stringify(args) }); // prettier-ignore
  const out = await llm.executeToolCall(call, toolCtx);
  expect(out.isError).toBe(false); // a value the schema doesn't know never drops the call
  return JSON.parse(out.output) as string; // LiveKit hands the model the result as JSON
}

const isMock = (v: unknown): v is ReturnType<typeof vi.fn> => vi.isMockFunction(v);
/** Every logger call: module loggers made at import, and loggers made per call. */
const LOGGERS_AT_IMPORT = vi.mocked(getLogger).mock.results.map((r) => r.value as object);
const logCalls = (): unknown[][] =>
  [...new Set([...LOGGERS_AT_IMPORT, ...vi.mocked(getLogger).mock.results.map((r) => r.value as object)])] // prettier-ignore
    .flatMap((logger) => Object.values(logger).filter(isMock))
    .flatMap((fn) => fn.mock.calls);

interface Outcome {
  reply: string;
  reminders: unknown[][];
  promises: unknown[][];
  dials: number;
}
async function outcome(args: Record<string, unknown>, path: Path): Promise<Outcome> {
  const reply = await run(args, path);
  const out = {
    reply,
    reminders: [...sent.reminder.mock.calls],
    promises: [...sent.promise.mock.calls],
    dials: sent.dial.mock.calls.length,
  };
  vi.clearAllMocks();
  return out;
}
/** main's run of this turn: the flag off and nothing but message and when. */
async function asMain(path: Path): Promise<Outcome> {
  vi.stubEnv('SCHEDULE_CALL_WHO', 'off');
  const main = await outcome(BIRTHDAY, path);
  vi.unstubAllEnvs();
  return main;
}
const addressOf = (o: Outcome): unknown[] =>
  o.reminders.map((c) => (c[0] as { deliveryAddress: string }).deliveryAddress);

/** Whatever the model writes in a stray `who`: names, initials, self phrases, digits. */
const WHO = [
  undefined,
  'me',
  'Call me',
  'José', // NFC
  'José', // the same name, NFD
  'Riley T.',
  'me from work',
  'the family landline',
  '801-555-0100 ext 12',
  'order #55501234',
  'Alex',
  'my friend Alex',
  'Mom',
];
const MISSING_OR_UNKNOWN = [undefined, null, '', 'Other', 'OTHER', 'someone else', 'me', 42];
const PATHS: Path[] = ['live', 'routed'];
const grid = <T>(values: T[]) =>
  PATHS.flatMap((path) => values.flatMap((r) => WHO.map((who) => [path, r, who] as const)));
const argsOf = (recipient: unknown, who: string | undefined): Record<string, unknown> => ({
  ...BIRTHDAY,
  ...(recipient === undefined ? {} : { recipient }),
  ...(who === undefined ? {} : { who }),
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-06T15:00:00Z') });
  sent.lookup.mockImplementation(async () => VERIFIED);
  setCallUserPort({ verifiedPhone: sent.lookup, verifiedEmail: async () => undefined, call: sent.dial } as never); // prettier-ignore
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  setCallUserPort(undefined);
  vi.clearAllMocks();
});

describe('SCHEDULE_CALL_WHO off (or unset): the tool is main', () => {
  it.each(['off', undefined])('flag %j: no recipient parameter, main description', (flag) => {
    if (flag) vi.stubEnv('SCHEDULE_CALL_WHO', flag);
    expect(Object.keys(declared().properties)).toEqual(['message', 'when']);
    expect(build().description).toBe(MAIN_DESCRIPTION);
  });

  it.each(grid(['other', 'self', ...MISSING_OR_UNKNOWN]))(
    '%s, recipient %j, who %j sent anyway: the caller is rung exactly as main does',
    async (path, recipient, who) => {
      const main = await asMain(path);
      const head = await outcome(argsOf(recipient, who), path);
      expect(head).toEqual(main);
      expect(addressOf(head)).toEqual([VERIFIED]);
    }
  );
});

describe('SCHEDULE_CALL_WHO on', () => {
  beforeEach(() => vi.stubEnv('SCHEDULE_CALL_WHO', 'on'));

  it('the model sees an optional recipient field, self or other, with its description', () => {
    const schema = declared();
    expect(schema.properties.recipient).toEqual({
      type: 'string',
      enum: ['self', 'other'],
      description: RECIPIENT_DESCRIPTION,
    });
    expect(schema.required ?? []).not.toContain('recipient');
    expect(build().description.startsWith(MAIN_DESCRIPTION)).toBe(true);
    expect(build().description).toContain('set recipient to "other": nothing is scheduled');
  });

  it.each(grid(MISSING_OR_UNKNOWN))(
    '%s, recipient %j, who %j: scheduled exactly as main does',
    async (path, recipient, who) => {
      const main = await asMain(path);
      vi.stubEnv('SCHEDULE_CALL_WHO', 'on');
      const head = await outcome(argsOf(recipient, who), path);
      expect(head).toEqual(main);
      expect(addressOf(head)).toEqual([VERIFIED]);
    }
  );

  it.each(grid(['self']))(
    '%s, recipient %j, who %j: the call rings the verified phone',
    async (path, _self, who) => {
      const head = await outcome(argsOf('self', who), path);
      expect(head.reply).toContain("I'll call you on");
      expect(head.reply).not.toMatch(TOOL_REFUSAL);
      expect(addressOf(head)).toEqual([VERIFIED]); // never the profile's PROFILE_PHONE
      expect(head.promises).toHaveLength(1);
    }
  );

  it.each(grid(['other']))(
    '%s, recipient %j, who %j: nothing scheduled, written, looked up or logged but a count',
    async (path, _other, who) => {
      const reply = await run(argsOf('other', who), path);
      expect(reply).toBe(NOT_FOR_SOMEONE_ELSE);
      expect(reply).toMatch(TOOL_REFUSAL); // the action-claim guard reads it as nothing done
      expect(reply).not.toMatch(/I can call|remind you|right now/i); // nothing offered instead
      expect(sent.reminder).not.toHaveBeenCalled();
      expect(sent.promise).not.toHaveBeenCalled();
      expect(sent.dial).not.toHaveBeenCalled();
      expect(sent.lookup).not.toHaveBeenCalled();
      expect(logCalls()).toEqual([
        [{ userId: ctx.userId, recipient: 'other' }, expect.any(String)],
      ]);
    }
  );
});

describe('the dial target', () => {
  it.each(['off', 'on'])('flag %s: the verified phone, never the profile number', async (flag) => {
    vi.stubEnv('SCHEDULE_CALL_WHO', flag);
    const head = await outcome(argsOf('self', PROFILE_PHONE), 'live');
    expect(addressOf(head)).toEqual([VERIFIED]);
  });

  it('nothing is logged or echoed of the verified phone beyond main', async () => {
    vi.stubEnv('SCHEDULE_CALL_WHO', 'on');
    const reply = await run(argsOf('other', VERIFIED), 'routed');
    expect(reply).not.toContain('555');
    expect(JSON.stringify(logCalls())).not.toContain('555');
  });
});
