/**
 * A check-in concern the model marks "URGENT" or "critical" reaches the sponsor
 * exactly as one marked "urgent" does: any case, trimmed. Every level that alerts
 * today still alerts, every level that doesn't still doesn't, and an unknown value
 * keeps today's behaviour (no alert, stored as "low"). Fictional people only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => ({ messages: [] as string[] }));

vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null),
  cleanForFirestore: (v: unknown) => v,
}));
vi.mock('../../llm-utils.js', () => ({ callLLM: vi.fn() }));
vi.mock('../urgent-alert.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../urgent-alert.js')>()),
  sendUrgentAlert: vi.fn(async (_user: string, message: string) => {
    sent.messages.push(message);
  }),
}));

import { callLLM } from '../../llm-utils.js';
import { handleCheckinCallComplete } from '../../family/family-checkin-caller.js';
import { analyzeCheckinCall } from '../../family/family-checkin-summary.js';
import { generateUrgentNotification } from '../checkin-urgent-alert.js';

const NAME = 'Rosa';
const CONCERN = 'mentioned chest pain since this morning';

function alertAt(urgency: unknown): string | null {
  return generateUrgentNotification({
    familyMemberName: NAME,
    concernsIdentified: [{ description: CONCERN, urgency: urgency as string }],
  });
}

const URGENT_ALERT = alertAt('urgent');
const HIGH_ALERT = alertAt('high');

/** The model's reply for one concern at this urgency. */
function analysisWith(urgency: unknown): string {
  return JSON.stringify({
    mood: 'worried',
    summary: 'Rosa sounded worried.',
    concerns: [{ description: CONCERN, urgency, category: 'health' }],
  });
}

const RAISED_TO_URGENT = ['URGENT', 'Urgent', ' critical ', 'CRITICAL', 'critical', ' urgent '];
const UNKNOWN = ['severe', 'none', '', 'urgentish', 'not urgent', 5, null, undefined];

describe('check-in alert: urgency in any case', () => {
  it('the urgent alert itself is unchanged', () => {
    expect(URGENT_ALERT).toBe(
      `Important: During my call with ${NAME}, ${CONCERN}. You may want to check in with them.`
    );
  });

  it.each(RAISED_TO_URGENT)('%j alerts exactly like "urgent"', (urgency) => {
    expect(alertAt(urgency)).toBe(URGENT_ALERT);
  });

  it.each(['HIGH', 'High', ' high '])('%j alerts exactly like "high"', (urgency) => {
    expect(alertAt(urgency)).toBe(HIGH_ALERT);
  });

  it.each([
    ['urgent', URGENT_ALERT],
    ['high', HIGH_ALERT],
    ['medium', null],
    ['low', null],
  ])('must not change: %j', (urgency, expected) => {
    expect(expected === null || expected.length > 0).toBe(true);
    expect(alertAt(urgency)).toBe(expected);
  });

  it.each(UNKNOWN)('an unknown urgency %j keeps today: no alert', (urgency) => {
    expect(alertAt(urgency)).toBeNull();
  });

  it('a later "CRITICAL" concern is the one passed on when the first does not alert', () => {
    const alert = generateUrgentNotification({
      familyMemberName: NAME,
      concernsIdentified: [
        { description: 'seemed a little tired', urgency: 'low' },
        { description: CONCERN, urgency: 'CRITICAL' },
      ],
    });
    expect(alert).toBe(URGENT_ALERT);
  });
});

describe('check-in summary: the stored urgency', () => {
  it.each<[unknown, string]>([
    ...RAISED_TO_URGENT.map((u): [unknown, string] => [u, 'urgent']),
    ['HIGH', 'high'],
    [' Medium ', 'medium'],
    ['LOW', 'low'],
    ['urgent', 'urgent'],
    ['high', 'high'],
    ['medium', 'medium'],
    ['low', 'low'],
    ...UNKNOWN.map((u): [unknown, string] => [u, 'low']),
  ])('the model wrote %j: stored as %j', async (written, stored) => {
    vi.mocked(callLLM).mockResolvedValueOnce(analysisWith(written));
    const analysis = await analyzeCheckinCall([], NAME, 'Marcus', 'grandmother');
    expect(analysis?.concerns.map((c) => c.urgency)).toEqual([stored]);
  });
});

describe('check-in alert: the send path', () => {
  beforeEach(() => {
    sent.messages = [];
  });

  async function completeWith(urgency: unknown): Promise<string[]> {
    vi.mocked(callLLM).mockResolvedValueOnce(analysisWith(urgency));
    // Reaches the alert through the lazy import in family-checkin-caller.ts.
    await handleCheckinCallComplete('call-test-urgency', 'sponsor-test-1', {
      status: 'completed',
      transcript: [
        { role: 'assistant', content: 'How are you doing today?' },
        { role: 'user', content: 'Not great.' },
      ],
      familyMemberName: NAME,
      relationship: 'grandmother',
    });
    return sent.messages;
  }

  it.each(['URGENT', 'critical', ' CRITICAL '])(
    '%j reaches the sponsor as "urgent" does',
    async (urgency) => {
      expect(await completeWith(urgency)).toEqual([URGENT_ALERT]);
    }
  );

  it.each([
    ['urgent', [URGENT_ALERT]],
    ['high', [HIGH_ALERT]],
    ['medium', []],
    ['low', []],
    ['severe', []],
  ])('must not change: %j', async (urgency, expected) => {
    expect(await completeWith(urgency)).toEqual(expected);
  });
});
