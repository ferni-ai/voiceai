/**
 * The agent is told on every turn who the user has marked in memory
 * (CONTACT_IN_MEMORY), not only when a date is near: Dad has passed, Ferni talks
 * about him in the past tense and never offers to reach him. With no dates,
 * nudges or holidays at all, the builder still speaks for Dad when the flag is
 * on, and says nothing when it is off. The REAL builder and in-memory module
 * run; only the nudge data and the people list are mocked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PromptInput as ContextBuilderInput } from '../../core/types.js';

vi.mock('../../../../services/contacts/outreach-nudges.js', () => ({
  buildNudgeContext: async () => ({
    nudges: [],
    summary: '',
    upcomingDates: [],
    needsAttention: [],
    upcomingHolidays: [],
  }),
  getOverdueFrequentContacts: async () => [],
}));

vi.mock('../../../../services/contacts/people-list.js', () => ({
  listPeople: async () => [
    { name: 'Dad', inMemory: { passedOn: '2026-03-14', markedAt: '2026-04-01T00:00:00Z' } },
    { name: 'Aunt Rose' },
  ],
}));

const { outreachAwarenessBuilder } = await import('../outreach-awareness.js');
const input = { services: { userId: 'u-1' } } as unknown as ContextBuilderInput;

afterEach(() => vi.unstubAllEnvs());

describe('outreach awareness for someone marked in memory', () => {
  it('tells the agent Dad has passed, with no offer to reach him', async () => {
    vi.stubEnv('CONTACT_IN_MEMORY', 'on');
    const content = (await outreachAwarenessBuilder.build(input)).map((i) => i.content).join('\n');

    expect(content).toContain('IN MEMORY');
    expect(content).toContain('- Dad has passed away (in March 2026).');
    expect(content).toContain('Never offer to call, text, email or message them');
    expect(content).not.toContain('Aunt Rose');
  });

  it('says nothing about Dad with the flag off', async () => {
    vi.stubEnv('CONTACT_IN_MEMORY', 'off');
    expect(await outreachAwarenessBuilder.build(input)).toEqual([]);
  });
});
