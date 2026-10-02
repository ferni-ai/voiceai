/**
 * Mood timeline: gentle model, consent-gated storage, deletion and the
 * session-start prompt block (budget + consent).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeFirestore,
  type FakeFirestore,
} from '../../user-preferences/__tests__/fake-firestore.js';
import type { MoodConversation } from '../types.js';

let fake: FakeFirestore;
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => fake,
}));

const consent = await import('../../memory-consent/index.js');
const health = await import('../index.js');

const U = 'user-1';
const moodDocs = () => [...fake.store.keys()].filter((k) => k.includes('/mood_timeline/'));

beforeEach(() => {
  fake = createFakeFirestore();
  consent.clearConsentCache();
  health.clearMoodBuffers();
});

const conv = (
  daysAgo: number,
  averageValence: number,
  arc: MoodConversation['arc'] = 'steady'
): MoodConversation => {
  const at = new Date(Date.parse('2026-10-02T12:00:00Z') - daysAgo * 86_400_000).toISOString();
  return {
    id: `c${daysAgo}`,
    conversationIds: [`c${daysAgo}`],
    startedAt: at,
    endedAt: at,
    samples: [],
    dominantMood: 'neutral',
    averageValence,
    arc,
    updatedAt: at,
  };
};
const NOW = new Date('2026-10-02T12:00:00Z');

describe('mood model', () => {
  it('maps emotions to light/heavy, distress pulls down', () => {
    expect(health.valenceFor('happy', 0.8)).toBeGreaterThan(0.5);
    expect(health.valenceFor('anxious', 0.6)).toBeLessThan(0);
    expect(health.valenceFor('neutral', 0.9)).toBe(0);
    expect(health.valenceFor('happy', 0.8, 0.9)).toBeLessThan(0);
  });

  it('summarizes the arc of a conversation', () => {
    const s = (valence: number) => ({
      at: '2026-10-01T00:00:00Z',
      mood: valence > 0 ? 'happy' : 'sad',
      valence,
      intensity: 0.5,
    });
    expect(health.summarizeSamples([s(-0.6), s(-0.5), s(0), s(0.5), s(0.6), s(0.7)]).arc).toBe(
      'lifting'
    );
    expect(health.summarizeSamples([s(0.6), s(0.5), s(-0.4), s(-0.6)]).arc).toBe('heavier');
    expect(health.summarizeSamples([]).arc).toBe('steady');
  });

  it('gives gentle, non-clinical trend lines only with enough evidence', () => {
    expect(health.buildMoodInsight([conv(1, 0.5)], NOW)).toBeNull();
    const lighter = health.buildMoodInsight(
      [conv(1, 0.4), conv(3, 0.3), conv(10, -0.2), conv(14, -0.1)],
      NOW
    );
    expect(lighter).toContain('lighter this week');
    const heavier = health.buildMoodInsight(
      [conv(1, -0.4), conv(2, -0.3), conv(10, 0.3), conv(12, 0.2)],
      NOW
    );
    expect(heavier).toContain('heavier');
    for (const line of [lighter, heavier]) {
      expect(line).not.toMatch(/depress|disorder|diagnos|symptom|anxiety/i);
    }
  });
});

describe('mood timeline storage', () => {
  it('is never written without Health consent, but readings are accepted (live attunement)', async () => {
    health.recordMoodSample(U, 'sess-1', { mood: 'sad', intensity: 0.7 });
    expect(await health.flushMoodTimeline(U, 'conv-1')).toBe(0);
    expect(moodDocs()).toEqual([]);
  });

  it('writes one timeline per conversation with both ids, once consented', async () => {
    await consent.setCategoryConsent(U, 'health', true, 'page');
    const t0 = Date.parse('2026-10-01T10:00:00Z');
    health.recordMoodSample(U, 'sess-1', {
      mood: 'anxious',
      intensity: 0.7,
      at: new Date(t0),
      personaId: 'ferni',
    });
    health.recordMoodSample(U, 'sess-1', {
      mood: 'calm',
      intensity: 0.6,
      at: new Date(t0 + 20_000),
    });
    health.recordMoodSample(U, 'sess-1', {
      mood: 'happy',
      intensity: 0.8,
      at: new Date(t0 + 40_000),
    });
    expect(await health.flushMoodTimeline(U, 'conv-1')).toBe(1);
    const [entry] = await health.listMoodTimeline(U);
    expect(entry).toMatchObject({
      id: 'sess-1',
      conversationIds: ['sess-1', 'conv-1'],
      personaId: 'ferni',
      arc: 'lifting',
    });
    expect(entry?.samples).toHaveLength(3);
  });

  it('switching Health off drops what is buffered', async () => {
    await consent.setCategoryConsent(U, 'health', true, 'page');
    health.recordMoodSample(U, 'sess-1', { mood: 'sad', intensity: 0.7 });
    await consent.setCategoryConsent(U, 'health', false, 'voice');
    await consent.setCategoryConsent(U, 'health', true, 'voice');
    expect(await health.flushMoodTimeline(U)).toBe(0);
    expect(moodDocs()).toEqual([]);
  });

  it('a deleted timeline is never written again (by either id)', async () => {
    await consent.setCategoryConsent(U, 'health', true, 'page');
    health.recordMoodSample(U, 'sess-1', { mood: 'sad', intensity: 0.7 });
    await health.flushMoodTimeline(U, 'conv-1');
    expect(await health.deleteMoodFor(U, 'conv-1')).toBe(1);
    health.recordMoodSample(U, 'sess-1', { mood: 'happy', intensity: 0.7 });
    await health.flushMoodTimeline(U);
    expect(moodDocs()).toEqual([]);
  });
});

describe('prompt block', () => {
  const consentWith = (enabled: boolean, answered: boolean) => ({
    ...consent.DEFAULT_CONSENT,
    answeredAt: answered ? '2026-09-01T00:00:00Z' : null,
    categories: {
      ...consent.DEFAULT_CONSENT.categories,
      health: { enabled, updatedAt: null, source: null },
    },
  });
  const item = (text: string, kind: 'condition' | 'sleep' | 'appointment', daysAgo = 1) => {
    const at = new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
    return {
      id: `health_${text}`,
      kind,
      subject: text,
      text,
      status: kind === 'appointment' ? ('upcoming' as const) : ('current' as const),
      confidence: 0.9,
      source: 'explicit' as const,
      sourceConversationIds: [],
      sourceFactIds: [],
      mentions: 1,
      userEdited: false,
      firstMentionedAt: at,
      lastMentionedAt: at,
      updatedAt: at,
      ...(kind === 'sleep' ? { day: at.slice(0, 10) } : {}),
    };
  };

  it('without consent: a one-line ask while unanswered, nothing once answered', () => {
    const ask = health.buildHealthMoodBlock({
      consent: consentWith(false, false),
      items: [item('Has asthma', 'condition')],
      timeline: [],
    });
    expect(ask).toContain('Sensitive Memory');
    expect(ask).not.toContain('asthma');
    expect(
      health.buildHealthMoodBlock({
        consent: consentWith(false, true),
        items: [item('Has asthma', 'condition')],
        timeline: [],
      })
    ).toBe('');
  });

  it('with consent: health notes and a gentle mood line within the budget', () => {
    const items = [
      item('Dentist appointment next Tuesday', 'appointment'),
      item('Has asthma', 'condition'),
      item('Slept 4 hours', 'sleep'),
      ...Array.from({ length: 10 }, (_, i) =>
        item(`Long-standing condition number ${i} with details`, 'condition')
      ),
    ];
    const timeline = [conv(1, 0.5), conv(2, 0.6)];
    const block = health.buildHealthMoodBlock({
      consent: consentWith(true, true),
      items,
      timeline,
      now: NOW,
    });
    expect(block).toContain('Dentist appointment next Tuesday');
    expect(block).toContain('Never diagnose');
    expect(block.length).toBeLessThanOrEqual(health.DEFAULT_HEALTH_BLOCK_BUDGET);
    const small = health.buildHealthMoodBlock({
      consent: consentWith(true, true),
      items,
      timeline,
      now: NOW,
      budget: 260,
    });
    expect(small.length).toBeLessThanOrEqual(260);
    const withMood = health.buildHealthMoodBlock({
      consent: consentWith(true, true),
      items: [],
      timeline,
      now: NOW,
    });
    expect(withMood).toContain('Mood lately');
  });

  it('loads from storage and respects consent', async () => {
    expect(await health.loadHealthMoodBlock(U)).toContain('Sensitive Memory');
    await consent.setCategoryConsent(U, 'health', true, 'page');
    await health.upsertHealthItem(U, {
      kind: 'condition',
      subject: 'asthma',
      text: 'Has asthma',
      confidence: 0.9,
      source: 'explicit',
    });
    expect(await health.loadHealthMoodBlock(U)).toContain('Has asthma');
    await consent.setCategoryConsent(U, 'health', false, 'page');
    expect(await health.loadHealthMoodBlock(U)).toBe('');
  });
});
