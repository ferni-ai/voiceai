/**
 * Someone the user marked in memory (CONTACT_IN_MEMORY) is remembered by the
 * family builders even with no memorial date and nothing in the trigger profile:
 * "Today would have been Dad's birthday", with no call offer, and never "overdue"
 * for a family call. With the flag off, Dad is treated exactly as before.
 *
 * The REAL builders and in-memory lookup run; only Firestore, the trigger
 * profile and the people list are mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromptInput as ContextBuilderInput } from '../../core/types.js';

interface Doc {
  data: () => Record<string, unknown>;
}

const store = vi.hoisted(() => ({
  specialDates: [] as Array<Record<string, unknown>>,
  family: [] as Array<Record<string, unknown>>,
  deceased: [] as Array<{ name: string; aliases: string[] }>,
  people: [] as Array<Record<string, unknown>>,
}));

const docs = (rows: Array<Record<string, unknown>>): Doc[] => rows.map((r) => ({ data: () => r }));

vi.mock('../../../../services/superhuman/firestore-utils.js', () => {
  const query = (rows: () => Array<Record<string, unknown>>) => {
    const q = {
      where: () => q,
      orderBy: () => q,
      limit: () => q,
      get: async () => ({ empty: rows().length === 0, docs: docs(rows()) }),
    };
    return q;
  };
  const sub: Record<string, () => Array<Record<string, unknown>>> = {
    special_dates: () => store.specialDates,
    unified_entities: () => store.family,
    on_behalf_calls: () => [],
  };
  const db = {
    collection: () => ({
      doc: () => ({ collection: (name: string) => query(sub[name] ?? (() => [])) }),
    }),
  };
  return { getFirestoreDb: () => db };
});

vi.mock('../../../triggers/user-trigger-profile-service.js', () => ({
  getUserTriggerProfileService: () => ({
    loadProfile: async () => ({
      relationships: [
        ...store.deceased.map((d) => ({ ...d, isDeceased: true })),
        { name: 'Aunt Rose', aliases: [], isDeceased: false },
      ],
    }),
  }),
}));

// The people list (both contact stores): who the user marked in memory
vi.mock('../../../../services/contacts/people-list.js', () => ({
  listPeople: async () => store.people,
}));

const { specialDatesAwarenessBuilder } = await import('../special-dates-awareness.js');
const { familyConnectionNudgeBuilder } = await import('../family-connection-nudge.js');

const today = (() => {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

// A user per case: both builders cache per user in memory.
const inputFor = (userId: string) =>
  ({ services: { userId }, userData: { turnCount: 2 } }) as unknown as ContextBuilderInput;

async function contentOf(
  builder: { build: (i: ContextBuilderInput) => Promise<Array<{ content: string }>> },
  userId: string
): Promise<string> {
  return (await builder.build(inputFor(userId))).map((i) => i.content).join('\n');
}

const dad = { name: 'Dad', inMemory: { passedOn: '2026-03-14', markedAt: '2026-04-01T00:00:00Z' } };

beforeEach(() => {
  store.specialDates = [
    { contactName: 'Dad', relationship: 'father', dateType: 'birthday', date: today, year: 1950 },
  ];
  store.family = [
    { name: 'Dad', specificRelation: 'father' },
    { name: 'Aunt Rose', specificRelation: 'aunt' },
  ];
  store.people = [dad, { name: 'Aunt Rose' }];
});

afterEach(() => vi.unstubAllEnvs());

describe('family builders for someone marked in memory', () => {
  it("reads Dad's birthday as a day to remember, with no call offer", async () => {
    vi.stubEnv('CONTACT_IN_MEMORY', 'on');
    const content = await contentOf(specialDatesAwarenessBuilder, 'im-birthday-on');

    expect(content).toContain("Today would have been Dad (father)'s birthday.");
    expect(content).not.toContain('turning');
    expect(content).not.toContain('Want me to call Dad');
  });

  it('never nudges a family call to Dad, while Aunt Rose is still nudged', async () => {
    vi.stubEnv('CONTACT_IN_MEMORY', 'on');
    store.specialDates = [];
    const content = await contentOf(familyConnectionNudgeBuilder, 'im-family-on');

    expect(content).toContain('Aunt Rose');
    expect(content).not.toContain('Dad');
  });

  it('celebrates the birthday as before with the flag off', async () => {
    vi.stubEnv('CONTACT_IN_MEMORY', 'off');
    const content = await contentOf(specialDatesAwarenessBuilder, 'im-birthday-off');

    expect(content).toContain('🎉 TODAY IS SPECIAL!');
    expect(content).not.toContain('Today would have been Dad');
  });
});
