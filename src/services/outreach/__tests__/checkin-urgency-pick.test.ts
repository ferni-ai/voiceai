/**
 * Which concern the sponsor hears about when a check-in call raised two. The
 * alert and the briefing pass on one urgent/high concern. Reading labels in any
 * case and "critical" as urgent may only ADD a pick: when a concern's label was
 * already "urgent" or "high", it is still the one passed on, as before, even if
 * an earlier concern only reads as urgent/high once trimmed or lowercased.
 * Fictional people only.
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
import {
  generateBriefingSummary,
  type CheckinCallRecord,
  type FlaggedConcern,
} from '../../family/proactive-family-checkin.js';
import { generateUrgentNotification } from '../checkin-urgent-alert.js';

const NAME = 'Rosa';
const KNEE = 'her knee has been sore after the walk';
const CRISIS = "said she doesn't want to be here anymore";
const FALL = 'mentioned she slipped on the back step';

interface Written {
  description: string;
  urgency: string;
}

/** Two concerns where only the second label was already canonical. */
const PAIRS: Array<[string, Written, Written]> = [
  ['High, high', { description: KNEE, urgency: 'High' }, { description: CRISIS, urgency: 'high' }],
  [
    "' HIGH ', urgent",
    { description: KNEE, urgency: ' HIGH ' },
    { description: FALL, urgency: 'urgent' },
  ],
  [
    'CRITICAL, urgent',
    { description: KNEE, urgency: 'CRITICAL' },
    { description: FALL, urgency: 'urgent' },
  ],
  [
    'critical, high',
    { description: KNEE, urgency: 'critical' },
    { description: CRISIS, urgency: 'high' },
  ],
  [
    "' URGENT ' knee, 'urgent' third-person crisis",
    { description: KNEE, urgency: ' URGENT ' },
    { description: CRISIS, urgency: 'urgent' },
  ],
];

/** The alert for one concern alone: what the sponsor got for it before this change. */
function alertFor(concern: Written): string | null {
  return generateUrgentNotification({ familyMemberName: NAME, concernsIdentified: [concern] });
}

function record(concerns: FlaggedConcern[]): CheckinCallRecord {
  return {
    id: 'call-test-pick',
    scheduleId: 'schedule-test',
    sponsorUserId: 'sponsor-test-1',
    sponsoredIdentityId: 'identity-test',
    familyMemberName: NAME,
    callStartedAt: new Date().toISOString(),
    status: 'completed',
    concernsIdentified: concerns,
    sponsorBriefed: false,
  };
}

/** The concerns as stored after the model wrote these. */
async function stored(...written: Written[]): Promise<FlaggedConcern[]> {
  const concerns = written.map((c) => ({ ...c, category: 'health' }));
  vi.mocked(callLLM).mockResolvedValueOnce(
    JSON.stringify({ mood: 'worried', summary: 'Rosa sounded worried.', concerns })
  );
  const analysis = await analyzeCheckinCall([], NAME, 'Marcus', 'grandmother');
  return analysis?.concerns ?? [];
}

const told = (desc: string) => `Something you might want to know: ${desc}`;

describe('two concerns: the canonical label is the one passed on', () => {
  beforeEach(() => {
    sent.messages = [];
  });

  it.each(PAIRS)('alert, as written: %s', (_name, first, second) => {
    const alert = generateUrgentNotification({
      familyMemberName: NAME,
      concernsIdentified: [first, second],
    });
    expect(alertFor(second)).not.toBeNull();
    expect(alert).toBe(alertFor(second));
    expect(alert).not.toContain(KNEE);
  });

  it.each(PAIRS)('alert, from the stored concerns: %s', async (_name, first, second) => {
    const alert = generateUrgentNotification({
      familyMemberName: NAME,
      concernsIdentified: await stored(first, second),
    });
    expect(alert).toBe(alertFor(second));
  });

  it.each(PAIRS)('alert, on the send path: %s', async (_name, first, second) => {
    const concerns = [first, second].map((c) => ({ ...c, category: 'health' }));
    vi.mocked(callLLM).mockResolvedValueOnce(
      JSON.stringify({ mood: 'worried', summary: 'Rosa sounded worried.', concerns })
    );
    await handleCheckinCallComplete('call-test-pick', 'sponsor-test-1', {
      status: 'completed',
      transcript: [
        { role: 'assistant', content: 'How are you doing today?' },
        { role: 'user', content: 'Not great.' },
      ],
      familyMemberName: NAME,
      relationship: 'grandmother',
    });
    expect(sent.messages).toEqual([alertFor(second)]);
  });

  it.each(PAIRS)('briefing: %s', async (_name, first, second) => {
    const briefing = generateBriefingSummary(record(await stored(first, second)));
    expect(briefing).toContain(told(second.description));
    expect(briefing).not.toContain(KNEE);
  });
});

describe('a record stored before labelWasCanonical existed', () => {
  const old: FlaggedConcern[] = [
    { description: FALL, urgency: 'high', category: 'health' },
    { description: CRISIS, urgency: 'urgent', category: 'emotional', labelWasCanonical: true },
  ];

  it('counts as canonical in the briefing', () => {
    const briefing = generateBriefingSummary(record(old));
    expect(briefing).toContain(told(FALL));
    expect(briefing).not.toContain(CRISIS);
  });

  it('counts as canonical in the alert', () => {
    const alert = generateUrgentNotification({ familyMemberName: NAME, concernsIdentified: old });
    expect(alert).toBe(alertFor({ description: FALL, urgency: 'high' }));
  });
});

describe('one concern: a label read as urgent/high still raises', () => {
  it.each(['High', ' HIGH ', 'CRITICAL', 'critical', ' URGENT '])(
    '%j alone reaches the briefing and the alert',
    async (urgency) => {
      const concerns = await stored({ description: FALL, urgency });
      expect(concerns[0]?.labelWasCanonical).toBe(false);
      expect(generateBriefingSummary(record(concerns))).toContain(told(FALL));
      expect(
        generateUrgentNotification({ familyMemberName: NAME, concernsIdentified: concerns })
      ).not.toBeNull();
    }
  );

  it.each(['high', 'urgent'])('%j alone is stored as canonical', async (urgency) => {
    const concerns = await stored({ description: FALL, urgency });
    expect(concerns[0]?.labelWasCanonical).toBe(true);
    expect(generateBriefingSummary(record(concerns))).toContain(told(FALL));
  });

  it.each(['medium', 'low', 'severe'])('%j alone still raises nothing', async (urgency) => {
    const concerns = await stored({ description: FALL, urgency });
    expect(generateBriefingSummary(record(concerns))).not.toContain(told(FALL));
    expect(
      generateUrgentNotification({ familyMemberName: NAME, concernsIdentified: concerns })
    ).toBeNull();
  });
});
