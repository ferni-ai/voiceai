import { readFileSync } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeDb,
  type FakeDb,
} from '../../../../services/important-dates/__tests__/fake-firestore.js';

let db: FakeDb;
vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => db }));
vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config: { description: string; parameters: unknown; execute: unknown }) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

import type { ToolContext } from '../../../registry/types.js';
import {
  listSpecialDates,
  rememberSpecialDate,
  specialDateToolDefs,
  stopDateReminders,
} from '../special-dates-tool.js';
import { parseLeadTimes, spokenLeadTimes, titleFor } from '../special-dates-helpers.js';
import { importantDateIdFor } from '../../../../services/important-dates/index.js';
import { resetMigrationCacheForTests } from '../../../../services/important-dates/legacy-migration.js';
import {
  REGISTERED_TOOLS,
  isRegisteredTool,
} from '../../../../agents/shared/function-call-format.js';
import { detectsFunctionCallLeakage } from '../../../../agents/shared/sanitizer/index.js';

const U = { userId: 'user-1', personaId: 'maya' };
const TOOL_NAMES = ['rememberSpecialDate', 'listSpecialDates', 'stopDateReminders'] as const;

beforeEach(() => {
  db = createFakeDb();
  resetMigrationCacheForTests();
  db.docs.set('bogle_users/user-1/reminder_settings/default', { timeZone: 'America/New_York' });
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-06-01T15:00:00Z') });
});
afterEach(() => vi.useRealTimers());

describe('helpers', () => {
  it('reads lead times from numbers, lists and phrases', () => {
    expect(parseLeadTimes(7)).toEqual([7]);
    expect(parseLeadTimes([1, 7, 7])).toEqual([7, 1]);
    expect(parseLeadTimes('a week before')).toEqual([7]);
    expect(parseLeadTimes('a week and the day before')).toEqual([7, 1]);
    expect(parseLeadTimes('two weeks before, and on the day')).toEqual([14, 0]);
    expect(parseLeadTimes('3 days before')).toEqual([3]);
    expect(parseLeadTimes('whenever')).toBeNull();
    expect(spokenLeadTimes([7, 1, 0])).toBe('a week before, the day before and on the day');
    expect(titleFor('birthday', 'Sam')).toBe("Sam's birthday");
    expect(titleFor('birthday', 'James')).toBe("James' birthday");
    expect(titleFor('anniversary')).toBe('Your anniversary');
    expect(titleFor('deadline', undefined, 'Tax return')).toBe('Tax return');
  });
});

