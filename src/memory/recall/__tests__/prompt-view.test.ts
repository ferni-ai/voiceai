/**
 * The filtered views prompt readers get (prompt-view.ts): reads through them
 * leave out what the caller asked to forget; writes go to the real objects;
 * a value with nothing forgotten in it is the real one, by reference; what
 * a view filtered is cached for one check (one turn); class instances pass
 * through with their methods; flag off, the objects themselves.
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
  promptText,
  promptViews,
  USER_DATA_PASS_THROUGH,
} from '../prompt-view.js';
import { ConversationStateManager } from '../../../services/social/conversation-state.js';
import { createSessionId, createUserId } from '../../../types/branded.js';

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
  it('filters once per check (one per turn); the next check filters again', async () => {
    const profile = profileAbout();
    const check = (await forgottenCheck(user))!;
    const a = promptProfile(profile, check);
    expect(promptProfile(profile, check)).toBe(a); // same turn: filtered once
    stored.topics = ['Biscuit', 'gardening'];
    resetForgetTopicsSource(); // the next read sees the new topic
    const c = promptProfile(profile, (await forgottenCheck(user))!) as Record<string, unknown>;
    expect(c).not.toBe(a);
    expect(c.preferredTopics).toEqual([]);
  });

  it('an in-place push after the first view is filtered on the next turn', async () => {
    const moments = ['went hiking'];
    const raw = { keyMoments: moments };
    expect(promptUserData(raw, (await forgottenCheck(user))!).keyMoments).toBe(moments);
    moments.push('Biscuit learned sit'); // tools.ts writes key moments in place
    expect(promptUserData(raw, (await forgottenCheck(user))!).keyMoments).toEqual(['went hiking']);
  });

  it('the same for a profile list pushed in place', async () => {
    const profile = { name: 'Sam', preferredTopics: ['gardening'] };
    const services = { userId: user, userProfile: profile };
    expect((await promptServices(services)).userProfile).toBe(profile);
    profile.preferredTopics.push('Biscuit walks');
    const seen = (await promptServices(services)).userProfile as typeof profile;
    expect(seen.preferredTopics).toEqual(['gardening']);
  });
});

describe('class instances', () => {
  const state = () =>
    new ConversationStateManager(createSessionId('s'), createUserId(user), 'ferni');

  it('pass through with their methods, topic present at the first view', async () => {
    const manager = state();
    manager.addKeyMoment('Biscuit learned sit');
    const view = promptUserData({ conversationState: manager }, (await forgottenCheck(user))!);
    expect(view.conversationState).toBe(manager);
    expect(view.conversationState.getSummaryForLLM()).toContain('Turn: ');
  });

  it('pass through when clean at the first view, and stay live after', async () => {
    const manager = state();
    const raw = { conversationState: manager };
    expect(promptUserData(raw, (await forgottenCheck(user))!).conversationState).toBe(manager);
    manager.addKeyMoment('Biscuit learned sit');
    const check = (await forgottenCheck(user))!;
    const summary = promptUserData(raw, check).conversationState.getSummaryForLLM();
    expect(promptText(summary, check)).not.toMatch(/biscuit/i); // its readers filter its text
  });

  it('dates and maps pass as they are', async () => {
    const when = new Date(0);
    const seen = new Map([['Biscuit', 1]]);
    const view = promptUserData({ when, seen }, (await forgottenCheck(user))!);
    expect(view.when).toBe(when);
    expect(view.seen).toBe(seen);
  });
});

describe('promptText', () => {
  it('leaves out the lines about a forgotten topic', async () => {
    const check = (await forgottenCheck(user))!;
    expect(promptText('User: Sam\nKey moments: Biscuit learned sit\nTurn: 3', check)).toBe(
      'User: Sam\nTurn: 3'
    );
    expect(promptText('Biscuit', check)).toBe('');
    expect(promptText('Turn: 3', null)).toBe('Turn: 3');
  });
});

describe('promptViews', () => {
  it('builds both views with one check', async () => {
    const services = { userId: user, userProfile: profileAbout() };
    const { services: s, userData: u } = await promptViews(services, { lastTopic: 'Biscuit' });
    expect((s.userProfile as Record<string, unknown>).lastConversationSummary).toBeUndefined();
    expect(u.lastTopic).toBeUndefined();
  });

  it("returns the turn's check for text its readers filter", async () => {
    const { check } = await promptViews({ userId: user }, {});
    expect(check?.('Biscuit')).toBe(true);
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    expect((await promptViews({ userId: user }, {})).check).toBeNull();
  });
});

describe('structural fields and frozen objects (#2662)', () => {
  it('a forgotten place never hides the time zone, locale or ids', async () => {
    stored.topics = ['New York'];
    const check = await forgottenCheck(user, 'test');
    const userData = {
      callerTimezone: 'America/New_York',
      locale: 'en-US-new-york',
      contactId: 'new-york-office',
      places: [{ label: 'office', timezone: 'America/New_York' }, { label: 'New York trip' }],
      profile: { id: 'new-york-1', time_zone: 'America/New_York', lastTrip: 'New York in May' },
      note: 'moving to New York',
    };
    const seen = promptUserData(userData, check) as Record<string, unknown>;
    expect(seen.callerTimezone).toBe('America/New_York');
    expect(seen.locale).toBe('en-US-new-york');
    expect(seen.contactId).toBe('new-york-office');
    // A list item is read whole, but not its time zone: the office stays, the trip goes.
    expect(seen.places).toEqual([{ label: 'office', timezone: 'America/New_York' }]);
    expect(seen.note).toBeUndefined();
    const profile = seen.profile as Record<string, unknown>;
    expect(profile.time_zone).toBe('America/New_York');
    expect(profile.id).toBe('new-york-1'); // nested: not in the top-level pass-through
    expect(profile.lastTrip).toBeUndefined();
  });

  it('a frozen userData reads filtered and is never written', async () => {
    const userData = Object.freeze({
      name: 'Sam',
      note: 'Biscuit chewed the couch',
      mood: 'tired',
    });
    const check = await forgottenCheck(user, 'test');
    const seen = promptUserData(userData, check) as Record<string, unknown>;
    expect(() => seen.note).not.toThrow();
    expect(seen.note).toBeUndefined();
    expect(seen.name).toBe('Sam');
    expect(userData.note).toBe('Biscuit chewed the couch');
    expect(Object.isFrozen(userData)).toBe(true);
  });

  it('a frozen object: no getter, non-enumerable or prototype field brings a forgotten topic', async () => {
    class Profile {
      readonly name = 'Sam';
      get story(): string {
        return 'Biscuit chewed the couch';
      }
    }
    const fromClass = Object.freeze(new Profile());
    const hidden = { name: 'Sam' };
    Object.defineProperty(hidden, 'secret', { value: 'Biscuit at the vet', enumerable: false });
    Object.defineProperty(hidden, 'hobby', { value: 'gardening', enumerable: false });
    Object.freeze(hidden);
    const inherited = Object.freeze(
      Object.assign(Object.create({ note: 'Biscuit ran off', kept: 'cello practice' }), {
        name: 'Sam',
      })
    );
    const check = await forgottenCheck(user, 'test');
    const views = [fromClass, hidden, inherited].map(
      (o) => promptUserData(o, check) as Record<string, unknown>
    );
    expect(views[0].story).toBeUndefined();
    expect(views[1].secret).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(views[1], 'secret')?.value).toBeUndefined();
    expect(views[2].note).toBeUndefined();
    expect(views.map((v) => v.name)).toEqual(['Sam', 'Sam', 'Sam']);
    expect(views[1].hobby).toBe('gardening'); // filtered, not dropped
    expect(Object.keys(views[1])).toEqual(['name']); // keys enumerate as the real object's
    expect(views[2].kept).toBe('cello practice');
    expect(views[0]).toBeInstanceOf(Profile);
    expect(JSON.stringify(views)).not.toContain('Biscuit');
  });

  it('frozen services read filtered too', async () => {
    const raw = Object.freeze({
      userId: user,
      userProfile: Object.freeze(profileAbout()) as unknown,
    });
    const view = await promptServices(raw);
    expect(() => view.userProfile).not.toThrow();
    expect((view.userProfile as Record<string, unknown>).lastConversationSummary).toBeUndefined();
  });
});
