/**
 * Someone the user marked "in memory" (CONTACT_IN_MEMORY) is remembered, never
 * nudged or messaged, even with no memorial date: #1339's guard is keyed on the
 * real field. Dad is marked in memory with the day he passed; Aunt Rose is alive
 * with the same history and birthday, so each assertion fails if the guard is
 * removed. With the flag off, Dad is treated exactly as before.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

vi.mock('../../superhuman/relationship-network.js', () => ({
  loadNetwork: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../superhuman/seasonal-awareness.js', () => ({
  loadPersonalDates: vi.fn().mockResolvedValue([]),
}));

const DAY = 24 * 60 * 60 * 1000;

function dayIn(days: number): Date {
  return new Date(Date.now() + days * DAY);
}
const pad = (n: number): string => String(n).padStart(2, '0');
const monthDay = (d: Date): string => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Dad passed (the anniversary is in 2 days), birthday in 3; Aunt Rose is alive, same birthday */
async function seed(userId: string): Promise<void> {
  const { upsertContact, clearCache } = await import('../contact-relationship-service.js');
  clearCache();
  const passed = dayIn(2);
  const history = {
    relationship: 'family' as const,
    lastInteraction: new Date(Date.now() - 60 * DAY),
    firstInteraction: new Date(Date.now() - 400 * DAY),
    interactionCount: 50,
    strengthScore: 80,
    importantDates: [{ date: monthDay(dayIn(3)), type: 'birthday' as const }],
  };
  const dad = { name: 'Dad', contactId: 'dad', phone: '+15550000001', ...history };
  await upsertContact(userId, dad);
  // Marked later, as the edit route does: a new contact never carries the field
  await upsertContact(userId, {
    ...dad,
    inMemory: {
      passedOn: `${passed.getFullYear() - 1}-${monthDay(passed)}`,
      markedAt: new Date().toISOString(),
    },
  });
  await upsertContact(userId, {
    name: 'Aunt Rose',
    contactId: 'rose',
    phone: '+15550000002',
    ...history,
  });
}

async function nudgeTypes(userId: string): Promise<Record<string, string[]>> {
  const { generateNudges } = await import('../outreach-nudges.js');
  const nudges = await generateNudges(userId);
  const byName: Record<string, string[]> = {};
  for (const n of nudges) (byName[n.contactName] ??= []).push(n.type);
  return byName;
}

describe('in memory, flag on', () => {
  beforeEach(() => vi.stubEnv('CONTACT_IN_MEMORY', 'on'));
  afterEach(() => vi.unstubAllEnvs());

  it('gives Dad only the anniversary of his passing, while Aunt Rose gets a check-in and a birthday', async () => {
    await seed('im-nudges');
    const types = await nudgeTypes('im-nudges');
    expect(types['Aunt Rose']).toEqual(
      expect.arrayContaining(['needs_attention', 'upcoming_birthday'])
    );
    expect(types['Dad']).toEqual(['upcoming_memorial']);
  });

  it("reads Dad's birthday and passing as days to remember in the agent's dates", async () => {
    await seed('im-dates');
    const { buildNudgeContext } = await import('../outreach-nudges.js');
    const { upcomingDates, needsAttention } = await buildNudgeContext('im-dates');

    expect(upcomingDates.filter((d) => d.contactName === 'Dad')).toEqual([
      expect.objectContaining({
        dateType: 'anniversary of passing',
        daysAway: 2,
        remembered: true,
      }),
      expect.objectContaining({ dateType: 'birthday', daysAway: 3, remembered: true }),
    ]);
    expect(upcomingDates.filter((d) => d.contactName === 'Aunt Rose')).toEqual([
      expect.objectContaining({ dateType: 'birthday', remembered: false }),
    ]);
    expect(needsAttention.map((c) => c.contactName)).toEqual(['Aunt Rose']);
  });

  it('never drafts a message to Dad', async () => {
    await seed('im-outreach');
    const { buildOutreachContext } = await import('../personalized-outreach.js');
    expect(await buildOutreachContext('im-outreach', 'dad', 'birthday')).toBeNull();
    expect(await buildOutreachContext('im-outreach', 'rose', 'birthday')).not.toBeNull();
  });

  it('tells the agent Dad has passed, in the past tense, with no offer to reach him', async () => {
    const { inMemoryContext } = await import('../in-memory.js');
    const text = inMemoryContext([
      { name: 'Dad', inMemory: { passedOn: '2026-03-14', markedAt: '2026-04-01T00:00:00Z' } },
      { name: 'Aunt Rose' },
    ]);
    expect(text).toContain('- Dad has passed away (in March 2026).');
    expect(text).toContain('Never offer to call, text, email or message them');
    expect(text).toContain('Never speak as them.');
    expect(text).not.toContain('Aunt Rose');
    expect(text).not.toMatch(/[—–]|\.\.\./);
  });
});

describe('in memory, flag off', () => {
  beforeEach(() => vi.stubEnv('CONTACT_IN_MEMORY', 'off'));
  afterEach(() => vi.unstubAllEnvs());

  it('treats Dad exactly like Aunt Rose, as before the field existed', async () => {
    await seed('im-off');
    const types = await nudgeTypes('im-off');
    expect(types['Dad']).toEqual(expect.arrayContaining(['needs_attention', 'upcoming_birthday']));
    const { isRememberedContact } = await import('../remembered-contacts.js');
    expect(isRememberedContact({ inMemory: { markedAt: '2026-01-01T00:00:00Z' } })).toBe(false);
    const { inMemoryContext } = await import('../in-memory.js');
    expect(inMemoryContext([{ name: 'Dad', inMemory: { markedAt: 'x' } }])).toBe('');
  });
});

describe('parseInMemoryEdit', () => {
  const now = new Date(2026, 9, 16, 15, 0, 0);

  it('sets the field with the server time, keeping a real past day', async () => {
    const { parseInMemoryEdit } = await import('../in-memory.js');
    expect(parseInMemoryEdit({ passedOn: '2026-03-14', markedAt: '1999-01-01' }, now)).toEqual({
      set: { passedOn: '2026-03-14', markedAt: now.toISOString() },
    });
    expect(parseInMemoryEdit(true, now)).toEqual({ set: { markedAt: now.toISOString() } });
    expect(parseInMemoryEdit({ passedOn: '2026-10-16' }, now)).toEqual({
      set: { passedOn: '2026-10-16', markedAt: now.toISOString() },
    });
  });

  it('clears it on null or false', async () => {
    const { parseInMemoryEdit } = await import('../in-memory.js');
    expect(parseInMemoryEdit(null, now)).toEqual({ clear: true });
    expect(parseInMemoryEdit(false, now)).toEqual({ clear: true });
  });

  it('refuses a day in the future, a day that does not exist, or a non-date', async () => {
    const { parseInMemoryEdit } = await import('../in-memory.js');
    for (const value of [
      { passedOn: '2026-10-17' },
      { passedOn: '2026-02-30' },
      { passedOn: 'March 2026' },
      { passedOn: 20260314 },
      'yes',
      [],
    ]) {
      expect(parseInMemoryEdit(value, now)).toEqual({ invalid: true });
    }
  });
});
