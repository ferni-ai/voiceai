/**
 * Regression test for the "Failed to save personality profile" Firestore
 * error: `Cannot use "undefined" as a Firestore value (found in field
 * "relationshipDepth.firstVulnerableShareAt")`.
 *
 * Firestore rejects a document containing a literal `undefined` value at
 * any depth. `PersonalityProfile.toPersistence()` is exactly the object
 * `FirestorePersonalityRepository.saveProfile()` hands to `docRef.set()`
 * (minus the array fields it strips before writing), so every value nested
 * inside it must be either present or omitted - never `undefined`.
 */
import { describe, it, expect } from 'vitest';
import { PersonalityProfile } from '../personality-profile.js';
import { RelationshipDepth } from '../value-objects/relationship-depth.js';
import { EmotionalState } from '../value-objects/emotional-state.js';

/**
 * Recursively collect dotted paths of every `undefined` value in an object,
 * matching how Firestore reports them (e.g. "relationshipDepth.firstVulnerableShareAt").
 */
function findUndefinedPaths(value: unknown, path = ''): string[] {
  if (value === undefined) {
    return [path || '(root)'];
  }
  if (value === null || typeof value !== 'object') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => findUndefinedPaths(item, `${path}[${i}]`));
  }
  if (value instanceof Date) {
    return [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, v]) =>
    findUndefinedPaths(v, path ? `${path}.${key}` : key)
  );
}

describe('personality persistence has no undefined values', () => {
  it('RelationshipDepth.toPersistence() omits unset timestamps instead of writing undefined', () => {
    const depth = RelationshipDepth.stranger();
    const persisted = depth.toPersistence();

    expect(findUndefinedPaths(persisted)).toEqual([]);
    expect('firstVulnerableShareAt' in persisted).toBe(false);
    expect('lastVulnerableShareAt' in persisted).toBe(false);
  });

  it('RelationshipDepth.toPersistence() still includes the timestamps once set', () => {
    const depth = RelationshipDepth.stranger().withVulnerabilityDeposit(20, true);
    const persisted = depth.toPersistence();

    expect(findUndefinedPaths(persisted)).toEqual([]);
    expect(typeof persisted.firstVulnerableShareAt).toBe('string');
    expect(typeof persisted.lastVulnerableShareAt).toBe('string');
  });

  it('EmotionalState.toPersistence() omits unset contradictingEmotion/triggerContext', () => {
    const state = EmotionalState.neutral();
    const persisted = state.toPersistence();

    expect(findUndefinedPaths(persisted)).toEqual([]);
    expect('contradictingEmotion' in persisted).toBe(false);
    expect('triggerContext' in persisted).toBe(false);
  });

  it('a brand-new PersonalityProfile serializes with no undefined values anywhere', () => {
    // This is the exact shape saveProfile() passes to docRef.set() (it
    // additionally strips the array fields, which only removes keys, never
    // introduces undefined ones).
    const profile = PersonalityProfile.create('voice-eval-sam', 'ferni');
    const persisted = profile.toPersistence();

    expect(findUndefinedPaths(persisted)).toEqual([]);
  });

  it('a profile with a recorded vulnerability still serializes with no undefined values', () => {
    const profile = PersonalityProfile.create('voice-eval-sam', 'ferni');
    profile.recordVulnerability({
      level: 'personal',
      category: 'other',
      summary: 'Shared a work worry',
      content: 'Work has been stressful lately.',
      isFirstTime: true,
    });

    const persisted = profile.toPersistence();
    expect(findUndefinedPaths(persisted)).toEqual([]);
  });
});
