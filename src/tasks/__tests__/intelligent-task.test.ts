/**
 * IntelligentTask Tests
 *
 * Tests for emotion-aware, context-adaptive task execution:
 * - Adaptive instructions based on emotion
 * - Context management
 * - Support mode activation
 * - IntelligentTaskGroup orchestration
 */

import { describe, expect, it, vi } from 'vitest';
import {
  IntelligentTask,
  IntelligentTaskGroup,
  createAdaptiveResponse,
  type AdaptiveInstructions,
  type TaskContext,
} from '../intelligent-task.js';

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
vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      ...config,
      execute: config.execute,
    })),
  },
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create a mock lastAnalysis object with all required properties
 */
function createMockAnalysis(overrides: {
  emotion?: Partial<{
    primary: string;
    valence: 'positive' | 'negative' | 'neutral';
    intensity: number;
    distressLevel: number;
  }>;
  intent?: Partial<{
    primary: string;
    requiresEmpathy: boolean;
  }>;
  state?: Partial<{ phase: string }>;
}): TaskContext['lastAnalysis'] {
  return {
    emotion: {
      primary: overrides.emotion?.primary ?? 'neutral',
      valence: overrides.emotion?.valence ?? 'neutral',
      intensity: overrides.emotion?.intensity ?? 0.5,
      distressLevel: overrides.emotion?.distressLevel ?? 0.2,
      confidence: 0.8,
      markers: [],
      suggestedTone: 'normal',
    },
    intent: {
      primary: overrides.intent?.primary ?? 'chatting',
      secondary: null,
      confidence: 0.8,
      urgency: 'none',
      requiresEmpathy: overrides.intent?.requiresEmpathy ?? false,
      requiresAction: false,
      suggestedApproach: 'casual',
      topicFocus: null,
    },
    state: {
      phase: overrides.state?.phase ?? 'exploring',
    },
    topics: [],
    contextForPrompt: '',
    suggestedTone: 'normal',
    priorityFocus: null,
  } as unknown as TaskContext['lastAnalysis'];
}

// ============================================================================
// TEST IMPLEMENTATIONS
// ============================================================================

class TestIntelligentTask extends IntelligentTask<string> {
  constructor(instructions: string | AdaptiveInstructions = 'Test instructions') {
    super({
      instructions,
      tools: {},
    });
  }

  // Expose protected methods for testing
  public testUpdateInstructions(): void {
    this._updateInstructions();
  }

  public testIsUserDistressed(): boolean {
    return this.isUserDistressed();
  }

  public testGetUserEmotion() {
    return this.getUserEmotion();
  }

  public testGetUserIntent() {
    return this.getUserIntent();
  }

  public testGetPromptContext(): string {
    return this.getPromptContext();
  }

  public testAnalyzeMessage(message: string) {
    return this.analyzeMessage(message);
  }

  public async testRemember(fact: string, category: string): Promise<void> {
    return this.remember(fact, category);
  }

  finish(result: string): void {
    this.complete(result);
  }

  getContext(): TaskContext {
    return this._context;
  }

  getInSupportMode(): boolean {
    return this._inSupportMode;
  }
}

// ============================================================================
// INTELLIGENT TASK TESTS
// ============================================================================

