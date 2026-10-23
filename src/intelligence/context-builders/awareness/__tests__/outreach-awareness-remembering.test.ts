/**
 * A memorial date in the outreach context is remembering, never an outreach
 * occasion: it renders under REMEMBERING with no "send them something", and
 * the conversation-starter nudge skips it. A living contact's birthday on the
 * same day is the control and still renders as an outreach opportunity.
 * The REAL builder runs; only the nudge data is mocked.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PromptInput as ContextBuilderInput } from '../../core/types.js';

vi.mock('../../../../services/contacts/outreach-nudges.js', () => ({
  buildNudgeContext: async () => ({
    nudges: [],
    summary: '',
    upcomingDates: [
      { contactName: 'Grandpa Joe', dateType: 'memorial', date: '', daysAway: 0, remembered: true },
      { contactName: 'Aunt Rose', dateType: 'birthday', date: '', daysAway: 0, remembered: false },
    ],
    needsAttention: [],
    upcomingHolidays: [],
  }),
  getOverdueFrequentContacts: async () => [],
}));

const { outreachAwarenessBuilder, getConversationStarterNudge } =
  await import('../outreach-awareness.js');

describe('outreach awareness for someone the user has lost', () => {
  it('lists a memorial date under remembering, never as an outreach date', async () => {
    const input = { services: { userId: 'u-1' } } as unknown as ContextBuilderInput;
    const content = (await outreachAwarenessBuilder.build(input)).map((i) => i.content).join('\n');

    const remembering = content.slice(
      content.indexOf('REMEMBERING:'),
      content.indexOf('IMPORTANT')
    );
    expect(remembering).toContain("Grandpa Joe's memorial is today. They have passed.");
    expect(remembering).toContain('Never offer to call, text or send them anything.');

    const outreach = content.slice(content.indexOf('IMPORTANT DATES COMING UP'));
    expect(outreach).toContain("Aunt Rose's birthday is TODAY");
    expect(outreach).not.toContain('Grandpa Joe');
  });

  it('opens a conversation with the living birthday, not the memorial', async () => {
    const nudge = await getConversationStarterNudge('u-2');
    expect(nudge).toContain('Aunt Rose');
    expect(nudge).not.toContain('Grandpa Joe');
  });
});
