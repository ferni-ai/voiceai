/**
 * What an outreach to a contact may say about the caller's past with them (FORGET_EVERY_READER):
 * none of the contact's topics, nor the pending follow-up, about a topic the caller asked Ferni
 * to forget; the rest still go. Off, the first five topics and the follow-up, as before. With no
 * topic source at all, none (fails closed). Fictional caller and contact.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ topics: ['Biscuit'] as string[] | null }));

vi.mock('../../../../../memory/recall/forget.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: async () => h.topics,
}));

const { rememberedContactContext } = await import('../remembered-contact-context.js');
const { resetForgetTopicsSource } =
  await import('../../../../../memory/recall/forget-topics-source.js');

const USER = 'member-outreach-forget';
const TOPICS = [
  'Biscuit the dog is sick',
  'the move to Denver',
  'her new job',
  'the book club',
  'the garden',
  'the marathon',
];

type Contact = Parameters<typeof rememberedContactContext>[1];

function contact(followUp?: string): Contact {
  return {
    topics: TOPICS.map((topic) => ({ topic })),
    ...(followUp && { pendingFollowUp: { reason: followUp, completed: false } }),
  };
}

beforeEach(() => {
  h.topics = ['Biscuit'];
  resetForgetTopicsSource();
});
afterEach(() => vi.unstubAllEnvs());

describe('FORGET_EVERY_READER on', () => {
  beforeEach(() => vi.stubEnv('FORGET_EVERY_READER', 'on'));

  it('leaves out the topic about a forgotten one; the next topic takes its place', async () => {
    const ctx = await rememberedContactContext(USER, contact());
    expect(ctx.recentTopics).toEqual(TOPICS.slice(1, 6));
  });

  it('leaves out a pending follow-up about a forgotten topic, keeps one about anything else', async () => {
    const forgot = await rememberedContactContext(USER, contact('ask how Biscuit is doing'));
    expect(forgot.pendingFollowUp).toBeUndefined();
    const kept = await rememberedContactContext(USER, contact('ask about the Denver move'));
    expect(kept.pendingFollowUp).toBe('ask about the Denver move');
  });

  it('with no topic source at all, passes on no topic or follow-up (fails closed)', async () => {
    h.topics = null;
    const ctx = await rememberedContactContext(USER, contact('ask about the Denver move'));
    expect(ctx).toEqual({ recentTopics: [], pendingFollowUp: undefined });
  });
});

describe('FORGET_EVERY_READER off', () => {
  beforeEach(() => vi.stubEnv('FORGET_EVERY_READER', 'off'));

  it('passes on the first five topics and the follow-up, as before', async () => {
    const ctx = await rememberedContactContext(USER, contact('ask how Biscuit is doing'));
    expect(ctx).toEqual({
      recentTopics: TOPICS.slice(0, 5),
      pendingFollowUp: 'ask how Biscuit is doing',
    });
  });
});