describe('IntelligentTask', () => {
  describe('construction', () => {
    it('should accept string instructions', () => {
      const task = new TestIntelligentTask('Simple instructions');
      expect(task.instructions).toBe('Simple instructions');
    });

    it('should accept adaptive instructions', () => {
      const task = new TestIntelligentTask({
        base: 'Base instructions',
        ifDistressed: 'Distressed instructions',
        ifHappy: 'Happy instructions',
      });
      expect(task.instructions).toBe('Base instructions');
    });

    it('should use default emotion threshold of 0.5', () => {
      const task = new TestIntelligentTask();
      // Test by setting distress level just above/below threshold
      task.setContext({
        lastAnalysis: createMockAnalysis({
          emotion: { distressLevel: 0.6, valence: 'negative', primary: 'sadness', intensity: 0.6 },
          intent: { primary: 'venting', requiresEmpathy: true },
          state: { phase: 'exploring' },
        }),
      });
      expect(task.testIsUserDistressed()).toBe(true);

      task.setContext({
        lastAnalysis: createMockAnalysis({
          emotion: { distressLevel: 0.4, valence: 'neutral', primary: 'neutral', intensity: 0.4 },
          intent: { primary: 'chatting', requiresEmpathy: false },
          state: { phase: 'exploring' },
        }),
      });
      expect(task.testIsUserDistressed()).toBe(false);
    });
  });

  describe('context management', () => {
    it('should set and use context', () => {
      const task = new TestIntelligentTask();
      const context: TaskContext = {
        userId: 'user-123',
        userName: 'Alice',
        isReturningUser: true,
      };

      task.setContext(context);

      expect(task.getContext().userId).toBe('user-123');
      expect(task.getContext().userName).toBe('Alice');
      expect(task.getContext().isReturningUser).toBe(true);
    });

    it('should update instructions when context is set', () => {
      const task = new TestIntelligentTask({
        base: 'Base',
        ifReturning: 'Welcome back!',
      });

      task.setContext({ isReturningUser: true });

      expect(task.instructions).toContain('Welcome back!');
    });

    it('should add user name to instructions', () => {
      const task = new TestIntelligentTask({ base: 'Base instructions' });

      task.setContext({ userName: 'Bob' });

      expect(task.instructions).toContain('Bob');
    });
  });

  describe('adaptive instructions', () => {
    it('should add distressed instructions when user is distressed', () => {
      const task = new TestIntelligentTask({
        base: 'Base',
        ifDistressed: 'I can hear this is hard.',
      });

      task.setContext({
        lastAnalysis: createMockAnalysis({
          emotion: { distressLevel: 0.7, valence: 'negative', primary: 'sadness', intensity: 0.7 },
          intent: { primary: 'venting', requiresEmpathy: true },
          state: { phase: 'supporting' },
        }),
      });

      expect(task.instructions).toContain('I can hear this is hard.');
    });

    it('should add happy instructions when user is positive', () => {
      const task = new TestIntelligentTask({
        base: 'Base',
        ifHappy: 'Love the positive energy!',
      });

      task.setContext({
        lastAnalysis: createMockAnalysis({
          emotion: { distressLevel: 0.1, valence: 'positive', primary: 'joy', intensity: 0.7 },
          intent: { primary: 'sharing_news', requiresEmpathy: false },
          state: { phase: 'exploring' },
        }),
      });

      expect(task.instructions).toContain('Love the positive energy!');
    });

    it('should add anxious instructions when user is fearful', () => {
      const task = new TestIntelligentTask({
        base: 'Base',
        ifAnxious: 'It is okay to feel nervous.',
      });

      task.setContext({
        lastAnalysis: createMockAnalysis({
          emotion: { distressLevel: 0.4, valence: 'negative', primary: 'fear', intensity: 0.6 },
          intent: { primary: 'seeking_advice', requiresEmpathy: true },
          state: { phase: 'exploring' },
        }),
      });

      expect(task.instructions).toContain('It is okay to feel nervous.');
    });

    it('should add curious instructions when user shows anticipation', () => {
      const task = new TestIntelligentTask({
        base: 'Base',
        ifCurious: 'Great question!',
      });

      task.setContext({
        lastAnalysis: createMockAnalysis({
          emotion: {
            distressLevel: 0.1,
            valence: 'positive',
            primary: 'anticipation',
            intensity: 0.5,
          },
          intent: { primary: 'asking_question', requiresEmpathy: false },
          state: { phase: 'exploring' },
        }),
      });

      expect(task.instructions).toContain('Great question!');
    });

    it('should add new user instructions when not returning', () => {
      const task = new TestIntelligentTask({
        base: 'Base',
        ifNew: 'Nice to meet you!',
      });

      task.setContext({ isReturningUser: false });

      expect(task.instructions).toContain('Nice to meet you!');
    });
  });

  describe('emotion helpers', () => {
    it('should return null for getUserEmotion when no analysis', () => {
      const task = new TestIntelligentTask();
      expect(task.testGetUserEmotion()).toBeNull();
    });

    it('should return emotion when analysis exists', () => {
      const task = new TestIntelligentTask();
      const emotion = {
        distressLevel: 0.3,
        valence: 'neutral' as const,
        primary: 'neutral',
        intensity: 0.3,
      };

      task.setContext({
        lastAnalysis: {
          emotion,
          intent: { primary: 'chatting', requiresEmpathy: false },
          state: { phase: 'exploring' },
        } as unknown as TaskContext['lastAnalysis'],
      });

      expect(task.testGetUserEmotion()).toEqual(emotion);
    });

    it('should return null for getUserIntent when no analysis', () => {
      const task = new TestIntelligentTask();
      expect(task.testGetUserIntent()).toBeNull();
    });

    it('should return intent when analysis exists', () => {
      const task = new TestIntelligentTask();
      const intent = { primary: 'seeking_advice', requiresEmpathy: true };

      task.setContext({
        lastAnalysis: {
          emotion: { distressLevel: 0.3, valence: 'neutral', primary: 'neutral', intensity: 0.3 },
          intent,
          state: { phase: 'exploring' },
        } as unknown as TaskContext['lastAnalysis'],
      });

      expect(task.testGetUserIntent()).toEqual(intent);
    });
  });

  describe('support mode', () => {
    it('should not be in support mode initially', () => {
      const task = new TestIntelligentTask();
      expect(task.getInSupportMode()).toBe(false);
    });

    it('should enter support mode when distress exceeds threshold', () => {
      const task = new TestIntelligentTask({
        base: 'Base',
        ifDistressed: 'Support mode active',
      });

      task.setContext({
        lastAnalysis: {
          emotion: { distressLevel: 0.8, valence: 'negative', primary: 'sadness', intensity: 0.8 },
          intent: { primary: 'venting', requiresEmpathy: true },
          state: { phase: 'supporting' },
        } as unknown as TaskContext['lastAnalysis'],
      });

      expect(task.getInSupportMode()).toBe(true);
    });
  });

  describe('services integration', () => {
    it('should use services to get prompt context', () => {
      const task = new TestIntelligentTask();
      const mockServices = {
        getPromptContext: vi.fn().mockReturnValue({ formattedForPrompt: 'Context from services' }),
      };

      task.setContext({
        services: mockServices as unknown as TaskContext['services'],
      });

      const context = task.testGetPromptContext();
      expect(context).toBe('Context from services');
      expect(mockServices.getPromptContext).toHaveBeenCalled();
    });

    it('should return empty string when no services', () => {
      const task = new TestIntelligentTask();
      expect(task.testGetPromptContext()).toBe('');
    });

    it('should capture insights through services.remember', async () => {
      const task = new TestIntelligentTask();
      const mockServices = {
        captureInsight: vi.fn(),
      };

      task.setContext({
        services: mockServices as unknown as TaskContext['services'],
      });

      await task.testRemember('Loves hiking', 'personal');

      expect(mockServices.captureInsight).toHaveBeenCalledWith(
        'preference',
        'task_personal',
        'Loves hiking',
        0.7
      );
    });
  });
});

