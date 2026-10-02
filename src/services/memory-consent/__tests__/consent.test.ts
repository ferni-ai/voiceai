/**
 * Sensitive-memory consent: default off, per-category switches, the upfront
 * answer, listeners, fail-closed reads, the preference-profile health wiring,
 * and the text classifier (fake Firestore).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeFirestore,
  type FakeFirestore,
} from '../../user-preferences/__tests__/fake-firestore.js';

let fake: FakeFirestore | null;
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => fake,
}));

const consent = await import('../index.js');
const food = await import('../../user-preferences/food.js');

const U = 'user-1';
const userDoc = () => fake?.store.get(`bogle_users/${U}`) as Record<string, unknown> | undefined;

beforeEach(() => {
  fake = createFakeFirestore();
  consent.clearConsentCache();
});
afterEach(() => vi.restoreAllMocks());

describe('consent store', () => {
  it('is off and unanswered until the user says yes', async () => {
    const r = await consent.getConsent(U);
    expect(r.success && r.data).toMatchObject({
      answeredAt: null,
      categories: {
        health: { enabled: false },
        finances: { enabled: false },
        beliefs: { enabled: false },
      },
    });
    for (const c of consent.SENSITIVE_CATEGORIES) {
      expect(await consent.isCategoryEnabled(U, c)).toBe(false);
    }
  });

  it('stores one record on the user doc; switches are per category', async () => {
    const r = await consent.setCategoryConsent(U, 'health', true, 'page');
    expect(r.success).toBe(true);
    const stored = userDoc()?.memoryConsent as Record<string, unknown>;
    expect(stored).toMatchObject({
      version: consent.CONSENT_VERSION,
      categories: { health: { enabled: true, source: 'page' } },
    });
    expect(typeof stored.answeredAt).toBe('string');
    expect(await consent.isCategoryEnabled(U, 'health')).toBe(true);
    expect(await consent.isCategoryEnabled(U, 'finances')).toBe(false);

    // Read back from storage, not just the cache
    consent.clearConsentCache();
    expect(await consent.isCategoryEnabled(U, 'health')).toBe(true);
  });

  it('the upfront answer turns all three on, or records "no" with all off', async () => {
    await consent.answerUpfrontConsent(U, true, 'onboarding');
    for (const c of consent.SENSITIVE_CATEGORIES) {
      expect(await consent.isCategoryEnabled(U, c)).toBe(true);
    }
    const no = await consent.answerUpfrontConsent('user-2', false, 'page');
    expect(no.success && no.data.answeredAt).toBeTruthy();
    expect(await consent.isCategoryEnabled('user-2', 'health')).toBe(false);
  });

  it('notifies listeners only when a switch flips', async () => {
    const seen: string[] = [];
    const off = consent.onConsentChange((uid, c, on) => seen.push(`${uid}:${c}:${on}`));
    await consent.setCategoryConsent(U, 'health', true, 'page');
    await consent.setCategoryConsent(U, 'health', true, 'page');
    await consent.setCategoryConsent(U, 'health', false, 'voice');
    off();
    await consent.setCategoryConsent(U, 'health', true, 'voice');
    expect(seen).toEqual([`${U}:health:true`, `${U}:health:false`]);
  });

  it('rejects unknown categories and anonymous users', async () => {
    const bad = await consent.setCategoryConsent(U, 'politics' as never, true, 'page');
    expect(bad.success).toBe(false);
    expect((await consent.getConsent('anonymous')).success).toBe(false);
    expect(await consent.isCategoryEnabled('anonymous', 'health')).toBe(false);
  });

  it('fails closed when consent cannot be read', async () => {
    await consent.setCategoryConsent(U, 'health', true, 'page');
    consent.clearConsentCache();
    fake = null;
    expect(await consent.isCategoryEnabled(U, 'health')).toBe(false);
  });

  it('treats a malformed stored record as off', () => {
    expect(
      consent.parseConsent({ categories: { health: { enabled: 'yes' } } }).categories.health.enabled
    ).toBe(false);
    expect(consent.parseConsent('nope')).toEqual(consent.DEFAULT_CONSENT);
  });
});

describe('preference-profile health check is wired to consent', () => {
  it('medical food restrictions follow the Health switch by default', async () => {
    expect(await food.isHealthCategoryEnabled(U)).toBe(false);
    await consent.setCategoryConsent(U, 'health', true, 'page');
    expect(await food.isHealthCategoryEnabled(U)).toBe(true);
  });
});

describe('classifier', () => {
  it.each([
    ['I was diagnosed with asthma', 'health'],
    ['I take metformin 500mg', 'health'],
    ['my therapist said I should rest', 'health'],
    ['I have a lot of credit card debt', 'finances'],
    ['my salary barely covers my rent', 'finances'],
    ['I go to church every Sunday', 'beliefs'],
    ['I pray before bed', 'beliefs'],
  ])('%s → %s', (text, category) => {
    expect(consent.sensitiveCategoriesOf(text)).toContain(category);
  });

  it.each([
    'oh my god that was funny',
    'I lent him my bike',
    'we raised the kids in Ohio',
    'I love hiking on weekends',
    'my sister Sarah is visiting',
  ])('%s → none', (text) => {
    expect(consent.sensitiveCategoriesOf(text)).toEqual([]);
  });

  it('maps extraction fact types', () => {
    expect(consent.categoryForFactType('health')).toBe('health');
    expect(consent.categoryForFactType('finance')).toBe('finances');
    expect(consent.categoryForFactType('belief')).toBe('beliefs');
    expect(consent.categoryForFactType('preference')).toBeNull();
  });
});
