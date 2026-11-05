/**
 * MORNING_BRIEF_RUN: every run says how many it looked at, wrote for and sent,
 * and why the rest got nothing. Prod's 28 eight-o'clock runs in a week all
 * ended "nothing-today" with commitments off; the line now carries both.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuardedText, TextOutcome } from '../../guarded-text.js';

const runLines = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => {
  const logger = (): Record<string, unknown> => ({
    debug: vi.fn(),
    info: vi.fn((fields: Record<string, unknown>, msg?: string) => {
      if (msg === 'MORNING_BRIEF_RUN') runLines.push(fields);
    }),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => logger(),
  });
  return { ...(await importOriginal<object>()), createLogger: logger };
});

const { runMorningBriefs } = await import('../brief-job.js');
type Deps = Parameters<typeof runMorningBriefs>[0];
type DayItems = Awaited<ReturnType<Deps['readDay']>>;

const OWNER = 'uid-owner';
const EIGHT_AM = new Date('2026-10-18T13:05:00Z'); // 08:05 in Chicago
const EMPTY: DayItems = { events: [], reminders: [], tasks: [], commitments: [] };

function deps(day: DayItems, env: Record<string, string> = {}) {
  const sendText = vi.fn(async (_t: GuardedText): Promise<TextOutcome> => ({ sent: true }));
  const d: Deps = {
    env: { MORNING_BRIEF: 'on', ...env },
    // The owner's own override, as in prod: no env list.
    cohortUsers: async () => [OWNER],
    userDoc: async () => ({ contactInfo: { timezone: 'America/Chicago' }, name: 'Sam Tester' }),
    readDay: async () => day,
    claims: { claim: async () => true, release: async () => undefined },
    sendText,
    sendPush: vi.fn(async () => true),
  };
  return { d, sendText };
}

beforeEach(() => {
  runLines.length = 0;
});

describe('MORNING_BRIEF_RUN', () => {
  it('an empty day: looked at one, wrote nothing, says nothing-today and that commitments are off', async () => {
    const { d, sendText } = deps(EMPTY);
    await runMorningBriefs(d, EIGHT_AM);
    expect(sendText).not.toHaveBeenCalled();
    expect(runLines).toEqual([
      {
        considered: 1,
        eligible: 0,
        sent: 0,
        skippedBy: { 'nothing-today': 1 },
        enabled: true,
        commitments: 'off',
      },
    ]);
  });

  it('the same owner with an open commitment that day is texted, and the line counts the send', async () => {
    const { d, sendText } = deps(
      { ...EMPTY, commitments: ['send the photos'] },
      { MORNING_BRIEF_COMMITMENTS: 'on' }
    );
    await runMorningBriefs(d, EIGHT_AM);
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][0]).toMatchObject({ userId: OWNER, kind: 'morning-brief' });
    expect(runLines).toEqual([
      expect.objectContaining({ considered: 1, eligible: 1, sent: 1, commitments: 'on' }),
    ]);
  });

  it('outside 08:00 it counts the person as not-8am, not as a send', async () => {
    const { d } = deps({ ...EMPTY, tasks: ['taxes'] });
    await runMorningBriefs(d, new Date('2026-10-18T15:05:00Z'));
    expect(runLines[0]).toMatchObject({ eligible: 0, sent: 0, skippedBy: { 'not-8am': 1 } });
  });
});
