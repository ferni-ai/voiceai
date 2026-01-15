/**
 * Tests for Personality v2 Entities
 *
 * Tests the domain entities with identity and lifecycle:
 * - PersonalityProfile (Aggregate Root)
 * - EmotionalPattern
 * - VulnerabilityDeposit
 * - GrowthMilestone
 *
 * @module tests/personality/v2/entities
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { PersonalityProfile } from '../../../personality/domain/model/personality-profile.js';
import { EmotionalPattern } from '../../../personality/domain/model/emotional-pattern.js';
import { VulnerabilityDeposit } from '../../../personality/domain/model/vulnerability-deposit.js';
import { GrowthMilestone } from '../../../personality/domain/model/growth-milestone.js';
import { EmotionalState } from '../../../personality/domain/model/value-objects/emotional-state.js';

// ============================================================================
// EMOTIONAL PATTERN TESTS
// ============================================================================

describe('EmotionalPattern', () => {
  describe('Creation', () => {
    it('should create a new pattern', () => {
      const pattern = EmotionalPattern.create({
        userId: 'user_123',
        patternType: 'topic_emotion',
        description: 'work → stress',
        triggers: ['work', 'job', 'boss'],
        resultingEmotion: 'fear',
        resultingGranular: 'anxious',
      });

      expect(pattern.id).toBeTruthy();
      expect(pattern.userId).toBe('user_123');
      expect(pattern.patternType).toBe('topic_emotion');
      expect(pattern.resultingEmotion).toBe('fear');
      expect(pattern.triggers).toContain('work');
    });

    it('should generate default insight', () => {
      const pattern = EmotionalPattern.create({
        userId: 'user_123',
        patternType: 'topic_emotion',
        description: 'work → stress',
        triggers: ['work', 'job'],
        resultingEmotion: 'fear',
      });

      expect(pattern.insightToShare).toContain('work');
      expect(pattern.insightToShare).toContain('fear');
    });
  });

  describe('Evidence Tracking', () => {
    it('should add evidence', () => {
      const pattern = EmotionalPattern.create({
        userId: 'user_123',
        patternType: 'topic_emotion',
        description: 'work → stress',
        triggers: ['work'],
        resultingEmotion: 'fear',
      });

      pattern.addEvidence({
        timestamp: new Date(),
        context: 'User mentioned deadline stress',
        emotion: 'fear',
        granular: 'anxious',
        intensity: 0.7,
        topics: ['work', 'deadline'],
      });

      expect(pattern.evidenceCount).toBe(1);
      expect(pattern.confidence).toBeGreaterThan(0);
    });

    it('should increase confidence with more evidence', () => {
      const pattern = EmotionalPattern.create({
        userId: 'user_123',
        patternType: 'topic_emotion',
        description: 'work → stress',
        triggers: ['work'],
        resultingEmotion: 'fear',
      });

      const initialConfidence = pattern.confidence;

      // Add multiple evidence
      for (let i = 0; i < 5; i++) {
        pattern.addEvidence({
          timestamp: new Date(),
          context: `Evidence ${i}`,
          emotion: 'fear',
          granular: 'anxious',
          intensity: 0.7,
        });
      }

      expect(pattern.confidence).toBeGreaterThan(initialConfidence);
    });

    it('should confirm pattern after minimum occurrences', () => {
      const pattern = EmotionalPattern.create({
        userId: 'user_123',
        patternType: 'topic_emotion',
        description: 'work → stress',
        triggers: ['work'],
        resultingEmotion: 'fear',
      });

      expect(pattern.isConfirmed).toBe(false);

      // Add minimum required evidence (3)
      for (let i = 0; i < 3; i++) {
        pattern.addEvidence({
          timestamp: new Date(),
          context: `Evidence ${i}`,
          emotion: 'fear',
          intensity: 0.7,
        });
      }

      expect(pattern.isConfirmed).toBe(true);
    });
  });

  describe('matchesTriggers', () => {
    it('should match topic triggers', () => {
      const pattern = EmotionalPattern.create({
        userId: 'user_123',
        patternType: 'topic_emotion',
        description: 'work → stress',
        triggers: ['work', 'job', 'boss'],
        resultingEmotion: 'fear',
      });

      expect(pattern.matchesTriggers({ topics: ['work', 'meeting'] })).toBe(true);
      expect(pattern.matchesTriggers({ topics: ['vacation'] })).toBe(false);
    });

    it('should match temporal triggers', () => {
      const pattern = EmotionalPattern.create({
        userId: 'user_123',
        patternType: 'temporal',
        description: 'Sunday evening anxiety',
        triggers: ['sunday evening', 'sunday'],
        resultingEmotion: 'fear',
      });

      const sundayEvening = new Date('2024-01-07T19:00:00'); // Sunday

      expect(pattern.matchesTriggers({ currentTime: sundayEvening })).toBe(true);
    });

    it('should match person triggers', () => {
      const pattern = EmotionalPattern.create({
        userId: 'user_123',
        patternType: 'person_related',
        description: 'Mom → stress',
        triggers: ['mom', 'mother'],
        resultingEmotion: 'fear',
      });

      expect(pattern.matchesTriggers({ mentionedPeople: ['my mom'] })).toBe(true);
    });
  });

  describe('Surfacing', () => {
    it('should NOT be ready to surface without enough evidence', () => {
      const pattern = EmotionalPattern.create({
        userId: 'user_123',
        patternType: 'topic_emotion',
        description: 'work → stress',
        triggers: ['work'],
        resultingEmotion: 'fear',
      });

      expect(pattern.isReadyToSurface).toBe(false);
    });

    it('should respect cooldown after surfacing', () => {
      const pattern = EmotionalPattern.create({
        userId: 'user_123',
        patternType: 'topic_emotion',
        description: 'work → stress',
        triggers: ['work'],
        resultingEmotion: 'fear',
      });

      // Add enough evidence
      for (let i = 0; i < 5; i++) {
        pattern.addEvidence({
          timestamp: new Date(),
          context: `Evidence ${i}`,
          emotion: 'fear',
          intensity: 0.7,
        });
      }

      pattern.markSurfaced();

      expect(pattern.surfaced).toBe(true);
      expect(pattern.surfaceCount).toBe(1);
      expect(pattern.isReadyToSurface).toBe(false); // Cooldown
    });
  });

  describe('Serialization', () => {
    it('should round-trip through persistence', () => {
      const pattern = EmotionalPattern.create({
        userId: 'user_123',
        patternType: 'topic_emotion',
        description: 'work → stress',
        triggers: ['work', 'job'],
        resultingEmotion: 'fear',
        resultingGranular: 'anxious',
      });

      pattern.addEvidence({
        timestamp: new Date(),
        context: 'Test evidence',
        emotion: 'fear',
        intensity: 0.7,
      });

      const persisted = pattern.toPersistence();
      const restored = EmotionalPattern.fromPersistence(persisted);

      expect(restored.id).toBe(pattern.id);
      expect(restored.patternType).toBe(pattern.patternType);
      expect(restored.evidenceCount).toBe(pattern.evidenceCount);
    });
  });
});

// ============================================================================
// VULNERABILITY DEPOSIT TESTS
// ============================================================================

describe('VulnerabilityDeposit', () => {
  describe('Creation', () => {
    it('should create a vulnerability deposit', () => {
      const deposit = VulnerabilityDeposit.create({
        userId: 'user_123',
        personaId: 'ferni',
        level: 'vulnerable',
        category: 'personal_struggle',
        summary: 'Shared about anxiety',
        content: 'I have panic attacks before meetings',
      });

      expect(deposit.id).toBeTruthy();
      expect(deposit.userId).toBe('user_123');
      expect(deposit.level).toBe('vulnerable');
      expect(deposit.category).toBe('personal_struggle');
    });

    it('should calculate trust impact based on level', () => {
      const sacredDeposit = VulnerabilityDeposit.create({
        userId: 'user_123',
        personaId: 'ferni',
        level: 'sacred',
        category: 'past_trauma',
        summary: 'Shared trauma',
        content: 'Test content',
      });

      const personalDeposit = VulnerabilityDeposit.create({
        userId: 'user_123',
        personaId: 'ferni',
        level: 'personal',
        category: 'career_fear',
        summary: 'Career concern',
        content: 'Test content',
      });

      expect(sacredDeposit.trustImpact).toBeGreaterThan(personalDeposit.trustImpact);
    });

    it('should add first-time bonus', () => {
      const firstTimeDeposit = VulnerabilityDeposit.create({
        userId: 'user_123',
        personaId: 'ferni',
        level: 'vulnerable',
        category: 'personal_struggle',
        summary: 'First time share',
        content: 'Test content',
        isFirstTime: true,
      });

      const regularDeposit = VulnerabilityDeposit.create({
        userId: 'user_123',
        personaId: 'ferni',
        level: 'vulnerable',
        category: 'personal_struggle',
        summary: 'Regular share',
        content: 'Test content',
        isFirstTime: false,
      });

      expect(firstTimeDeposit.trustImpact).toBeGreaterThan(regularDeposit.trustImpact);
    });

    it('should extract keywords from content', () => {
      const deposit = VulnerabilityDeposit.create({
        userId: 'user_123',
        personaId: 'ferni',
        level: 'vulnerable',
        category: 'personal_struggle',
        summary: 'Anxiety at work',
        content: 'I have been struggling with anxiety at work especially during meetings',
      });

      expect(deposit.keywords).toContain('struggling');
      expect(deposit.keywords).toContain('anxiety');
      expect(deposit.keywords).toContain('work');
    });
  });

  describe('Follow-up Tracking', () => {
    it('should need follow-up for deep vulnerabilities', () => {
      const deposit = VulnerabilityDeposit.create({
        userId: 'user_123',
        personaId: 'ferni',
        level: 'vulnerable',
        category: 'personal_struggle',
        summary: 'Anxiety share',
        content: 'Test content',
      });

      expect(deposit.needsFollowUp).toBe(true);
    });

    it('should need follow-up for first-time shares', () => {
      const deposit = VulnerabilityDeposit.create({
        userId: 'user_123',
        personaId: 'ferni',
        level: 'personal',
        category: 'career_fear',
        summary: 'First time share',
        content: 'Test content',
        isFirstTime: true,
      });

      expect(deposit.needsFollowUp).toBe(true);
    });

    it('should track follow-up', () => {
      const deposit = VulnerabilityDeposit.create({
        userId: 'user_123',
        personaId: 'ferni',
        level: 'vulnerable',
        category: 'personal_struggle',
        summary: 'Anxiety share',
        content: 'Test content',
      });

      deposit.markFollowedUp('positive');

      expect(deposit.followedUp).toBe(true);
      expect(deposit.followUpResponse).toBe('positive');
      expect(deposit.needsFollowUp).toBe(false);
    });

    it('should close on negative follow-up response', () => {
      const deposit = VulnerabilityDeposit.create({
        userId: 'user_123',
        personaId: 'ferni',
        level: 'vulnerable',
        category: 'personal_struggle',
        summary: 'Anxiety share',
        content: 'Test content',
      });

      deposit.markFollowedUp('negative');

      expect(deposit.isOpen).toBe(false);
    });

    it('should identify urgent follow-ups', () => {
      const sacredDeposit = VulnerabilityDeposit.create({
        userId: 'user_123',
        personaId: 'ferni',
        level: 'sacred',
        category: 'past_trauma',
        summary: 'Trauma share',
        content: 'Test content',
      });

      expect(sacredDeposit.isUrgentForFollowUp).toBe(true);
    });

    it('should generate follow-up suggestions', () => {
      const deposit = VulnerabilityDeposit.create({
        userId: 'user_123',
        personaId: 'ferni',
        level: 'vulnerable',
        category: 'health_concern',
        summary: 'Health anxiety',
        content: 'Test content',
      });

      expect(deposit.suggestedFollowUp).toBeTruthy();
      expect(deposit.suggestedFollowUp.length).toBeGreaterThan(0);
    });
  });

  describe('Context Matching', () => {
    it('should match keywords in context', () => {
      const deposit = VulnerabilityDeposit.create({
        userId: 'user_123',
        personaId: 'ferni',
        level: 'vulnerable',
        category: 'personal_struggle',
        summary: 'Work anxiety',
        content: 'I have anxiety about work meetings',
        keywords: ['anxiety', 'work', 'meetings'],
      });

      expect(deposit.matchesContext('talking about work today')).toBe(true);
      expect(deposit.matchesContext(['work', 'projects'])).toBe(true);
      expect(deposit.matchesContext('vacation plans')).toBe(false);
    });
  });

  describe('Serialization', () => {
    it('should round-trip through persistence', () => {
      const deposit = VulnerabilityDeposit.create({
        userId: 'user_123',
        personaId: 'ferni',
        level: 'vulnerable',
        category: 'personal_struggle',
        summary: 'Test summary',
        content: 'Test content',
        isFirstTime: true,
      });

      const persisted = deposit.toPersistence();
      const restored = VulnerabilityDeposit.fromPersistence(persisted);

      expect(restored.id).toBe(deposit.id);
      expect(restored.level).toBe(deposit.level);
      expect(restored.isFirstTime).toBe(deposit.isFirstTime);
    });
  });
});

// ============================================================================
// GROWTH MILESTONE TESTS
// ============================================================================

describe('GrowthMilestone', () => {
  describe('Creation', () => {
    it('should create a milestone with baseline', () => {
      const milestone = GrowthMilestone.create({
        userId: 'user_123',
        area: 'anxiety_management',
        baselineEvidence: {
          timestamp: new Date('2024-01-01'),
          observation: "Couldn't discuss work without panic",
          type: 'baseline',
          confidence: 0.9,
        },
      });

      expect(milestone.id).toBeTruthy();
      expect(milestone.area).toBe('anxiety_management');
      expect(milestone.baselineEvidence.observation).toContain('panic');
    });
  });

  describe('Progress Tracking', () => {
    it('should track progress evidence', () => {
      const milestone = GrowthMilestone.create({
        userId: 'user_123',
        area: 'anxiety_management',
        baselineEvidence: {
          timestamp: new Date('2024-01-01'),
          observation: 'Initial struggle',
          type: 'baseline',
          confidence: 0.9,
        },
      });

      milestone.addProgressEvidence({
        timestamp: new Date(),
        observation: 'Discussed deadline calmly',
        type: 'progress',
        confidence: 0.85,
      });

      expect(milestone.hasProgress).toBe(true);
      expect(milestone.progressEvidence.length).toBe(1);
    });

    it('should update significance with progress', () => {
      const milestone = GrowthMilestone.create({
        userId: 'user_123',
        area: 'anxiety_management',
        baselineEvidence: {
          timestamp: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days ago
          observation: 'Initial struggle',
          type: 'baseline',
          confidence: 0.9,
        },
      });

      milestone.addProgressEvidence({
        timestamp: new Date(),
        observation: 'First improvement',
        type: 'progress',
        confidence: 0.8,
      });

      milestone.addProgressEvidence({
        timestamp: new Date(),
        observation: 'Second improvement',
        type: 'progress',
        confidence: 0.85,
      });

      expect(milestone.significance).toBe('breakthrough');
    });

    it('should generate celebration message', () => {
      const milestone = GrowthMilestone.create({
        userId: 'user_123',
        area: 'confidence',
        baselineEvidence: {
          timestamp: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
          observation: 'Too afraid to speak up',
          type: 'baseline',
          confidence: 0.9,
        },
      });

      milestone.addProgressEvidence({
        timestamp: new Date(),
        observation: 'Led a meeting confidently',
        type: 'progress',
        confidence: 0.9,
      });

      expect(milestone.celebrationMessage).toBeTruthy();
      expect(milestone.celebrationMessage.length).toBeGreaterThan(0);
    });
  });

  describe('Celebration Readiness', () => {
    it('should NOT be ready without progress', () => {
      const milestone = GrowthMilestone.create({
        userId: 'user_123',
        area: 'confidence',
        baselineEvidence: {
          timestamp: new Date(),
          observation: 'Initial state',
          type: 'baseline',
          confidence: 0.9,
        },
      });

      expect(milestone.isReadyToCelebrate).toBe(false);
    });

    it('should NOT be ready before minimum time', () => {
      const milestone = GrowthMilestone.create({
        userId: 'user_123',
        area: 'confidence',
        baselineEvidence: {
          timestamp: new Date(), // Just now
          observation: 'Initial state',
          type: 'baseline',
          confidence: 0.9,
        },
      });

      milestone.addProgressEvidence({
        timestamp: new Date(),
        observation: 'Progress',
        type: 'progress',
        confidence: 0.8,
      });

      expect(milestone.isReadyToCelebrate).toBe(false);
    });

    it('should be ready with progress after minimum time', () => {
      const milestone = GrowthMilestone.create({
        userId: 'user_123',
        area: 'confidence',
        baselineEvidence: {
          timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
          observation: 'Initial state',
          type: 'baseline',
          confidence: 0.9,
        },
      });

      milestone.addProgressEvidence({
        timestamp: new Date(),
        observation: 'Progress',
        type: 'progress',
        confidence: 0.8,
      });

      expect(milestone.isReadyToCelebrate).toBe(true);
    });

    it('should mark as celebrated', () => {
      const milestone = GrowthMilestone.create({
        userId: 'user_123',
        area: 'confidence',
        baselineEvidence: {
          timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          observation: 'Initial state',
          type: 'baseline',
          confidence: 0.9,
        },
      });

      milestone.addProgressEvidence({
        timestamp: new Date(),
        observation: 'Progress',
        type: 'progress',
        confidence: 0.8,
      });

      milestone.markCelebrated();

      expect(milestone.celebrated).toBe(true);
      expect(milestone.celebratedAt).toBeTruthy();
      expect(milestone.isReadyToCelebrate).toBe(false);
    });
  });

  describe('Serialization', () => {
    it('should round-trip through persistence', () => {
      const milestone = GrowthMilestone.create({
        userId: 'user_123',
        area: 'resilience',
        label: 'Handling setbacks',
        baselineEvidence: {
          timestamp: new Date('2024-01-01'),
          observation: 'Would spiral after rejection',
          type: 'baseline',
          confidence: 0.9,
        },
      });

      milestone.addProgressEvidence({
        timestamp: new Date(),
        observation: 'Bounced back quickly',
        type: 'progress',
        confidence: 0.85,
      });

      const persisted = milestone.toPersistence();
      const restored = GrowthMilestone.fromPersistence(persisted);

      expect(restored.id).toBe(milestone.id);
      expect(restored.area).toBe(milestone.area);
      expect(restored.label).toBe(milestone.label);
      expect(restored.progressEvidence.length).toBe(1);
    });
  });
});

// ============================================================================
// PERSONALITY PROFILE (AGGREGATE ROOT) TESTS
// ============================================================================

describe('PersonalityProfile', () => {
  describe('Creation', () => {
    it('should create a new profile', () => {
      const profile = PersonalityProfile.create('user_123', 'ferni');

      expect(profile.userId).toBe('user_123');
      expect(profile.personaId).toBe('ferni');
      expect(profile.relationshipStage).toBe('stranger');
    });
  });

  describe('Emotional State Management', () => {
    it('should update emotional state', () => {
      const profile = PersonalityProfile.create('user_123', 'ferni');
      const newState = EmotionalState.create({
        primary: 'joy',
        granular: 'happy',
        intensity: 0.7,
      });

      profile.updateEmotionalState(newState);

      expect(profile.currentEmotionalState.primary).toBe('joy');
    });

    it('should track emotional history', () => {
      const profile = PersonalityProfile.create('user_123', 'ferni');

      profile.updateEmotionalState(
        EmotionalState.create({ primary: 'joy', intensity: 0.7 })
      );
      profile.updateEmotionalState(
        EmotionalState.create({ primary: 'sadness', intensity: 0.5 })
      );

      expect(profile.emotionalHistory.length).toBe(2);
    });
  });

  describe('Vulnerability Recording', () => {
    it('should record vulnerability', () => {
      const profile = PersonalityProfile.create('user_123', 'ferni');

      profile.recordVulnerability({
        level: 'vulnerable',
        category: 'personal_struggle',
        summary: 'Shared anxiety',
        content: 'Test content',
      });

      expect(profile.vulnerabilityDeposits.length).toBe(1);
    });

    it('should update relationship depth with vulnerability', () => {
      const profile = PersonalityProfile.create('user_123', 'ferni');
      const initialScore = profile.relationshipDepth.vulnerabilityScore;

      profile.recordVulnerability({
        level: 'vulnerable',
        category: 'personal_struggle',
        summary: 'Shared anxiety',
        content: 'Test content',
      });

      expect(profile.relationshipDepth.vulnerabilityScore).toBeGreaterThan(initialScore);
    });

    it('should emit domain event for first-time vulnerability', () => {
      const profile = PersonalityProfile.create('user_123', 'ferni');

      profile.recordVulnerability({
        level: 'sacred',
        category: 'past_trauma',
        summary: 'Shared trauma',
        content: 'Test content',
        isFirstTime: true,
      });

      const events = profile.domainEvents;
      const firstTimeEvent = events.find((e) => e.type === 'first_time_vulnerability');

      expect(firstTimeEvent).toBeDefined();
    });
  });

  describe('Pattern Recording', () => {
    it('should record pattern evidence', () => {
      const profile = PersonalityProfile.create('user_123', 'ferni');

      profile.recordPatternEvidence(
        'topic_emotion',
        'work → stress',
        ['work', 'job'],
        {
          timestamp: new Date(),
          context: 'User stressed about work',
          emotion: 'fear',
          granular: 'anxious',
          intensity: 0.7,
          topics: ['work'],
        }
      );

      expect(profile.emotionalPatterns.length).toBe(1);
    });
  });

  describe('Growth Tracking', () => {
    it('should record growth evidence', () => {
      const profile = PersonalityProfile.create('user_123', 'ferni');

      profile.recordGrowthEvidence('confidence', {
        timestamp: new Date(),
        observation: 'Initial state',
        type: 'baseline',
        confidence: 0.9,
      });

      expect(profile.growthMilestones.length).toBe(1);
    });

    it('should add progress to existing milestone', () => {
      const profile = PersonalityProfile.create('user_123', 'ferni');

      // Baseline
      profile.recordGrowthEvidence('confidence', {
        timestamp: new Date(),
        observation: 'Initial state',
        type: 'baseline',
        confidence: 0.9,
      });

      // Progress
      profile.recordGrowthEvidence('confidence', {
        timestamp: new Date(),
        observation: 'Improvement',
        type: 'progress',
        confidence: 0.85,
      });

      expect(profile.growthMilestones.length).toBe(1);
      const milestone = profile.growthMilestones[0];
      expect(milestone?.progressEvidence.length).toBe(1);
    });
  });

  describe('Anticipation (SUPERHUMAN)', () => {
    it('should anticipate emotion from context', () => {
      const profile = PersonalityProfile.create('user_123', 'ferni');

      const anticipated = profile.anticipateEmotion({
        partialTranscript: "I've been thinking about...",
        voiceTone: 'falling',
      });

      expect(anticipated).not.toBeNull();
    });

    it('should use historical patterns for anticipation', () => {
      const profile = PersonalityProfile.create('user_123', 'ferni');

      // Record pattern evidence multiple times to confirm pattern
      for (let i = 0; i < 3; i++) {
        profile.recordPatternEvidence(
          'topic_emotion',
          'work → anxiety',
          ['work', 'job'],
          {
            timestamp: new Date(),
            context: `Work stress ${i}`,
            emotion: 'fear',
            granular: 'anxious',
            intensity: 0.7,
            topics: ['work'],
          }
        );
      }

      const anticipated = profile.anticipateEmotion({
        topics: ['work', 'deadline'],
      });

      expect(anticipated?.emotion).toBe('fear');
    });
  });

  describe('Sharing Decisions', () => {
    it('should allow sharing for appropriate depth', () => {
      const profile = PersonalityProfile.create('user_123', 'ferni');

      // Build up relationship
      profile.recordVulnerability({
        level: 'vulnerable',
        category: 'personal_struggle',
        summary: 'Test',
        content: 'Test content',
      });
      profile.recordVulnerability({
        level: 'vulnerable',
        category: 'personal_struggle',
        summary: 'Test 2',
        content: 'Test content',
      });

      expect(profile.canShareAtDepth('medium')).toBe(true);
    });

    it('should NOT allow deep sharing during crisis', () => {
      const profile = PersonalityProfile.create('user_123', 'ferni');

      profile.updateEmotionalState(
        EmotionalState.create({
          primary: 'sadness',
          granular: 'devastated',
          intensity: 0.95,
        })
      );

      expect(profile.canShareAtDepth('deep')).toBe(false);
    });
  });

  describe('Domain Events', () => {
    it('should collect and clear domain events', () => {
      const profile = PersonalityProfile.create('user_123', 'ferni');

      profile.recordVulnerability({
        level: 'vulnerable',
        category: 'personal_struggle',
        summary: 'Test',
        content: 'Test content',
      });

      const events = profile.domainEvents;
      expect(events.length).toBeGreaterThan(0);

      profile.clearDomainEvents();
      expect(profile.domainEvents.length).toBe(0);
    });
  });

  describe('Serialization', () => {
    it('should round-trip through persistence', () => {
      const profile = PersonalityProfile.create('user_123', 'ferni');

      profile.recordVulnerability({
        level: 'vulnerable',
        category: 'personal_struggle',
        summary: 'Test',
        content: 'Test content',
      });

      profile.updateEmotionalState(
        EmotionalState.create({ primary: 'joy', intensity: 0.6 })
      );

      const persisted = profile.toPersistence();
      const restored = PersonalityProfile.fromPersistence(persisted);

      expect(restored.userId).toBe(profile.userId);
      expect(restored.personaId).toBe(profile.personaId);
      expect(restored.relationshipStage).toBe(profile.relationshipStage);
    });
  });
});
