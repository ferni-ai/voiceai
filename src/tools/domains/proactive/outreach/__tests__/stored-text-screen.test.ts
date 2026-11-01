/**
 * storedTextForOwner (owner-message-policy.ts): with OWNER_OUTREACH_STORED_TEXT_SCREEN
 * on, stored text that the content filter refuses is kept out of a message to the
 * owner; off, everything passes. It is the UI server's own flag:
 * UNVERIFIED_OWNER_MESSAGE_FILTER (live calls) is never consulted. All data is fictional.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { storedTextForOwner, storedTextScreenOn } from '../owner-message-policy.js';

const WHERE = { site: 'proactive', userId: 'owner-uid' } as const;
const PHISH = 'your bank needs you to call 212 555 0198 today';
const ORDINARY = 'water the plants';

afterEach(() => vi.unstubAllEnvs());

describe('storedTextForOwner', () => {
  it('with the screen on, refuses stored text the filter refuses, and passes ordinary text', () => {
    vi.stubEnv('OWNER_OUTREACH_STORED_TEXT_SCREEN', 'on');
    expect(storedTextForOwner([PHISH], WHERE)).toBe(false);
    expect(storedTextForOwner([ORDINARY, PHISH], WHERE)).toBe(false);
    expect(storedTextForOwner([ORDINARY, undefined], WHERE)).toBe(true);
  });

  it('with the screen off, passes everything', () => {
    expect(storedTextScreenOn()).toBe(false);
    expect(storedTextForOwner([PHISH], WHERE)).toBe(true);
  });

  it('never reads the live-call flag: UNVERIFIED_OWNER_MESSAGE_FILTER alone screens nothing', () => {
    vi.stubEnv('UNVERIFIED_OWNER_MESSAGE_FILTER', 'on');
    expect(storedTextForOwner([PHISH], WHERE)).toBe(true);
    vi.stubEnv('UNVERIFIED_OWNER_MESSAGE_FILTER', 'off');
    vi.stubEnv('OWNER_OUTREACH_STORED_TEXT_SCREEN', 'on');
    expect(storedTextForOwner([PHISH], WHERE)).toBe(false);
  });
});
