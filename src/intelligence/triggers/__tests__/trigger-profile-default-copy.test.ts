/**
 * A new user's trigger profile starts empty, whoever was profiled before them.
 *
 * getOrCreateDefault shallow-copied DEFAULT_USER_TRIGGER_PROFILE, so every
 * user without a stored profile got the same significantDates and
 * relationships arrays. One user's "my mom passed in March" was pushed into the
 * shared array and showed up in the next new user's profile, where the
 * special-dates builder reads isDeceased relationships as people that user has
 * lost.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
            set: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      }),
    }),
  })),
}));

import { UserTriggerProfileService } from '../user-trigger-profile-service.js';
import { DEFAULT_USER_TRIGGER_PROFILE } from '../user-trigger-profile.types.js';

describe('trigger profile defaults are per user', () => {
  it("one user's lost parent and grief date never appear in another user's new profile", async () => {
    const service = new UserTriggerProfileService({ enablePersistence: false });

    await service.addSignificantDate('user-a', {
      id: 'a-date',
      date: '2026-03-14',
      isRecurring: true,
      type: 'loss',
      description: 'Mom passed',
      relatedPerson: 'Mom',
      emotionalWeight: 0.9,
      triggerCategories: ['grief'],
      extractedAt: new Date(),
      confidence: 0.95,
      source: 'explicit',
    });
    await service.addRelationship('user-a', {
      id: 'a-mom',
      name: 'Mom',
      aliases: [],
      type: 'family',
      role: 'mother',
      emotionalValence: 'very_positive',
      isDeceased: true,
      triggerCategories: ['grief'],
      mentionFrequency: 1,
      lastMentioned: new Date(),
      associatedTopics: [],
      extractedAt: new Date(),
      confidence: 0.95,
    });

    // user-a really has them, so the next assertions are not vacuous
    const a = await service.loadProfile('user-a');
    expect(a.relationships.map((r) => r.name)).toEqual(['Mom']);
    expect(a.significantDates.map((d) => d.id)).toEqual(['a-date']);

    const b = await service.loadProfile('user-b');
    expect(b.relationships).toEqual([]);
    expect(b.significantDates).toEqual([]);
    expect(DEFAULT_USER_TRIGGER_PROFILE.relationships).toEqual([]);
    expect(DEFAULT_USER_TRIGGER_PROFILE.significantDates).toEqual([]);
  });
});
