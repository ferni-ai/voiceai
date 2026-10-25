/**
 * The registered wellbeing and dates after-call tasks run only on a member's
 * own call (isMemberIdentity). Runs the real registry with only the model
 * mocked: an unrecognised caller (anon:) and the third party on a call placed
 * for someone (onbehalf:) get no model call; the member does, unless MINOR_CARE
 * holds the call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callLLM = vi.fn(async (_prompt: string, _opts?: unknown) => '{}');
vi.mock('../../services/llm-utils.js', () => ({
  callLLM: (p: string, o?: unknown) => callLLM(p, o),
}));

const { drainAfterCallTasks, registeredAfterCallTasks, runAfterCallTasks } =
  await import('../../services/session/after-call-tasks.js');
const { noteCallerWords, resetMinorCare } = await import('../../utils/minor-care.js');
// Registers each task once, into the registry imported above
await import('../wellbeing-register.js');
await import('../dates-register.js');

const turns = [
  { role: 'assistant', content: 'How was the week?' },
  { role: 'user', content: "Wiped out, and my mom's birthday is Friday." },
];

async function callEnds(userId: string): Promise<number> {
  callLLM.mockClear();
  runAfterCallTasks({ userId, sessionId: `s-${userId}`, turns, startedAt: new Date() });
  await drainAfterCallTasks(5_000);
  return callLLM.mock.calls.length;
}

describe('wellbeing and dates after-call tasks: whose call', () => {
  beforeEach(() => {
    vi.stubEnv('WELLBEING_AFTER_CALL', 'on');
    vi.stubEnv('DATES_THAT_MATTER', 'on');
    vi.stubEnv('COHORT_FLAGS', 'off');
    expect(registeredAfterCallTasks()).toEqual(['wellbeing-after-call', 'dates-that-matter']);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetMinorCare();
  });

  it.each([
    ['an unrecognised caller', 'anon:5e4001b2-6005-40e8-bd29-abf9bc9ed648'],
    ['the third party on a call placed for someone', 'onbehalf:call-123'],
  ])('makes no model call for %s', async (_label, userId) => {
    expect(await callEnds(userId)).toBe(0);
  });

  it("reads the member's own call (one model call per task)", async () => {
    expect(await callEnds('u-member-1')).toBe(2);
  });

  it('makes no model call on a call MINOR_CARE holds (the caller sounded under 18)', async () => {
    vi.stubEnv('MINOR_CARE', 'on');
    noteCallerWords('s-u-member-2', "I'm 15.");
    expect(await callEnds('u-member-2')).toBe(0);
  });
});
