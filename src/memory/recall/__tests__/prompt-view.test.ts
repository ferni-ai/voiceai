/**
 * The filtered views prompt readers get (prompt-view.ts): reads through them
 * leave out what the caller asked to forget; writes go to the real objects;
 * a value with nothing forgotten in it is the real one, by reference; what
 * a view filtered is cached until the topics change; flag off, the objects
 * themselves.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => ({ topics: ['Biscuit'] as string[] | null }));
vi.mock('../forget.js', async (original) => ({
  ...(await original<typeof import('../forget.js')>()),
  forgottenTopicsOrNull: async () => stored.topics,
}));

import { resetForgetTopicsSource } from '../forget-topics-source.js';
import { forgottenCheck } from '../forget-every-reader.js';
import {
  promptProfile,
  promptServices,
  promptUserData,
  promptViews,
  USER_DATA_PASS_THROUGH,
} from '../prompt-view.js';

let seq = 0;
let user = '';
beforeEach(() => {
  resetForgetTopicsSource();
  stored.topics = ['Biscuit'];
  user = `member-prompt-view-${++seq}`;
  vi.stubEnv('FORGET_EVERY_READER', 'on');
});
afterEach(() => vi.unstubAllEnvs());

const profileAbout = () => ({
  name: 'Sam',
  totalConversations: 3,
  lastConversationSummary: 'Biscuit chewed the couch',
  preferredTopics: ['Biscuit walks', 'gardening'],
});

describe('promptServices', () => {
  it('reads the profile filtered; writes reach the real services', async () => {
    const raw = { userId: user, sessionId: 's', userProfile: profileAbout() as unknown };
    const view = await promptServices(raw);
    const seen = view.userProfile as Record<string, unknown>;
    expect(seen.lastConversationSummary).toBeUndefined();
    expect(seen.preferredTopics).toEqual(['gardening']);
    expect(view.sessionId).toBe('s');
    const next = { name: 'Sam', totalConversations: 4 };
    (view as { userProfile: unknown }).userProfile = next; // a writer through the view
    expect(raw.userProfile).toBe(next);
    expect(view.userProfile).toBe(next); // nothing forgotten in it: the real object
  });

  it('flag off: the services themselves', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    const raw = { userId: user, userProfile: profileAbout() };
    expect(await promptServices(raw)).toBe(raw);
  });
});

describe('promptUserData', () => {
  it("filters this call's memory fields, passes the allowlist, wraps userData.services", async () => {
    const check = (await forgottenCheck(user))!;
    // The profile's name is allowlisted: the services view keeps it (a plain scrub would not).
    const services = { userId: user, userProfile: { ...profileAbout(), name: 'Biscuit Jones' } };
    const raw = {
      userName: 'Biscuit Lover', // allowlisted: who the caller is
      turnCount: 4,
      keyMoments: [{ summary: 'Biscuit learned sit' }, { summary: 'went hiking' }],
      recentTopics: ['Biscuit', 'hiking'],
      lastTopic: 'Biscuit',
      services,
    };
    const view = promptUserData(raw, check);
    expect(view.keyMoments).toEqual([{ summary: 'went hiking' }]);
    expect(view.recentTopics).toEqual(['hiking']);
    expect(view.lastTopic).toBeUndefined();
    expect(view.userName).toBe('Biscuit Lover');
    expect(view.turnCount).toBe(4);
    const seen = view.services.userProfile as Record<string, unknown>;
    expect(seen.lastConversationSummary).toBeUndefined();
    expect(seen.name).toBe('Biscuit Jones');
    expect(USER_DATA_PASS_THROUGH.has('services')).toBe(false);
  });

  it('a value with nothing forgotten is the real one, so writes into it land', async () => {
    const check = (await forgottenCheck(user))!;
    const moments = [{ summary: 'went hiking' }];
    const raw = { keyMoments: moments };
    const view = promptUserData(raw, check);
    expect(view.keyMoments).toBe(moments);
    view.keyMoments.push({ summary: 'a new moment' });
    expect(raw.keyMoments).toHaveLength(2);
  });
});

describe('the cache', () => {
  it('filters once per profile and topics, again after a forget changes them', async () => {
    const profile = profileAbout();
    const first = (await forgottenCheck(user))!;
    const a = promptProfile(profile, first);
    const b = promptProfile(profile, (await forgottenCheck(user))!);
    expect(b).toBe(a); // same topics: the cached filtered profile
    stored.topics = ['Biscuit', 'gardening'];
    resetForgetTopicsSource(); // the next read sees the new topic
    const c = promptProfile(profile, (await forgottenCheck(user))!) as Record<string, unknown>;
    expect(c).not.toBe(a);
    expect(c.preferredTopics).toEqual([]);
  });
});

describe('promptViews', () => {
  it('builds both views with one check', async () => {
    const services = { userId: user, userProfile: profileAbout() };
    const { services: s, userData: u } = await promptViews(services, { lastTopic: 'Biscuit' });
    expect((s.userProfile as Record<string, unknown>).lastConversationSummary).toBeUndefined();
    expect(u.lastTopic).toBeUndefined();
  });
});