describe('voice requests', () => {
  it('"remember my anniversary is June 12"', async () => {
    const reply = await rememberSpecialDate({ kind: 'anniversary', date: 'June 12' }, U);
    expect(reply).toBe(
      "Got it. Your anniversary is June 12. I'll remind you a week before, the day before and on the day."
    );
    const doc = db.read(
      `bogle_users/user-1/important_dates/${importantDateIdFor('anniversary:self')}`
    )!;
    expect(doc).toMatchObject({
      date: '--06-12',
      recurring: true,
      source: 'user',
      personaId: 'maya',
    });
    expect(reply).not.toMatch(/successfully/i);
  });

  it('"remind me about Sam\'s birthday a week before" updates an existing date', async () => {
    await rememberSpecialDate({ kind: 'birthday', person: 'Sam', date: 'March 3' }, U);
    const reply = await rememberSpecialDate(
      { kind: 'birthday', person: 'Sam', remindBefore: 'a week before' },
      U
    );
    expect(reply).toBe("Done. I'll remind you about Sam's birthday a week before.");
    const doc = db.read(
      `bogle_users/user-1/important_dates/${importantDateIdFor('birthday:sam')}`
    )!;
    expect(doc.reminders).toEqual({ enabled: true, offsets: [7], custom: true });
  });

  it('asks for the date when it does not know it yet, and for a clearer date when unparseable', async () => {
    expect(await rememberSpecialDate({ kind: 'birthday', person: 'Ana', remindBefore: 7 }, U)).toBe(
      "When is Ana's birthday?"
    );
    expect(
      await rememberSpecialDate({ kind: 'birthday', person: 'Ana', date: 'soonish' }, U)
    ).toMatch(/didn't catch the date/);
  });

  it('"what\'s coming up?"', async () => {
    expect(await listSpecialDates({}, U)).toMatch(/^Nothing in the next 30 days/);
    await rememberSpecialDate({ kind: 'birthday', person: 'Sam', date: 'June 6 1990' }, U);
    await rememberSpecialDate({ kind: 'deadline', label: 'Tax return', date: 'June 2' }, U);
    expect(await listSpecialDates({}, U)).toBe(
      "Coming up: Tax return: tomorrow; Sam's birthday (turning 36): Saturday."
    );
  });

  it('"stop reminding me about the tax deadline" keeps the date; forget removes it', async () => {
    await rememberSpecialDate({ kind: 'deadline', label: 'Tax return', date: 'June 15' }, U);
    expect(await stopDateReminders({ which: 'the tax return' }, U)).toBe(
      "Okay, no more reminders for Tax return. I'll still remember it."
    );
    const id = importantDateIdFor('deadline:tax return');
    expect(db.read(`bogle_users/user-1/important_dates/${id}`)?.reminders).toMatchObject({
      enabled: false,
    });
    expect(await stopDateReminders({ which: 'tax return', forget: true }, U)).toBe(
      "Okay, I've forgotten Tax return."
    );
    expect(db.read(`bogle_users/user-1/important_dates/${id}`)).toBeUndefined();
    expect(db.read(`bogle_users/user-1/memory_tombstones/${id}`)?.reason).toBe('voice_forget');
    expect(await stopDateReminders({ which: 'nothing like it' }, U)).toBe(
      `I don't have a date called "nothing like it".`
    );
  });

  it('needs a user', async () => {
    expect(await listSpecialDates({}, { userId: 'anonymous' })).toMatch(/who you are/);
  });

  it('tool definitions execute with the tool context (persona from agentId)', async () => {
    const ctx = { userId: 'user-1', agentId: 'jordan', agentDisplayName: 'Jordan' } as ToolContext;
    const def = specialDateToolDefs.find((d) => d.id === 'rememberSpecialDate')!;
    const tool = def.create(ctx) as unknown as { execute: (a: unknown) => Promise<string> };
    await tool.execute({ kind: 'birthday', person: 'Lee', date: 'July 4' });
    expect(
      db.read(`bogle_users/user-1/important_dates/${importantDateIdFor('birthday:lee')}`)?.personaId
    ).toBe('jordan');
  });
});

describe('Gemini JSON-workaround registration (all four files agree)', () => {
  const root = new URL('../../../../../', import.meta.url);
  const base = readFileSync(
    new URL('src/personas/bundles/shared/function-calling-base.md', root),
    'utf8'
  );
  const patterns = JSON.parse(
    readFileSync(new URL('src/agents/shared/sanitizer/config/tool-patterns.json', root), 'utf8')
  ) as { domains: Record<string, { patterns: string[] }> };
  const allPatterns = Object.values(patterns.domains).flatMap((d) => d.patterns);

  it.each(TOOL_NAMES)(
    '%s is in the prompt, sanitizer patterns, REGISTERED_TOOLS and the family domain',
    async (name) => {
      expect(base).toMatch(new RegExp(`\\|\\s*${name}\\s*\\|`));
      expect(allPatterns).toContain(name);
      expect(REGISTERED_TOOLS as readonly string[]).toContain(name);
      expect(isRegisteredTool(name)).toBe(true);
      const { getToolDefinitions } = await import('../index.js');
      const defs = await getToolDefinitions();
      expect(defs.map((d) => d.id)).toContain(name);
    }
  );

  it.each(TOOL_NAMES)('the sanitizer catches %s spoken as a call instead of executed', (name) => {
    expect(detectsFunctionCallLeakage(`${name}(which: 'Sam')`).detected).toBe(true);
    expect(detectsFunctionCallLeakage(`I'll call ${name}`).detected).toBe(true);
  });
});
