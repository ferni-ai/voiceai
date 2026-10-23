/**
 * Someone the user has lost is remembered, never celebrated. A memorial date
 * renders in a gentle "Remembering" section with no 🎉 and no offer to call
 * that person, and they never show up as "overdue" for a family call. A living
 * relative on the same day is the control: their birthday still gets the
 * celebration and the call offer.
 *
 * The REAL builders run; only Firestore and the trigger profile are mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromptInput as ContextBuilderInput } from '../../core/types.js';

interface Doc {
  data: () => Record<string, unknown>;
}

const store = vi.hoisted(() => ({
  specialDates: [] as Array<Record<string, unknown>>,
  family: [] as Array<Record<string, unknown>>,
  deceased: [] as Array<{ name: string; aliases: string[] }>,
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

beforeEach(() => {
  store.specialDates = [];
  store.family = [];
  store.deceased = [];
});

describe('special dates for someone the user has lost', () => {
  it('renders a memorial date today as remembering, with no 🎉 and no offer to call them', async () => {
    store.specialDates = [
      {
        contactName: 'Grandpa Joe',
        relationship: 'grandfather',
        dateType: 'memorial',
        date: today,
        phone: '+15550000001',
      },
      {
        contactName: 'Aunt Rose',
        relationship: 'aunt',
        dateType: 'birthday',
        date: today,
        phone: '+15550000002',
      },
    ];

    const content = await contentOf(specialDatesAwarenessBuilder, 'u-memorial-today');

    expect(content).toContain('### Remembering');
    expect(content).toContain("Today is the anniversary of Grandpa Joe (grandfather)'s passing.");
    expect(content).toContain('Never offer to call, text or send them anything.');
    expect(content).not.toContain('Want me to call Grandpa Joe');
    const remembering = content.slice(content.indexOf('### Remembering'), content.indexOf('🎉'));
    expect(remembering).not.toMatch(/[—–]|\.\.\./);
    // The living relative still gets the celebration and the call offer
    expect(content).toContain('🎉 TODAY IS SPECIAL!');
    expect(content).toContain('Want me to call Aunt Rose?');
    const celebration = content.slice(content.indexOf('🎉'));
    expect(celebration).not.toContain('Grandpa Joe');
  });

  it('renders only remembering, with no celebration header, when the only date is a memorial', async () => {
    store.specialDates = [
      { contactName: 'Grandpa Joe', dateType: 'memorial', date: today, phone: '+15550000001' },
    ];

    const content = await contentOf(specialDatesAwarenessBuilder, 'u-memorial-only');

    expect(content).toContain('### Remembering');
    expect(content).not.toContain('🎉');
    expect(content).not.toContain('🎂');
    expect(content).not.toMatch(/call them/i);
  });

  it('treats the birthday of someone the profile knows has passed as a day to remember', async () => {
    store.deceased = [{ name: 'Dad', aliases: ['Robert'] }];
    store.specialDates = [
      {
        contactName: 'Robert',
        relationship: 'father',
        dateType: 'birthday',
        date: today,
        year: 1950,
        phone: '+15550000003',
      },
    ];

    const content = await contentOf(specialDatesAwarenessBuilder, 'u-deceased-birthday');

    expect(content).toContain("Today would have been Robert (father)'s birthday.");
    expect(content).not.toContain('turning');
    expect(content).not.toContain('Want me to call Robert');
  });

  it('never nudges a family call to someone with a memorial date, while a living relative is still nudged', async () => {
    store.specialDates = [{ contactName: 'Grandpa Joe', dateType: 'memorial', date: '01-15' }];
    store.family = [
      { name: 'Grandpa Joe', specificRelation: 'grandfather' },
      { name: 'Aunt Rose', specificRelation: 'aunt' },
    ];

    const content = await contentOf(familyConnectionNudgeBuilder, 'u-family-nudge');

    expect(content).toContain('Aunt Rose');
    expect(content).not.toContain('Grandpa Joe');
  });
});
