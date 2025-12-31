/**
 * Tests for Team Huddle Service
 *
 * Verifies that observations are recorded, stored, and that
 * cross-domain connections are properly detected.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  recordObservation,
  getObservations,
  clearObservations,
  generateTeamHuddle,
  type PersonaId,
  type PersonaObservation,
} from '../team-huddle.js';

describe('TeamHuddle', () => {
  const testUserId = 'test-user-123';

  beforeEach(() => {
    // Clear observations before each test
    clearObservations(testUserId);
  });

  afterEach(() => {
    // Clean up after each test
    clearObservations(testUserId);
  });

  describe('recordObservation', () => {
    it('should record a single observation', () => {
      recordObservation(testUserId, {
        personaId: 'maya',
        observationType: 'concern',
        content: 'User reported sleep issues',
        confidence: 0.8,
        domain: 'sleep_health',
      });

      const observations = getObservations(testUserId);
      expect(observations.length).toBe(1);
      expect(observations[0].personaId).toBe('maya');
      expect(observations[0].observationType).toBe('concern');
    });

    it('should add detectedAt timestamp', () => {
      const before = new Date();

      recordObservation(testUserId, {
        personaId: 'ferni',
        observationType: 'insight',
        content: 'Test observation',
        confidence: 0.7,
        domain: 'general',
      });

      const after = new Date();
      const observations = getObservations(testUserId);

      expect(observations[0].detectedAt).toBeInstanceOf(Date);
      expect(observations[0].detectedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(observations[0].detectedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should record multiple observations from different personas', () => {
      recordObservation(testUserId, {
        personaId: 'maya',
        observationType: 'pattern',
        content: 'User exercises regularly',
        confidence: 0.75,
        domain: 'physical_activity',
      });

      recordObservation(testUserId, {
        personaId: 'peter',
        observationType: 'concern',
        content: 'User stressed about work',
        confidence: 0.8,
        domain: 'work_stress',
      });

      recordObservation(testUserId, {
        personaId: 'jordan',
        observationType: 'milestone',
        content: 'User birthday next week',
        confidence: 0.9,
        domain: 'life_events',
      });

      const observations = getObservations(testUserId);
      expect(observations.length).toBe(3);

      const personaIds = observations.map((o) => o.personaId);
      expect(personaIds).toContain('maya');
      expect(personaIds).toContain('peter');
      expect(personaIds).toContain('jordan');
    });

    it('should include optional fields', () => {
      recordObservation(testUserId, {
        personaId: 'nayan',
        observationType: 'insight',
        content: 'User exploring meaning',
        confidence: 0.7,
        domain: 'existential',
        relatedTopics: ['purpose', 'legacy', 'values'],
        suggestedAction: 'Guide reflection on values',
      });

      const observations = getObservations(testUserId);
      expect(observations[0].relatedTopics).toEqual(['purpose', 'legacy', 'values']);
      expect(observations[0].suggestedAction).toBe('Guide reflection on values');
    });
  });

  describe('getObservations', () => {
    it('should return empty array for user with no observations', () => {
      const observations = getObservations('unknown-user');
      expect(observations).toEqual([]);
    });

    it('should return all observations for user', () => {
      recordObservation(testUserId, {
        personaId: 'ferni',
        observationType: 'insight',
        content: 'Observation 1',
        confidence: 0.6,
        domain: 'general',
      });

      recordObservation(testUserId, {
        personaId: 'alex',
        observationType: 'opportunity',
        content: 'Observation 2',
        confidence: 0.7,
        domain: 'scheduling',
      });

      const observations = getObservations(testUserId);
      expect(observations.length).toBe(2);
    });

    it('should not return observations from other users', () => {
      const otherUserId = 'other-user-456';

      recordObservation(testUserId, {
        personaId: 'ferni',
        observationType: 'insight',
        content: 'User 1 observation',
        confidence: 0.6,
        domain: 'general',
      });

      recordObservation(otherUserId, {
        personaId: 'ferni',
        observationType: 'insight',
        content: 'User 2 observation',
        confidence: 0.6,
        domain: 'general',
      });

      const user1Obs = getObservations(testUserId);
      const user2Obs = getObservations(otherUserId);

      expect(user1Obs.length).toBe(1);
      expect(user2Obs.length).toBe(1);
      expect(user1Obs[0].content).toBe('User 1 observation');
      expect(user2Obs[0].content).toBe('User 2 observation');

      // Clean up other user
      clearObservations(otherUserId);
    });
  });

  describe('clearObservations', () => {
    it('should clear all observations for a user', () => {
      recordObservation(testUserId, {
        personaId: 'ferni',
        observationType: 'insight',
        content: 'Test',
        confidence: 0.6,
        domain: 'general',
      });

      expect(getObservations(testUserId).length).toBe(1);

      clearObservations(testUserId);

      expect(getObservations(testUserId).length).toBe(0);
    });

    it('should not affect other users', () => {
      const otherUserId = 'other-user-789';

      recordObservation(testUserId, {
        personaId: 'ferni',
        observationType: 'insight',
        content: 'User 1',
        confidence: 0.6,
        domain: 'general',
      });

      recordObservation(otherUserId, {
        personaId: 'ferni',
        observationType: 'insight',
        content: 'User 2',
        confidence: 0.6,
        domain: 'general',
      });

      clearObservations(testUserId);

      expect(getObservations(testUserId).length).toBe(0);
      expect(getObservations(otherUserId).length).toBe(1);

      clearObservations(otherUserId);
    });
  });

  describe('generateTeamHuddle', () => {
    it('should generate huddle summary with observations', async () => {
      // Add several observations
      recordObservation(testUserId, {
        personaId: 'maya',
        observationType: 'concern',
        content: 'Sleep declining for 2 weeks',
        confidence: 0.85,
        domain: 'sleep_health',
        relatedTopics: ['sleep', 'fatigue'],
      });

      recordObservation(testUserId, {
        personaId: 'peter',
        observationType: 'pattern',
        content: 'Stress mentions up 40%',
        confidence: 0.8,
        domain: 'work_stress',
        relatedTopics: ['stress', 'work'],
      });

      const huddle = await generateTeamHuddle(testUserId);

      expect(huddle).toBeDefined();
      expect(huddle.generatedAt).toBeInstanceOf(Date);
      expect(huddle.observations.length).toBe(2);
    });

    it('should detect cross-domain connections', async () => {
      // Add related observations from different personas
      recordObservation(testUserId, {
        personaId: 'maya',
        observationType: 'concern',
        content: 'User not sleeping well',
        confidence: 0.85,
        domain: 'sleep_health',
        relatedTopics: ['sleep', 'stress'],
      });

      recordObservation(testUserId, {
        personaId: 'peter',
        observationType: 'concern',
        content: 'Work stress increasing',
        confidence: 0.8,
        domain: 'work_stress',
        relatedTopics: ['stress', 'work'],
      });

      const huddle = await generateTeamHuddle(testUserId);

      // Should detect connection via shared 'stress' topic
      expect(huddle.connections.length).toBeGreaterThan(0);
    });

    it('should generate synthesis for multiple observations', async () => {
      // Use 'concern' and 'opportunity' types which the synthesizeInsights function counts
      recordObservation(testUserId, {
        personaId: 'maya',
        observationType: 'concern',
        content: 'User stress levels elevated',
        confidence: 0.9,
        domain: 'stress',
      });

      recordObservation(testUserId, {
        personaId: 'jordan',
        observationType: 'opportunity',
        content: 'User ready for goal celebration',
        confidence: 0.95,
        domain: 'achievements',
      });

      const huddle = await generateTeamHuddle(testUserId);

      expect(huddle.synthesis).toBeTruthy();
      expect(typeof huddle.synthesis).toBe('string');
    });

    it('should include user state assessment', async () => {
      recordObservation(testUserId, {
        personaId: 'ferni',
        observationType: 'opportunity',
        content: 'User in positive mood',
        confidence: 0.8,
        domain: 'positive_emotions',
      });

      recordObservation(testUserId, {
        personaId: 'maya',
        observationType: 'pattern',
        content: 'User maintaining habits',
        confidence: 0.85,
        domain: 'routine_building',
      });

      const huddle = await generateTeamHuddle(testUserId);

      expect(huddle.userStateAssessment).toBeDefined();
      expect(typeof huddle.userStateAssessment.wellbeing).toBe('number');
      expect(['improving', 'stable', 'declining']).toContain(huddle.userStateAssessment.trajectory);
    });

    it('should generate recommendations', async () => {
      recordObservation(testUserId, {
        personaId: 'maya',
        observationType: 'concern',
        content: 'User broke habit streak',
        confidence: 0.9,
        domain: 'habit_setbacks',
        suggestedAction: 'Support recovery without judgment',
      });

      const huddle = await generateTeamHuddle(testUserId);

      expect(huddle.recommendations.length).toBeGreaterThan(0);
      expect(huddle.recommendations[0]).toHaveProperty('type');
      expect(huddle.recommendations[0]).toHaveProperty('reason');
      expect(huddle.recommendations[0]).toHaveProperty('priority');
    });

    it('should handle empty observations gracefully', async () => {
      const huddle = await generateTeamHuddle(testUserId);

      expect(huddle).toBeDefined();
      expect(huddle.observations.length).toBe(0);
      expect(huddle.connections.length).toBe(0);
    });
  });

  describe('observation types', () => {
    const observationTypes: PersonaObservation['observationType'][] = [
      'pattern',
      'concern',
      'opportunity',
      'milestone',
      'insight',
    ];

    for (const type of observationTypes) {
      it(`should accept ${type} observation type`, () => {
        recordObservation(testUserId, {
          personaId: 'ferni',
          observationType: type,
          content: `Test ${type}`,
          confidence: 0.7,
          domain: 'general',
        });

        const observations = getObservations(testUserId);
        expect(observations[0].observationType).toBe(type);
      });
    }
  });

  describe('all personas', () => {
    const personas: PersonaId[] = ['ferni', 'peter', 'maya', 'jordan', 'alex', 'nayan'];

    for (const personaId of personas) {
      it(`should record observations from ${personaId}`, () => {
        recordObservation(testUserId, {
          personaId,
          observationType: 'insight',
          content: `Observation from ${personaId}`,
          confidence: 0.7,
          domain: 'general',
        });

        const observations = getObservations(testUserId);
        expect(observations[0].personaId).toBe(personaId);
      });
    }
  });
});
