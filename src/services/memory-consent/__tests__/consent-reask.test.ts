/**
 * Asking the upfront consent question again when its wording version changes:
 * switches stay as they were, nothing is turned on, the ask happens once.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeFirestore,
  type FakeFirestore,
} from '../../user-preferences/__tests__/fake-firestore.js';

let fake: FakeFirestore | null;
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => fake,
}));

const consent = await import('../index.js');
const { buildHealthMoodBlock, consentAskHint } =
  await import('../../health-memory/context-block.js');

const U = 'user-1';
const OLD = '2026-01-01T00:00:00.000Z';

function seedOld(health: boolean, answeredAt: string | null = OLD): void {
  fake?.store.set(`bogle_users/${U}`, {
    memoryConsent: {
      version: consent.CONSENT_VERSION - 1,
      answeredAt,
      categories: {
        health: { enabled: health, updatedAt: OLD, source: 'page' },
        finances: { enabled: false, updatedAt: OLD, source: 'page' },
        beliefs: { enabled: false, updatedAt: OLD, source: 'page' },
      },
      updatedAt: OLD,
    },
  });
}

beforeEach(() => {
  fake = createFakeFirestore();
  consent.clearConsentCache();
});

describe('needsConsentAnswer', () => {
  it('is true when never answered or answered under older wording', () => {
    const v = consent.CONSENT_VERSION;
    expect(consent.needsConsentAnswer({ answeredAt: null, version: v })).toBe(true);
    expect(consent.needsConsentAnswer({ answeredAt: OLD, version: v - 1 })).toBe(true);
    expect(consent.needsConsentAnswer({ answeredAt: OLD, version: v })).toBe(false);
  });

  it('reads a record stored before versioning as the first wording', () => {
    expect(consent.parseConsent({ answeredAt: OLD }).version).toBe(1);
    expect(consent.parseConsent(undefined).version).toBe(consent.CONSENT_VERSION);
  });
});

describe('asking again after the wording changed', () => {
  it('keeps the switches exactly as they were', async () => {
    seedOld(true);
    const r = await consent.getConsent(U);
    expect(r.success && consent.needsConsentAnswer(r.data)).toBe(true);
    expect(await consent.isCategoryEnabled(U, 'health')).toBe(true);
    expect(await consent.isCategoryEnabled(U, 'finances')).toBe(false);
  });

  it('"keep my choices" answers the new wording without changing any switch', async () => {
    seedOld(true);
    const seen: string[] = [];
    const off = consent.onConsentChange((_u, c, on) => seen.push(`${c}:${on}`));
    const kept = await consent.confirmConsentChoices(U, 'page');
    off();
    expect(kept.success).toBe(true);
    if (!kept.success) return;
    expect(consent.needsConsentAnswer(kept.data)).toBe(false);
    expect(kept.data.answeredAt).not.toBe(OLD);
    expect(kept.data.categories.health).toEqual({ enabled: true, updatedAt: OLD, source: 'page' });
    expect(kept.data.categories.finances.enabled).toBe(false);
    expect(seen).toEqual([]);
  });

  it('a change that is not an answer keeps asking; a real answer stops it', async () => {
    seedOld(false);
    const r = await consent.updateConsent(U, {
      categories: { health: false },
      source: 'voice',
      answered: false,
    });
    expect(r.success && consent.needsConsentAnswer(r.data)).toBe(true);
    const yes = await consent.answerUpfrontConsent(U, true, 'voice');
    expect(yes.success && consent.needsConsentAnswer(yes.data)).toBe(false);
  });
});

describe('the persona asks once more', () => {
  const view = (health: boolean, answeredAt: string | null, version: number) => ({
    ...consent.DEFAULT_CONSENT,
    version,
    answeredAt,
    categories: {
      ...consent.DEFAULT_CONSENT.categories,
      health: { enabled: health, updatedAt: null, source: null },
    },
  });
  const v = consent.CONSENT_VERSION;

  it('uses a re-ask hint, not the first-time one, and nothing once answered', () => {
    expect(consentAskHint(view(false, null, v))).toContain("haven't said");
    expect(consentAskHint(view(false, OLD, v - 1))).toContain('Still okay');
    expect(consentAskHint(view(false, OLD, v))).toBe('');
  });

  it('adds the re-ask to the health block even with Health on', () => {
    const at = '2026-09-01T00:00:00.000Z';
    const block = buildHealthMoodBlock({
      consent: view(true, OLD, v - 1),
      items: [
        {
          id: 'h1',
          kind: 'condition',
          subject: 'asthma',
          text: 'Has asthma',
          status: 'current',
          confidence: 0.9,
          source: 'explicit',
          sourceConversationIds: [],
          sourceFactIds: [],
          mentions: 1,
          userEdited: false,
          firstMentionedAt: at,
          lastMentionedAt: at,
          updatedAt: at,
        },
      ],
      timeline: [],
      budget: 2000,
    });
    expect(block).toContain('Has asthma');
    expect(block).toContain('Still okay');
  });
});
