/**
 * Firestore E2E Tests for Personality v2
 *
 * These tests run against the Firestore emulator to validate
 * actual database operations.
 *
 * Run with:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm vitest run src/tests/personality/v2/firestore-e2e.test.ts
 *
 * Or start emulator first:
 *   firebase emulators:start --only firestore
 *
 * @module tests/personality/v2/firestore-e2e
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// Skip if emulator not running
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const skipIfNoEmulator = !EMULATOR_HOST ? describe.skip : describe;

skipIfNoEmulator('Personality v2 Firestore E2E', () => {
  // Dynamic imports to avoid loading Firestore when not needed
  let FirestorePersonalityRepository: typeof import('../../../personality/infrastructure/firestore-personality-repository.js').FirestorePersonalityRepository;
  let PersonalityProfile: typeof import('../../../personality/domain/model/personality-profile.js').PersonalityProfile;
  let EmotionalPattern: typeof import('../../../personality/domain/model/emotional-pattern.js').EmotionalPattern;
  let VulnerabilityDeposit: typeof import('../../../personality/domain/model/vulnerability-deposit.js').VulnerabilityDeposit;
  let GrowthMilestone: typeof import('../../../personality/domain/model/growth-milestone.js').GrowthMilestone;
  let EmotionalState: typeof import('../../../personality/domain/model/value-objects/emotional-state.js').EmotionalState;
  let repository: InstanceType<typeof FirestorePersonalityRepository>;

  const testUserId = `test_user_${Date.now()}`;
  const testPersonaId = 'ferni';

  beforeAll(async () => {
    // Import modules
    const repoModule = await import('../../../personality/infrastructure/firestore-personality-repository.js');
    const profileModule = await import('../../../personality/domain/model/personality-profile.js');
    const patternModule = await import('../../../personality/domain/model/emotional-pattern.js');
    const vulnModule = await import('../../../personality/domain/model/vulnerability-deposit.js');
    const milestoneModule = await import('../../../personality/domain/model/growth-milestone.js');
    const stateModule = await import('../../../personality/domain/model/value-objects/emotional-state.js');

    FirestorePersonalityRepository = repoModule.FirestorePersonalityRepository;
    PersonalityProfile = profileModule.PersonalityProfile;
    EmotionalPattern = patternModule.EmotionalPattern;
    VulnerabilityDeposit = vulnModule.VulnerabilityDeposit;
    GrowthMilestone = milestoneModule.GrowthMilestone;
    EmotionalState = stateModule.EmotionalState;

    repository = new FirestorePersonalityRepository();
  });

  afterAll(async () => {
    // Cleanup test data
    await repository.deleteProfile(testUserId, testPersonaId);
  });

  beforeEach(async () => {
    // Clean slate for each test
    await repository.deleteProfile(testUserId, testPersonaId);
  });

  describe('Profile Operations', () => {
    it('should create and load a profile', async () => {
      // Create
      const profile = PersonalityProfile.create(testUserId, testPersonaId);
      await repository.saveProfile(profile);

      // Load
      const loaded = await repository.loadProfile(testUserId, testPersonaId);

      expect(loaded).not.toBeNull();
      expect(loaded?.userId).toBe(testUserId);
      expect(loaded?.personaId).toBe(testPersonaId);
    });

    it('should return null for non-existent profile', async () => {
      const loaded = await repository.loadProfile('nonexistent', 'ferni');
      expect(loaded).toBeNull();
    });

    it('should update existing profile', async () => {
      // Create
      const profile = PersonalityProfile.create(testUserId, testPersonaId);
      await repository.saveProfile(profile);

      // Update
      const state = EmotionalState.create({
        primary: 'joy',
        granular: 'happy',
        intensity: 0.8,
        confidence: 0.9,
      });
      profile.updateEmotionalState(state);
      profile.recordTrustSignal(5);
      await repository.saveProfile(profile);

      // Reload
      const loaded = await repository.loadProfile(testUserId, testPersonaId);
      expect(loaded?.currentEmotionalState.primary).toBe('joy');
    });

    it('should check profile existence', async () => {
      expect(await repository.profileExists(testUserId, testPersonaId)).toBe(false);

      const profile = PersonalityProfile.create(testUserId, testPersonaId);
      await repository.saveProfile(profile);

      expect(await repository.profileExists(testUserId, testPersonaId)).toBe(true);
    });

    it('should delete profile', async () => {
      const profile = PersonalityProfile.create(testUserId, testPersonaId);
      await repository.saveProfile(profile);

      expect(await repository.profileExists(testUserId, testPersonaId)).toBe(true);

      await repository.deleteProfile(testUserId, testPersonaId);

      expect(await repository.profileExists(testUserId, testPersonaId)).toBe(false);
    });
  });

  describe('Pattern Operations', () => {
    it('should save and load patterns', async () => {
      const pattern = EmotionalPattern.create({
        userId: testUserId,
        patternType: 'topic_emotion',
        description: 'Work stress pattern',
        triggers: ['work', 'deadline'],
        predictedEmotion: 'fear',
        confidence: 0.7,
      });

      await repository.savePattern(pattern);

      const patterns = await repository.loadPatterns(testUserId);
      expect(patterns.length).toBe(1);
      expect(patterns[0].description).toBe('Work stress pattern');
    });

    it('should filter patterns by options', async () => {
      // Create patterns with different confidence levels
      const highConf = EmotionalPattern.create({
        userId: testUserId,
        patternType: 'topic_emotion',
        description: 'High confidence pattern',
        triggers: ['test'],
        predictedEmotion: 'joy',
        confidence: 0.9,
      });
      const lowConf = EmotionalPattern.create({
        userId: testUserId,
        patternType: 'temporal',
        description: 'Low confidence pattern',
        triggers: ['test'],
        predictedEmotion: 'sadness',
        confidence: 0.3,
      });

      await repository.savePatterns([highConf, lowConf]);

      // Filter by confidence
      const highConfPatterns = await repository.loadPatterns(testUserId, {
        minConfidence: 0.7,
      });
      expect(highConfPatterns.length).toBe(1);
      expect(highConfPatterns[0].confidence).toBeGreaterThanOrEqual(0.7);

      // Filter by type
      const temporalPatterns = await repository.loadPatterns(testUserId, {
        types: ['temporal'],
      });
      expect(temporalPatterns.length).toBe(1);
      expect(temporalPatterns[0].patternType).toBe('temporal');
    });

    it('should find matching patterns by context', async () => {
      const pattern = EmotionalPattern.create({
        userId: testUserId,
        patternType: 'topic_emotion',
        description: 'Work triggers anxiety',
        triggers: ['work', 'office', 'meeting'],
        predictedEmotion: 'fear',
        confidence: 0.8,
      });

      await repository.savePattern(pattern);

      const matched = await repository.findMatchingPatterns(testUserId, {
        topics: ['meeting', 'presentation'],
      });

      expect(matched.length).toBe(1);
    });
  });

  describe('Vulnerability Operations', () => {
    it('should save and load vulnerabilities', async () => {
      const vuln = VulnerabilityDeposit.create({
        userId: testUserId,
        level: 'vulnerable',
        category: 'personal_struggle',
        summary: 'Shared about anxiety',
        content: 'I struggle with anxiety before meetings',
        keywords: ['anxiety', 'meetings'],
      });

      await repository.saveVulnerability(vuln);

      const vulns = await repository.loadVulnerabilities(testUserId);
      expect(vulns.length).toBe(1);
      expect(vulns[0].summary).toBe('Shared about anxiety');
    });

    it('should filter open vulnerabilities', async () => {
      const open = VulnerabilityDeposit.create({
        userId: testUserId,
        level: 'personal',
        category: 'relationship_issue',
        summary: 'Open vulnerability',
        content: 'Still processing this',
        keywords: ['relationship'],
      });
      const closed = VulnerabilityDeposit.create({
        userId: testUserId,
        level: 'personal',
        category: 'career_fear',
        summary: 'Closed vulnerability',
        content: 'Already resolved',
        keywords: ['career'],
      });
      closed.close('Resolution achieved');

      await repository.saveVulnerability(open);
      await repository.saveVulnerability(closed);

      const openOnly = await repository.loadVulnerabilities(testUserId, { openOnly: true });
      expect(openOnly.length).toBe(1);
      expect(openOnly[0].isOpen).toBe(true);
    });

    it('should find vulnerabilities needing follow-up', async () => {
      const needsFollowUp = VulnerabilityDeposit.create({
        userId: testUserId,
        level: 'vulnerable',
        category: 'grief_loss',
        summary: 'Recent loss',
        content: 'Lost my grandmother last week',
        keywords: ['loss', 'grief'],
      });

      await repository.saveVulnerability(needsFollowUp);

      const pending = await repository.loadVulnerabilities(testUserId, {
        needsFollowUpOnly: true,
      });

      // Newly created vulnerabilities need follow-up
      expect(pending.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Milestone Operations', () => {
    it('should save and load milestones', async () => {
      const milestone = GrowthMilestone.create({
        userId: testUserId,
        area: 'emotional_awareness',
        description: 'User now identifies emotions',
        baseline: 'Could not name feelings',
        significanceLevel: 'notable',
        evidence: [
          {
            timestamp: new Date(),
            observation: 'Named three emotions accurately',
            context: 'During discussion about work',
          },
        ],
      });

      await repository.saveMilestone(milestone);

      const milestones = await repository.loadMilestones(testUserId);
      expect(milestones.length).toBe(1);
      expect(milestones[0].area).toBe('emotional_awareness');
    });

    it('should filter uncelebrated milestones', async () => {
      const uncelebrated = GrowthMilestone.create({
        userId: testUserId,
        area: 'relationship_health',
        description: 'Better boundaries',
        baseline: 'Always said yes',
        significanceLevel: 'notable',
        evidence: [{
          timestamp: new Date(),
          observation: 'Said no to request',
          context: 'Work context',
        }],
      });

      const celebrated = GrowthMilestone.create({
        userId: testUserId,
        area: 'anxiety_management',
        description: 'Less panic attacks',
        baseline: 'Daily panic',
        significanceLevel: 'significant',
        evidence: [{
          timestamp: new Date(),
          observation: 'Week without panic',
          context: 'General',
        }],
      });
      celebrated.markCelebrated();

      await repository.saveMilestone(uncelebrated);
      await repository.saveMilestone(celebrated);

      const uncelebratedOnly = await repository.loadMilestones(testUserId, {
        uncelebratedOnly: true,
      });
      expect(uncelebratedOnly.length).toBe(1);
      expect(uncelebratedOnly[0].celebrated).toBe(false);
    });

    it('should find milestone by area', async () => {
      const milestone = GrowthMilestone.create({
        userId: testUserId,
        area: 'self_compassion',
        description: 'More self-kindness',
        baseline: 'Very self-critical',
        significanceLevel: 'notable',
        evidence: [{
          timestamp: new Date(),
          observation: 'Showed self-compassion',
          context: 'After mistake',
        }],
      });

      await repository.saveMilestone(milestone);

      const found = await repository.findMilestoneByArea(testUserId, 'self_compassion');
      expect(found).not.toBeNull();
      expect(found?.area).toBe('self_compassion');
    });
  });

  describe('Profile with Related Data', () => {
    it('should load profile with patterns, vulnerabilities, and milestones', async () => {
      // Create profile
      const profile = PersonalityProfile.create(testUserId, testPersonaId);
      await repository.saveProfile(profile);

      // Create related data
      const pattern = EmotionalPattern.create({
        userId: testUserId,
        patternType: 'topic_emotion',
        description: 'Test pattern',
        triggers: ['test'],
        predictedEmotion: 'joy',
        confidence: 0.8,
      });
      await repository.savePattern(pattern);

      const vuln = VulnerabilityDeposit.create({
        userId: testUserId,
        level: 'personal',
        category: 'personal_struggle',
        summary: 'Test vuln',
        content: 'Test content',
        keywords: ['test'],
      });
      await repository.saveVulnerability(vuln);

      const milestone = GrowthMilestone.create({
        userId: testUserId,
        area: 'communication_skills',
        description: 'Test milestone',
        baseline: 'Test baseline',
        significanceLevel: 'notable',
        evidence: [{
          timestamp: new Date(),
          observation: 'Test',
          context: 'Test',
        }],
      });
      await repository.saveMilestone(milestone);

      // Load with all related data
      const loaded = await repository.loadProfile(testUserId, testPersonaId, {
        withPatterns: true,
        withVulnerabilities: true,
        withMilestones: true,
      });

      expect(loaded).not.toBeNull();
      expect(loaded?.emotionalPatterns.length).toBeGreaterThanOrEqual(1);
      expect(loaded?.vulnerabilityDeposits.length).toBeGreaterThanOrEqual(1);
      expect(loaded?.growthMilestones.length).toBeGreaterThanOrEqual(1);
    });

    it('should save profile with all related data', async () => {
      // Create profile with embedded data
      const profile = PersonalityProfile.create(testUserId, testPersonaId);

      // Add pattern evidence
      profile.recordPatternEvidence(
        'topic_emotion',
        'Work → anxiety',
        ['work'],
        {
          timestamp: new Date(),
          context: 'Discussion about deadlines',
          emotion: 'fear',
          intensity: 0.7,
          topics: ['work', 'deadlines'],
        }
      );

      // Add vulnerability
      profile.recordVulnerability({
        level: 'personal',
        category: 'career_fear',
        summary: 'Fear of failure at work',
        content: 'I worry about not being good enough',
        keywords: ['work', 'failure', 'fear'],
        isFirstTime: false,
        firstTimeMarkers: [],
        acknowledgment: 'That sounds really hard',
      });

      // Save with related data
      await repository.saveProfileWithRelated(profile, {
        patterns: [...profile.emotionalPatterns],
        vulnerabilities: [...profile.vulnerabilityDeposits],
        milestones: [...profile.growthMilestones],
      });

      // Load with all related
      const { profile: loaded, patterns, vulnerabilities, milestones } =
        await repository.loadProfileWithRelated(testUserId, testPersonaId);

      expect(loaded).not.toBeNull();
      expect(patterns.length).toBeGreaterThanOrEqual(1);
      expect(vulnerabilities.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent reads', async () => {
      const profile = PersonalityProfile.create(testUserId, testPersonaId);
      await repository.saveProfile(profile);

      // Multiple concurrent reads
      const reads = await Promise.all([
        repository.loadProfile(testUserId, testPersonaId),
        repository.loadProfile(testUserId, testPersonaId),
        repository.loadProfile(testUserId, testPersonaId),
      ]);

      expect(reads.every((r) => r !== null)).toBe(true);
    });

    it('should handle rapid updates', async () => {
      const profile = PersonalityProfile.create(testUserId, testPersonaId);

      // Rapid save/load cycles
      for (let i = 0; i < 5; i++) {
        profile.recordTrustSignal(1);
        await repository.saveProfile(profile);
      }

      const loaded = await repository.loadProfile(testUserId, testPersonaId);
      expect(loaded).not.toBeNull();
    });
  });
});