// ============================================================================
// INTELLIGENT TASK GROUP TESTS
// ============================================================================

describe('IntelligentTaskGroup', () => {
  describe('context sharing', () => {
    it('should share context across tasks', async () => {
      const receivedContexts: TaskContext[] = [];

      class ContextCapturingTask extends IntelligentTask<string> {
        constructor() {
          super({ instructions: 'Capture context', tools: {} });
        }

        setContext(context: TaskContext): void {
          super.setContext(context);
          receivedContexts.push({ ...context });
        }

        async onEnter(): Promise<void> {
          this.complete('done');
        }
      }

      const group = new IntelligentTaskGroup();
      const sharedContext: TaskContext = {
        userId: 'shared-user',
        userName: 'Shared Name',
      };

      group.setContext(sharedContext);
      group.add(() => new ContextCapturingTask(), { id: 'task1', description: 'Task 1' });
      group.add(() => new ContextCapturingTask(), { id: 'task2', description: 'Task 2' });

      const mockSession = {} as Parameters<typeof group.start>[0];
      await group.start(mockSession);

      expect(receivedContexts.length).toBe(2);
      expect(receivedContexts[0].userId).toBe('shared-user');
      expect(receivedContexts[1].userId).toBe('shared-user');
    });
  });

  describe('support task integration', () => {
    it('should set support task factory', () => {
      const group = new IntelligentTaskGroup();

      class SupportTask extends IntelligentTask<void> {
        constructor() {
          super({ instructions: 'Provide support', tools: {} });
        }

        async onEnter(): Promise<void> {
          this.complete(undefined);
        }
      }

      // Should not throw
      expect(() => group.setSupportTask(() => new SupportTask())).not.toThrow();
    });
  });

  describe('task execution', () => {
    it('should execute tasks and collect results', async () => {
      class ResultTask extends IntelligentTask<number> {
        constructor(private value: number) {
          super({ instructions: `Return ${value}`, tools: {} });
        }

        async onEnter(): Promise<void> {
          this.complete(this.value);
        }
      }

      const group = new IntelligentTaskGroup();
      group.add(() => new ResultTask(10), { id: 'first', description: 'First' });
      group.add(() => new ResultTask(20), { id: 'second', description: 'Second' });

      const mockSession = {} as Parameters<typeof group.start>[0];
      const results = await group.start(mockSession);

      expect(results.first).toBe(10);
      expect(results.second).toBe(20);
    });

    it('should configure tasks with skipIfDistressed', () => {
      // This test verifies that skipIfDistressed option is properly accepted
      // Actual task execution requires a real session which is tested elsewhere
      class SimpleTask extends IntelligentTask<string> {
        constructor() {
          super({ instructions: 'Simple task', tools: {} });
        }
      }

      const group = new IntelligentTaskGroup();

      // Set distressed context
      group.setContext({
        lastAnalysis: createMockAnalysis({
          emotion: { distressLevel: 0.8, valence: 'negative', primary: 'sadness', intensity: 0.8 },
          intent: { primary: 'venting', requiresEmpathy: true },
          state: { phase: 'supporting' },
        }),
      });

      // Should not throw when adding tasks with skipIfDistressed
      expect(() => {
        group.add(() => new SimpleTask(), { id: 'always', description: 'Always runs' });
        group.add(() => new SimpleTask(), {
          id: 'skip',
          description: 'Skipped when distressed',
          skipIfDistressed: true,
        });
        group.add(() => new SimpleTask(), {
          id: 'also_always',
          description: 'Also always runs',
        });
      }).not.toThrow();
    });
  });

  describe('task options', () => {
    it('should accept priority option', () => {
      class SimpleTask extends IntelligentTask<void> {
        constructor() {
          super({ instructions: 'Simple', tools: {} });
        }

        async onEnter(): Promise<void> {
          this.complete(undefined);
        }
      }

      const group = new IntelligentTaskGroup();

      // Should not throw
      expect(() =>
        group.add(() => new SimpleTask(), {
          id: 'task',
          description: 'Description',
          priority: 5,
        })
      ).not.toThrow();
    });

    it('should accept requiredIfDistressed option', () => {
      class SimpleTask extends IntelligentTask<void> {
        constructor() {
          super({ instructions: 'Simple', tools: {} });
        }

        async onEnter(): Promise<void> {
          this.complete(undefined);
        }
      }

      const group = new IntelligentTaskGroup();

      // Should not throw
      expect(() =>
        group.add(() => new SimpleTask(), {
          id: 'task',
          description: 'Description',
          requiredIfDistressed: true,
        })
      ).not.toThrow();
    });
  });
});

