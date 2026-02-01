/**
 * Family Check-in System Tests
 *
 * Tests for the proactive family check-in feature including:
 * - Schedule creation and management
 * - Call record tracking
 * - Context building
 * - Summary analysis
 *
 * @module services/family/__tests__/family-checkin
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Firestore
vi.mock('../../firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null), // Start with no DB for unit tests
}));

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

// Mock llm-utils to avoid actual LLM calls - force heuristic fallback
// Path is relative from project root for vi.mock
vi.mock('../../llm-utils.js', () => ({
  callLLM: vi.fn(() => Promise.resolve(null)), // Return null to trigger heuristic fallback
}));

// Import after mocks
import {
  analyzeCheckinCall,
  generateUrgentNotification,
  type TranscriptMessage,
} from '../family-checkin-summary.js';

import type { FamilyCheckinSchedule, CheckinCallRecord } from '../proactive-family-checkin.js';

// ============================================================================
// SUMMARY ANALYSIS TESTS
// ============================================================================

describe('Family Check-in Summary', () => {
  describe('analyzeCheckinCall', () => {
    it('should detect happy mood from positive transcript', async () => {
      const transcript: TranscriptMessage[] = [
        { role: 'ferni', content: 'Good morning! How are you doing today?' },
        {
          role: 'family_member',
          content: "I'm doing great! Had a wonderful time at the garden club.",
        },
        { role: 'ferni', content: 'That sounds lovely! Tell me more about it.' },
        {
          role: 'family_member',
          content:
            'Oh it was fantastic! We planted some beautiful roses and I won the flower arrangement contest!',
        },
      ];

      const result = await analyzeCheckinCall(transcript, 'Mom', 'Seth', 'mother');

      expect(result).toBeDefined();
      expect(result.mood).toBe('happy');
      expect(result.moodConfidence).toBeGreaterThan(0);
      expect(result.topics).toContain('Gardening');
      expect(result.positives.length).toBeGreaterThan(0);
    });

    it('should detect tired mood from low-energy transcript', async () => {
      const transcript: TranscriptMessage[] = [
        { role: 'ferni', content: 'Good afternoon! How are you feeling?' },
        { role: 'family_member', content: "I'm so tired. Didn't sleep well last night." },
        { role: 'ferni', content: "I'm sorry to hear that. Is everything okay?" },
        { role: 'family_member', content: "Just feeling exhausted. It's been a long week." },
      ];

      const result = await analyzeCheckinCall(transcript, 'Dad', 'Seth', 'father');

      expect(result).toBeDefined();
      expect(result.mood).toBe('tired');
    });

    it('should detect worried mood and flag concerns', async () => {
      const transcript: TranscriptMessage[] = [
        { role: 'ferni', content: 'Hello! How are things going?' },
        {
          role: 'family_member',
          content: "I'm worried about my health. I've been feeling dizzy lately.",
        },
        { role: 'ferni', content: 'That sounds concerning. Have you seen a doctor?' },
        { role: 'family_member', content: "Not yet, but I probably should. I'm a bit scared." },
      ];

      const result = await analyzeCheckinCall(transcript, 'Grandma', 'Seth', 'grandmother');

      expect(result).toBeDefined();
      expect(['worried', 'unwell']).toContain(result.mood);
      expect(result.concerns.length).toBeGreaterThan(0);
      expect(result.concerns[0].urgency).toBe('medium');
      expect(result.concerns[0].category).toBe('health');
    });

    it('should flag urgent concerns for falls', async () => {
      const transcript: TranscriptMessage[] = [
        { role: 'ferni', content: 'How are you today?' },
        { role: 'family_member', content: 'I fell yesterday but I think I am okay now.' },
      ];

      const result = await analyzeCheckinCall(transcript, 'Mom', 'Seth', 'mother');

      expect(result.concerns.length).toBeGreaterThan(0);
      const fallConcern = result.concerns.find((c) => c.description.toLowerCase().includes('fall'));
      expect(fallConcern).toBeDefined();
      expect(fallConcern?.urgency).toBe('high');
    });

    it('should extract topics from conversation', async () => {
      const transcript: TranscriptMessage[] = [
        { role: 'ferni', content: 'What have you been up to?' },
        {
          role: 'family_member',
          content: 'I went to church on Sunday and cooked a nice dinner. Then watched some TV.',
        },
      ];

      const result = await analyzeCheckinCall(transcript, 'Mom', 'Seth', 'mother');

      expect(result.topics.length).toBeGreaterThan(0);
      expect(result.topics).toEqual(expect.arrayContaining(['Church', 'Cooking', 'TV/Movies']));
    });

    it('should return content or neutral mood for sparse conversation', async () => {
      const transcript: TranscriptMessage[] = [
        { role: 'ferni', content: 'How are you?' },
        { role: 'family_member', content: 'Okay.' },
        { role: 'ferni', content: 'Anything new?' },
        { role: 'family_member', content: 'Not really.' },
      ];

      const result = await analyzeCheckinCall(transcript, 'Dad', 'Seth', 'father');

      // "Okay" matches content words in heuristic - either is acceptable for sparse conversation
      expect(['neutral', 'content']).toContain(result.mood);
      expect(result.concerns).toEqual([]);
    });
  });

  describe('generateUrgentNotification', () => {
    it('should generate notification for urgent concerns', () => {
      const record: CheckinCallRecord = {
        id: 'call-123',
        scheduleId: 'schedule-456',
        sponsorUserId: 'user-789',
        sponsoredIdentityId: 'identity-001',
        familyMemberName: 'Mom',
        callStartedAt: new Date().toISOString(),
        callEndedAt: new Date().toISOString(),
        status: 'completed',
        concernsIdentified: [
          {
            description: 'mentioned chest pain',
            urgency: 'urgent',
            category: 'health',
            recommendedAction: 'Seek immediate medical attention',
          },
        ],
        sponsorBriefed: false,
      };

      const notification = generateUrgentNotification(record);

      expect(notification).not.toBeNull();
      expect(notification).toContain('Mom');
      expect(notification).toContain('chest pain');
    });

    it('should return null for low-priority concerns', () => {
      const record: CheckinCallRecord = {
        id: 'call-123',
        scheduleId: 'schedule-456',
        sponsorUserId: 'user-789',
        sponsoredIdentityId: 'identity-002',
        familyMemberName: 'Dad',
        callStartedAt: new Date().toISOString(),
        callEndedAt: new Date().toISOString(),
        status: 'completed',
        concernsIdentified: [
          {
            description: 'seemed a bit tired',
            urgency: 'low',
            category: 'emotional',
          },
        ],
        sponsorBriefed: false,
      };

      const notification = generateUrgentNotification(record);

      expect(notification).toBeNull();
    });

    it('should return null when no concerns', () => {
      const record: CheckinCallRecord = {
        id: 'call-123',
        scheduleId: 'schedule-456',
        sponsorUserId: 'user-789',
        sponsoredIdentityId: 'identity-003',
        familyMemberName: 'Grandma',
        callStartedAt: new Date().toISOString(),
        callEndedAt: new Date().toISOString(),
        status: 'completed',
        concernsIdentified: [],
        sponsorBriefed: false,
      };

      const notification = generateUrgentNotification(record);

      expect(notification).toBeNull();
    });
  });
});

// ============================================================================
// CONTEXT BUILDER TESTS
// ============================================================================

describe('Family Wellbeing Context Builder', () => {
  it('should be importable', async () => {
    const { buildFamilyCheckinContext, generateFamilyCheckinSystemPrompt } =
      await import('../../../intelligence/context-builders/family/family-wellbeing-context.js');

    expect(buildFamilyCheckinContext).toBeDefined();
    expect(typeof buildFamilyCheckinContext).toBe('function');
    expect(generateFamilyCheckinSystemPrompt).toBeDefined();
    expect(typeof generateFamilyCheckinSystemPrompt).toBe('function');
  });

  it('should generate appropriate system prompt', async () => {
    const { generateFamilyCheckinSystemPrompt } =
      await import('../../../intelligence/context-builders/family/family-wellbeing-context.js');

    const context = {
      schedule: {
        id: 'schedule-123',
        sponsorUserId: 'user-456',
        sponsoredIdentityId: 'identity-789',
        familyMemberName: 'Mom',
        relationship: 'mother',
        phoneNumber: '+1234567890',
        frequency: 'weekly' as const,
        preferredTime: '14:00',
        timezone: 'America/New_York',
        isActive: true,
        maxDurationMinutes: 15,
        leaveVoicemailIfNoAnswer: true,
        nextScheduledCall: new Date().toISOString(),
        totalCallsMade: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      identity: {
        id: 'identity-789',
        sponsorUserId: 'user-456',
        familyUserId: 'family_identity-789',
        displayName: 'Margaret',
        preferredName: 'Mom',
        relationship: 'mother' as const,
        phoneNumber: '+1234567890',
        voiceEnrolled: false,
        accessLevel: 'full' as const,
        allowedPersonas: ['*'],
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        totalCalls: 0,
        totalMinutes: 0,
      },
      recentCalls: [],
      suggestedTopics: ['How they slept last night', 'Weather'],
      recentEvents: [],
      healthQuestions: ['How are you feeling today?'],
      openingLine: 'Good morning, Mom!',
      sponsorName: 'Seth',
      sponsorRelationship: 'your son Seth',
    };

    const prompt = generateFamilyCheckinSystemPrompt(context);

    expect(prompt).toContain('Ferni');
    expect(prompt).toContain('Mom');
    expect(prompt).toContain('Seth');
    expect(prompt).toContain('FIRST call');
    expect(prompt).toContain('CONVERSATION GOALS');
    expect(prompt).toContain('CALL STRUCTURE');
  });
});

// ============================================================================
// HELPER FUNCTION TESTS
// ============================================================================

describe('Helper Functions', () => {
  it('should export getSponsorRelationshipTerm', async () => {
    const { getSponsorRelationshipTerm } =
      await import('../../../intelligence/context-builders/family/family-wellbeing-context.js');

    expect(getSponsorRelationshipTerm('mother', 'Seth')).toBe('your son Seth');
    expect(getSponsorRelationshipTerm('grandmother', 'Seth')).toBe('your grandchild Seth');
    expect(getSponsorRelationshipTerm('spouse', 'Sarah')).toBe('your partner Sarah');
    expect(getSponsorRelationshipTerm('unknown', 'Alex')).toBe('Alex');
  });

  it('should export generateHealthQuestions', async () => {
    const { generateHealthQuestions } =
      await import('../../../intelligence/context-builders/family/family-wellbeing-context.js');

    const schedule = {
      healthConcerns: ['arthritis', 'blood pressure'],
    };

    const knowledge = {
      healthConditions: ['diabetes'],
    };

    const questions = generateHealthQuestions(schedule as any, knowledge as any);

    expect(questions.length).toBeGreaterThan(0);
    expect(questions).toContain('How are you feeling today?');
    expect(questions.some((q) => q.toLowerCase().includes('arthritis'))).toBe(true);
  });
});

// ============================================================================
// FAMILY CHECKIN CALLER TESTS
// ============================================================================

describe('Family Check-in Caller', () => {
  it('should be importable', async () => {
    const { runFamilyCheckinJob, initiateCheckinCall, handleCheckinCallComplete } =
      await import('../family-checkin-caller.js');

    expect(runFamilyCheckinJob).toBeDefined();
    expect(typeof runFamilyCheckinJob).toBe('function');
    expect(initiateCheckinCall).toBeDefined();
    expect(typeof initiateCheckinCall).toBe('function');
    expect(handleCheckinCallComplete).toBeDefined();
    expect(typeof handleCheckinCallComplete).toBe('function');
  });

  describe('FamilyCheckinJobResult type', () => {
    it('should return correct result structure from runFamilyCheckinJob', async () => {
      const { runFamilyCheckinJob } = await import('../family-checkin-caller.js');

      // Run job (will return empty results since no schedules are due)
      const result = await runFamilyCheckinJob();

      // Verify result has all expected fields
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('totalDue');
      expect(result).toHaveProperty('schedulesProcessed');
      expect(result).toHaveProperty('callsInitiated');
      expect(result).toHaveProperty('callsSucceeded');
      expect(result).toHaveProperty('callsFailed');
      expect(result).toHaveProperty('callsSkipped');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('durationMs');

      // Type checks
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.totalDue).toBe('number');
      expect(typeof result.schedulesProcessed).toBe('number');
      expect(typeof result.callsInitiated).toBe('number');
      expect(typeof result.durationMs).toBe('number');
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('initiateCheckinCall', () => {
    it('should return failure for invalid sponsored identity', async () => {
      const { initiateCheckinCall } = await import('../family-checkin-caller.js');

      const mockSchedule = {
        id: 'schedule-test-123',
        sponsorUserId: 'user-test-456',
        sponsoredIdentityId: 'nonexistent-identity',
        familyMemberName: 'Test Mom',
        relationship: 'mother',
        phoneNumber: '+1234567890',
        frequency: 'weekly' as const,
        preferredTime: '14:00',
        timezone: 'America/New_York',
        isActive: true,
        maxDurationMinutes: 15,
        leaveVoicemailIfNoAnswer: true,
        nextScheduledCall: new Date().toISOString(),
        totalCallsMade: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await initiateCheckinCall(mockSchedule);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('default export', () => {
    it('should export familyCheckinCaller object with all methods', async () => {
      const { default: familyCheckinCaller } = await import('../family-checkin-caller.js');

      expect(familyCheckinCaller).toBeDefined();
      expect(familyCheckinCaller.runJob).toBeDefined();
      expect(familyCheckinCaller.initiateCall).toBeDefined();
      expect(familyCheckinCaller.handleComplete).toBeDefined();
    });
  });
});
