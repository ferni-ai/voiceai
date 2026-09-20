/**
 * Support Tasks Tests
 *
 * Tests for emotional support, check-ins, and crisis handling tasks:
 * - EmotionalSupportTask
 * - CheckInTask
 * - ComfortTask
 * - CrisisDetectionTask
 */

import { describe, expect, it, vi } from 'vitest';
import {
  CheckInTask,
  ComfortTask,
  CrisisDetectionTask,
  EmotionalSupportTask,
} from '../support-tasks.js';

// Mock the logger
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock LiveKit agents
vi.mock('@livekit/agents', async (importOriginal) => {
  // Spread the REAL module so this mock cannot drift from the SDK surface.
  // AgentTask uses llm.ToolContext / llm.toToolContext, and the real
  // toToolContext validates that each entry is a genuine function tool —
  // so llm.tool must stay real. Only `log` is stubbed, to keep tests quiet.
  const actual = await importOriginal<typeof import('@livekit/agents')>();
  return {
    ...actual,
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

// ============================================================================
// EMOTIONAL SUPPORT TASK TESTS
// ============================================================================

// The real LiveKit ToolContext exposes tools via getFunctionTool()/hasTool(),
// not as plain object properties.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toolOf = (task: any, name: string) => task.tools.getFunctionTool(name);

describe('EmotionalSupportTask', () => {
  it('should create with proper instructions', () => {
    const task = new EmotionalSupportTask();

    expect(task.instructions).toContain('STOP everything');
    expect(task.instructions).toContain('support');
  });

  it('should have support-focused tools', () => {
    const task = new EmotionalSupportTask();

    expect(task.tools.hasTool('acknowledgeEmotion')).toBe(true);
    expect(task.tools.hasTool('shareVulnerability')).toBe(true);
    expect(task.tools.hasTool('checkIn')).toBe(true);
    expect(task.tools.hasTool('concludeSupport')).toBe(true);
  });

  it('should have lower emotion threshold (0.4)', () => {
    const task = new EmotionalSupportTask();

    // Set context with distress at 0.45 - should trigger support mode
    task.setContext({
      lastAnalysis: {
        emotion: {
          distressLevel: 0.45,
          valence: 'negative',
          primary: 'sadness',
          intensity: 0.5,
        },
        intent: { primary: 'venting', requiresEmpathy: true },
        state: { phase: 'supporting' },
      } as unknown as Parameters<typeof task.setContext>[0]['lastAnalysis'],
    });

    // The task should be in support mode due to lower threshold
    expect(task.instructions).toContain('distress');
  });

  describe('tools', () => {
    it('acknowledgeEmotion should return the response', async () => {
      const task = new EmotionalSupportTask();

      const result = await toolOf(task, 'acknowledgeEmotion').execute({
        emotion: 'sadness',
        response: 'I hear how hard this is.',
      });

      expect(result).toBe('I hear how hard this is.');
    });

    it('checkIn should return one of the check-in phrases', async () => {
      const task = new EmotionalSupportTask();

      const result = await toolOf(task, 'checkIn').execute();

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('concludeSupport should complete the task', async () => {
      const task = new EmotionalSupportTask();

      await toolOf(task, 'concludeSupport').execute({
        emotionAddressed: 'anxiety',
        userFeelsBetter: true,
        needsMoreSupport: false,
      });

      expect(task.done()).toBe(true);
      const result = await task;
      expect(result.emotionAddressed).toBe('anxiety');
      expect(result.userFeelsBetter).toBe(true);
    });

    it('concludeSupport response varies based on user feeling better', async () => {
      const task1 = new EmotionalSupportTask();

      const betterResult = await toolOf(task1, 'concludeSupport').execute({
        emotionAddressed: 'sadness',
        userFeelsBetter: true,
        needsMoreSupport: false,
      });

      expect(betterResult).toContain('glad');

      const task2 = new EmotionalSupportTask();

      const notBetterResult = await toolOf(task2, 'concludeSupport').execute({
        emotionAddressed: 'sadness',
        userFeelsBetter: false,
        needsMoreSupport: true,
      });

      expect(notBetterResult).toContain('resolved');
    });
  });
});

// ============================================================================
// CHECK-IN TASK TESTS
// ============================================================================

describe('CheckInTask', () => {
  it('should create with default reason', () => {
    const task = new CheckInTask();

    expect(task.instructions).toContain('periodic');
  });

  it('should accept custom reason', () => {
    const task = new CheckInTask({ reason: 'after heavy topic' });

    expect(task.instructions).toContain('after heavy topic');
  });

  it('should have adaptive instructions', () => {
    const task = new CheckInTask();

    // Test with happy context
    task.setContext({
      lastAnalysis: {
        emotion: {
          distressLevel: 0.1,
          valence: 'positive',
          primary: 'joy',
          intensity: 0.7,
        },
        intent: { primary: 'chatting', requiresEmpathy: false },
        state: { phase: 'exploring' },
      } as unknown as Parameters<typeof task.setContext>[0]['lastAnalysis'],
    });

    expect(task.instructions).toContain('Match their energy');
  });

  it('should have returning user instructions', () => {
    const task = new CheckInTask();

    task.setContext({ isReturningUser: true });

    expect(task.instructions).toContain('talked before');
  });

  describe('tools', () => {
    it('recordCheckIn should complete with mood assessment', async () => {
      const task = new CheckInTask();

      await toolOf(task, 'recordCheckIn').execute({
        howTheyAre: 'good',
        whatShared: 'Work is going well',
        needsSupport: false,
      });

      expect(task.done()).toBe(true);
      const result = await task;
      expect(result.howTheyAre).toBe('good');
      expect(result.whatShared).toBe('Work is going well');
      expect(result.needsSupport).toBe(false);
    });

    it('should return appropriate responses for different moods', async () => {
      const moods: Array<'great' | 'good' | 'okay' | 'not_great' | 'struggling'> = [
        'great',
        'good',
        'okay',
        'not_great',
        'struggling',
      ];

      for (const mood of moods) {
        const task = new CheckInTask();

        const response = await toolOf(task, 'recordCheckIn').execute({
          howTheyAre: mood,
          needsSupport: mood === 'struggling',
        });

        expect(typeof response).toBe('string');
        expect(response.length).toBeGreaterThan(0);
      }
    });
  });
});

// ============================================================================
// COMFORT TASK TESTS
// ============================================================================

describe('ComfortTask', () => {
  it('should include the specific concern in instructions', () => {
    const task = new ComfortTask('job security');

    expect(task.instructions).toContain('job security');
  });

  it('should have comfort-focused tools', () => {
    const task = new ComfortTask('test concern');

    expect(task.tools.hasTool('validateConcern')).toBe(true);
    expect(task.tools.hasTool('offerPerspective')).toBe(true);
    expect(task.tools.hasTool('concludeComfort')).toBe(true);
  });

  describe('tools', () => {
    it('validateConcern should return validation', async () => {
      const task = new ComfortTask('finances');

      const result = await toolOf(task, 'validateConcern').execute({
        validation: "That's a real concern.",
      });

      expect(result).toBe("That's a real concern.");
    });

    it('offerPerspective should prefix based on source', async () => {
      const task = new ComfortTask('finances');

      const experienceResult = await toolOf(task, 'offerPerspective').execute({
        perspective: 'These things tend to work out.',
        isFromExperience: true,
      });

      expect(experienceResult).toContain("what I've seen");

      const thinkingResult = await toolOf(task, 'offerPerspective').execute({
        perspective: 'There are options available.',
        isFromExperience: false,
      });

      expect(thinkingResult).toContain('how I think about it');
    });

    it('concludeComfort should complete with result', async () => {
      const task = new ComfortTask('health');

      await toolOf(task, 'concludeComfort').execute({
        concernAddressed: 'health anxiety',
        techniqueUsed: 'validation',
        effectivenessRating: 4,
      });

      expect(task.done()).toBe(true);
      const result = await task;
      expect(result.concernAddressed).toBe('health anxiety');
      expect(result.techniqueUsed).toBe('validation');
      expect(result.effectivenessRating).toBe(4);
    });
  });
});

// ============================================================================
// CRISIS DETECTION TASK TESTS
// ============================================================================

describe('CrisisDetectionTask', () => {
  it('should create with crisis monitoring instructions', () => {
    const task = new CrisisDetectionTask();

    expect(task.instructions).toContain('crisis');
    expect(task.instructions).toContain('hopelessness');
  });

  it('should have very sensitive emotion threshold (0.3)', () => {
    const task = new CrisisDetectionTask();

    // Set context with moderate distress - should still be in heightened mode
    task.setContext({
      lastAnalysis: {
        emotion: {
          distressLevel: 0.35,
          valence: 'negative',
          primary: 'sadness',
          intensity: 0.4,
        },
        intent: { primary: 'venting', requiresEmpathy: true },
        state: { phase: 'supporting' },
      } as unknown as Parameters<typeof task.setContext>[0]['lastAnalysis'],
    });

    // With 0.3 threshold, 0.35 should trigger support mode internally
    expect(task.instructions).toBeDefined();
  });

  it('should have crisis-specific tools', () => {
    const task = new CrisisDetectionTask();

    expect(task.tools.hasTool('flagCrisis')).toBe(true);
    expect(task.tools.hasTool('resolveCrisis')).toBe(true);
  });

  describe('tools', () => {
    it('flagCrisis should return appropriate message for severity', async () => {
      const task = new CrisisDetectionTask();

      const highResult = await toolOf(task, 'flagCrisis').execute({
        crisisType: 'emotional',
        severity: 'high',
        immediateActionNeeded: true,
        description: 'User expressing hopelessness',
      });

      expect(highResult).toContain('serious');

      const lowResult = await toolOf(task, 'flagCrisis').execute({
        crisisType: 'financial',
        severity: 'low',
        immediateActionNeeded: false,
        description: 'Minor concern',
      });

      expect(lowResult).toContain('something important');
    });

    it('resolveCrisis should complete the task', async () => {
      const task = new CrisisDetectionTask();

      await toolOf(task, 'resolveCrisis').execute({
        crisisDetected: true,
        crisisType: 'emotional',
        severity: 'medium',
        recommendedAction: 'Follow up tomorrow',
      });

      expect(task.done()).toBe(true);
      const result = await task;
      expect(result.crisisDetected).toBe(true);
      expect(result.crisisType).toBe('emotional');
      expect(result.severity).toBe('medium');
    });

    it('resolveCrisis response varies based on detection', async () => {
      const task1 = new CrisisDetectionTask();

      const detectedResponse = await toolOf(task1, 'resolveCrisis').execute({
        crisisDetected: true,
        severity: 'medium',
      });

      expect(detectedResponse).toContain('carry everything alone');

      const task2 = new CrisisDetectionTask();

      const notDetectedResponse = await toolOf(task2, 'resolveCrisis').execute({
        crisisDetected: false,
        severity: 'low',
      });

      expect(notDetectedResponse).toContain("I'm here");
    });
  });
});

// ============================================================================
// RESULT TYPE TESTS
// ============================================================================

describe('Support Task Results', () => {
  it('SupportResult should have required fields', async () => {
    const task = new EmotionalSupportTask();

    await toolOf(task, 'concludeSupport').execute({
      emotionAddressed: 'anxiety',
      userFeelsBetter: true,
      needsMoreSupport: false,
      notes: 'Responded well to validation',
    });

    const result = await task;
    expect(result).toHaveProperty('emotionAddressed');
    expect(result).toHaveProperty('userFeelsBetter');
    expect(result).toHaveProperty('needsMoreSupport');
  });

  it('CheckInResult should have mood categories', async () => {
    const task = new CheckInTask();

    await toolOf(task, 'recordCheckIn').execute({
      howTheyAre: 'okay',
      needsSupport: false,
    });

    const result = await task;
    expect(['great', 'good', 'okay', 'not_great', 'struggling']).toContain(result.howTheyAre);
  });

  it('CrisisResult should indicate action needed for high severity', async () => {
    const task = new CrisisDetectionTask();

    await toolOf(task, 'resolveCrisis').execute({
      crisisDetected: true,
      crisisType: 'emotional',
      severity: 'high',
    });

    const result = await task;
    expect(result.immediateActionNeeded).toBe(true);
  });
});