// ============================================================================
// ADAPTIVE RESPONSE HELPER TESTS
// ============================================================================

describe('createAdaptiveResponse', () => {
  it('should return base response when no emotion data', () => {
    const context: TaskContext = {};

    const response = createAdaptiveResponse(
      {
        baseResponse: 'Base response',
        distressedResponse: 'Distressed response',
      },
      context
    );

    expect(response).toBe('Base response');
  });

  it('should return distressed response when user is distressed', () => {
    const context: TaskContext = {
      lastAnalysis: {
        emotion: { distressLevel: 0.7, valence: 'negative', primary: 'sadness', intensity: 0.7 },
        intent: { primary: 'venting', requiresEmpathy: true },
        state: { phase: 'supporting' },
      } as unknown as TaskContext['lastAnalysis'],
    };

    const response = createAdaptiveResponse(
      {
        baseResponse: 'Base response',
        distressedResponse: 'Distressed response',
      },
      context
    );

    expect(response).toBe('Distressed response');
  });

  it('should return enthusiastic response when user is positive', () => {
    const context: TaskContext = {
      lastAnalysis: {
        emotion: { distressLevel: 0.1, valence: 'positive', primary: 'joy', intensity: 0.7 },
        intent: { primary: 'sharing_news', requiresEmpathy: false },
        state: { phase: 'exploring' },
      } as unknown as TaskContext['lastAnalysis'],
    };

    const response = createAdaptiveResponse(
      {
        baseResponse: 'Base response',
        enthusiasticResponse: 'Enthusiastic response!',
      },
      context
    );

    expect(response).toBe('Enthusiastic response!');
  });

  it('should fall back to base when specific response not provided', () => {
    const context: TaskContext = {
      lastAnalysis: {
        emotion: { distressLevel: 0.7, valence: 'negative', primary: 'sadness', intensity: 0.7 },
        intent: { primary: 'venting', requiresEmpathy: true },
        state: { phase: 'supporting' },
      } as unknown as TaskContext['lastAnalysis'],
    };

    const response = createAdaptiveResponse(
      {
        baseResponse: 'Base response',
        // No distressedResponse provided
      },
      context
    );

    expect(response).toBe('Base response');
  });
});
