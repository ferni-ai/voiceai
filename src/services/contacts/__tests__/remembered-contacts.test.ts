/**
 * Someone the user has lost (a contact with a memorial date) is remembered,
 * never nudged: no check-in, no birthday "send them something", no message to
 * their old number. A living contact with the same history is the control:
 * they still get every nudge, so each assertion fails if the guard is removed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      }),
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ docs: [] }),
    }),
  })),
}));

vi.mock('../../llm-utils.js', () => ({
  callLLM: vi.fn().mockResolvedValue('Thinking of you today.'),
}));

const sendSMS = vi.fn().mockResolvedValue(undefined);
const sendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock('../../communication-service.js', () => ({
  sendSMS: (...args: unknown[]) => sendSMS(...args),
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

vi.mock('../../superhuman/relationship-network.js', () => ({
  loadNetwork: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../superhuman/seasonal-awareness.js', () => ({
  loadPersonalDates: vi.fn().mockResolvedValue([]),
}));

const DAY = 24 * 60 * 60 * 1000;

/** MM-DD for a day N days from now */
function monthDayIn(days: number): string {
  const d = new Date(Date.now() + days * DAY);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Grandpa has passed; Aunt Rose is alive. Same history, same birthday. */
async function seed(userId: string): Promise<void> {
  const { upsertContact, clearCache } = await import('../contact-relationship-service.js');
  clearCache();
  const history = {
    relationship: 'family' as const,
    lastInteraction: new Date(Date.now() - 60 * DAY),
    firstInteraction: new Date(Date.now() - 400 * DAY),
    interactionCount: 50,
    strengthScore: 80,
  };
  await upsertContact(userId, {
    name: 'Grandpa Joe',
    contactId: 'grandpa',
    phone: '+15550000001',
    ...history,
    importantDates: [
      { date: monthDayIn(2), type: 'memorial', label: 'passing' },
      { date: monthDayIn(3), type: 'birthday' },
    ],
  });
  await upsertContact(userId, {
    name: 'Aunt Rose',
    contactId: 'rose',
    phone: '+15550000002',
    ...history,
    importantDates: [{ date: monthDayIn(3), type: 'birthday' }],
  });
}

describe('remembered contacts', () => {
  beforeEach(() => {
    sendSMS.mockClear();
    sendEmail.mockClear();
  });

  it('gives someone who has died no check-in or birthday nudge, while a living contact gets both', async () => {
    await seed('u-nudges');
    const { generateNudges } = await import('../outreach-nudges.js');

    const nudges = await generateNudges('u-nudges');
    const typesFor = (name: string) =>
      nudges.filter((n) => n.contactName === name).map((n) => n.type);

    expect(typesFor('Aunt Rose')).toEqual(
      expect.arrayContaining(['needs_attention', 'upcoming_birthday'])
    );
    expect(typesFor('Grandpa Joe')).toEqual(['upcoming_memorial']);
  });

  it('suggests remembering together on a memorial date, never reaching out', async () => {
    await seed('u-memorial-text');
    const { generateNudges, formatNudgeAsSuggestion } = await import('../outreach-nudges.js');

    const memorial = (await generateNudges('u-memorial-text')).find(
      (n) => n.type === 'upcoming_memorial'
    );
    expect(memorial).toBeDefined();
    const text = formatNudgeAsSuggestion(memorial!);

    expect(text).not.toMatch(/reach out/i);
    expect(text).toContain('talk about them');
    expect(text).not.toMatch(/[—–]|\.\.\./);
  });

  it('keeps someone who has died out of needs-attention, overdue and weakening lists', async () => {
    await seed('u-lists');
    const { buildNudgeContext, getOverdueFrequentContacts } = await import('../outreach-nudges.js');
    const { getRelationshipInsights } = await import('../contact-relationship-service.js');

    const context = await buildNudgeContext('u-lists');
    expect(context.needsAttention.map((c) => c.contactName)).toEqual(['Aunt Rose']);
    expect(context.summary).toContain("haven't talked to Aunt Rose");
    expect(context.summary).not.toMatch(/haven't talked to[^.]*Grandpa Joe/);

    const overdue = await getOverdueFrequentContacts('u-lists');
    expect(overdue.map((c) => c.contactName)).toEqual(['Aunt Rose']);

    const insights = await getRelationshipInsights('u-lists');
    expect(insights.some((i) => i.contactName === 'Aunt Rose')).toBe(true);
    expect(insights.some((i) => i.contactName === 'Grandpa Joe')).toBe(false);
  });

  it('marks the memorial date as remembered and drops the birthday of someone who has died', async () => {
    await seed('u-dates');
    const { buildNudgeContext } = await import('../outreach-nudges.js');

    const { upcomingDates } = await buildNudgeContext('u-dates');
    const grandpa = upcomingDates.filter((d) => d.contactName === 'Grandpa Joe');
    const rose = upcomingDates.filter((d) => d.contactName === 'Aunt Rose');

    expect(grandpa).toEqual([expect.objectContaining({ dateType: 'passing', remembered: true })]);
    expect(rose).toEqual([expect.objectContaining({ dateType: 'birthday', remembered: false })]);
  });

  it('never drafts a message to the number of someone who has died', async () => {
    await seed('u-preview');
    const { previewBatchMessages, buildOutreachContext } =
      await import('../personalized-outreach.js');

    expect(await buildOutreachContext('u-preview', 'grandpa', 'memorial')).toBeNull();
    expect(await buildOutreachContext('u-preview', 'rose', 'birthday')).not.toBeNull();

    const preview = await previewBatchMessages({
      userId: 'u-preview',
      recipients: ['grandpa', 'rose'],
      occasion: 'thinking_of_you',
      tone: 'warm',
      requireApproval: false,
    });
    expect(preview.messages.map((m) => m.contactName)).toEqual(['Aunt Rose']);
    expect(preview.skipped.map((s) => s.contactId)).toEqual(['grandpa']);
  });

  it('skips an approved send to someone who has died and still sends to a living contact', async () => {
    await seed('u-send');
    const { sendBatchMessages } = await import('../personalized-outreach.js');
    const { REMEMBERED_SKIP_REASON } = await import('../remembered-contacts.js');
    const message = (contactId: string, contactName: string, channelValue: string) => ({
      contactId,
      contactName,
      message: 'Thinking of you today.',
      channel: 'sms' as const,
      channelValue,
      occasion: 'memorial' as const,
      personalizationNotes: [],
      approved: true,
      sent: false,
    });

    const result = await sendBatchMessages('u-send', [
      message('grandpa', 'Grandpa Joe', '+15550000001'),
      message('rose', 'Aunt Rose', '+15550000002'),
    ]);

    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(sendSMS).toHaveBeenCalledWith('+15550000002', 'Thinking of you today.', {
      userId: 'u-send',
    });
    expect(result.skipped).toEqual([
      expect.objectContaining({ contactId: 'grandpa', reason: REMEMBERED_SKIP_REASON }),
    ]);
  });
});
