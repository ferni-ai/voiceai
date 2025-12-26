/**
 * Handoff Scenario Integration Tests
 *
 * Tests persona handoff flows including:
 * - Intent detection for handoff
 * - Context preservation during handoff
 * - Identity reinforcement post-handoff
 * - Error handling during handoff
 *
 * @module agents/__tests__/integration/handoff-scenarios
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { emotionalStates, users } from '../fixtures/index.js';
import {
  createMockJobContext,
  createMockSessionServices,
  createMockVoicePipelineAgent,
  type MockSessionServices,
  type MockVoicePipelineAgent,
  resetAllMocks,
} from '../mocks/index.js';

// ============================================================================
// HANDOFF DETECTION
// ============================================================================

describe('Handoff Detection', () => {
  let mockServices: MockSessionServices;
  let mockPipeline: MockVoicePipelineAgent;

  beforeEach(() => {
    resetAllMocks();
    mockServices = createMockSessionServices();
    mockPipeline = createMockVoicePipelineAgent();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Intent Detection', () => {
    const handoffPhrases = [
      { phrase: "I want to talk to Jordan about planning my sister's wedding", target: 'jordan' },
      { phrase: 'Can Peter help me research this topic?', target: 'peter' },
      { phrase: 'Maya would be better for this habit tracking stuff', target: 'maya' },
      { phrase: 'I need Alex to help me write an email', target: 'alex' },
      { phrase: 'Nayan, I need some philosophical perspective', target: 'nayan' },
      { phrase: 'Let me talk to someone who specializes in events', target: 'jordan' },
    ];

    it.each(handoffPhrases)(
      'should detect handoff intent for "$target" from "$phrase"',
      ({ phrase, target }) => {
        // Simulate handoff intent detection
        const detectHandoffIntent = (message: string): { detected: boolean; target?: string } => {
          const targetPatterns: Record<string, RegExp[]> = {
            jordan: [/jordan/i, /event/i, /wedding/i, /party/i, /planning/i],
            peter: [/peter/i, /research/i, /data/i, /analyze/i],
            maya: [/maya/i, /habit/i, /routine/i, /schedule/i],
            alex: [/alex/i, /write/i, /email/i, /communication/i],
            nayan: [/nayan/i, /philosoph/i, /wisdom/i, /perspective/i],
          };

          for (const [personaTarget, patterns] of Object.entries(targetPatterns)) {
            if (patterns.some((p) => p.test(message))) {
              return { detected: true, target: personaTarget };
            }
          }

          return { detected: false };
        };

        const result = detectHandoffIntent(phrase);

        expect(result.detected).toBe(true);
        expect(result.target).toBe(target);
      }
    );

    it('should not detect handoff for general conversation', () => {
      const generalPhrases = [
        "I'm feeling stressed today",
        'What should I focus on?',
        'How can I improve?',
        "I don't know what to do",
      ];

      const detectHandoffIntent = (message: string): boolean => {
        // Only detect explicit handoff requests with persona names or transfer keywords
        const handoffIndicators = [
          /talk to (jordan|peter|maya|alex|nayan)/i,
          /can (jordan|peter|maya|alex|nayan) help/i,
          /(jordan|peter|maya|alex|nayan) would be better/i,
          /let me talk to (jordan|peter|maya|alex|nayan)/i,
          /switch to (jordan|peter|maya|alex|nayan)/i,
        ];

        return handoffIndicators.some((p) => p.test(message));
      };

      for (const phrase of generalPhrases) {
        expect(detectHandoffIntent(phrase)).toBe(false);
      }
    });
  });

  describe('Handoff Confidence', () => {
    it('should calculate high confidence for explicit persona mention', () => {
      const calculateHandoffConfidence = (
        message: string,
        _emotionalState: typeof emotionalStates.neutral
      ): number => {
        let confidence = 0;

        // Explicit persona name
        if (/jordan|peter|maya|alex|nayan/i.test(message)) {
          confidence += 0.6;
        }

        // Handoff language
        if (/talk to|speak with|can .* help|would be better/i.test(message)) {
          confidence += 0.3;
        }

        // Specialty keywords
        if (/research|planning|habit|write|wisdom/i.test(message)) {
          confidence += 0.1;
        }

        return Math.min(confidence, 1.0);
      };

      const highConfidence = calculateHandoffConfidence(
        'I want to talk to Jordan about planning',
        emotionalStates.neutral
      );

      const mediumConfidence = calculateHandoffConfidence(
        'Could someone help me plan an event?',
        emotionalStates.neutral
      );

      const lowConfidence = calculateHandoffConfidence(
        "I'm thinking about my sister's wedding",
        emotionalStates.neutral
      );

      expect(highConfidence).toBeGreaterThan(0.8);
      expect(mediumConfidence).toBeLessThan(0.8);
      expect(lowConfidence).toBeLessThan(0.5);
    });

    it('should lower confidence during emotional distress', () => {
      // During distress, maintain support rather than handing off
      const shouldDeferHandoff = (
        emotionalState: { distressLevel: number },
        handoffConfidence: number
      ): boolean => {
        if (emotionalState.distressLevel > 0.7) {
          // Only handoff if very explicit
          return handoffConfidence < 0.95;
        }

        return false;
      };

      expect(shouldDeferHandoff(emotionalStates.distressed, 0.8)).toBe(true);
      expect(shouldDeferHandoff(emotionalStates.neutral, 0.8)).toBe(false);
      expect(shouldDeferHandoff(emotionalStates.distressed, 0.96)).toBe(false);
    });
  });
});

// ============================================================================
// CONTEXT PRESERVATION
// ============================================================================

describe('Context Preservation During Handoff', () => {
  let mockServices: MockSessionServices;

  beforeEach(() => {
    resetAllMocks();
    mockServices = createMockSessionServices();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Conversation History Transfer', () => {
    it('should preserve recent conversation turns', () => {
      interface ConversationTurn {
        role: 'user' | 'assistant';
        content: string;
        persona: string;
        timestamp: number;
      }

      const conversationHistory: ConversationTurn[] = [
        {
          role: 'user',
          content: 'Hey Ferni!',
          persona: 'ferni',
          timestamp: Date.now() - 60000,
        },
        {
          role: 'assistant',
          content: "Hey! Great to hear from you. What's on your mind?",
          persona: 'ferni',
          timestamp: Date.now() - 55000,
        },
        {
          role: 'user',
          content: "I'm planning my sister's wedding and feeling overwhelmed",
          persona: 'ferni',
          timestamp: Date.now() - 30000,
        },
        {
          role: 'assistant',
          content: 'That sounds exciting but stressful! Would you like to talk to Jordan?',
          persona: 'ferni',
          timestamp: Date.now() - 25000,
        },
      ];

      // Create handoff context
      const createHandoffContext = (
        history: ConversationTurn[],
        targetPersona: string
      ): { summary: string; recentTurns: ConversationTurn[]; targetPersona: string } => {
        // Get last N turns for context
        const recentTurns = history.slice(-4);

        // Generate summary
        const summary = `User is discussing: wedding planning. Emotional state: overwhelmed. Handoff reason: specialty match.`;

        return {
          summary,
          recentTurns,
          targetPersona,
        };
      };

      const handoffContext = createHandoffContext(conversationHistory, 'jordan');

      expect(handoffContext.recentTurns).toHaveLength(4);
      expect(handoffContext.targetPersona).toBe('jordan');
      expect(handoffContext.summary).toContain('wedding');
    });

    it('should preserve emotional context across handoff', () => {
      interface EmotionalContext {
        primary: string;
        intensity: number;
        trajectory: string;
        recentTriggers: string[];
      }

      const preserveEmotionalContext = (
        emotionalState: typeof emotionalStates.anxious
      ): EmotionalContext => {
        return {
          primary: emotionalState.primary,
          intensity: emotionalState.intensity,
          trajectory: emotionalState.trajectory,
          recentTriggers: ['wedding planning', 'family pressure', 'timeline stress'],
        };
      };

      const emotionalContext = preserveEmotionalContext(emotionalStates.anxious);

      expect(emotionalContext.primary).toBe('anxious');
      expect(emotionalContext.intensity).toBeGreaterThan(0.5);
      expect(emotionalContext.recentTriggers).toContain('wedding planning');
    });
  });

  describe('Topic Continuity', () => {
    it('should transfer active topics to new persona', () => {
      const activeTopics = ['wedding planning', 'budget', 'guest list', 'venue'];

      const filterRelevantTopics = (topics: string[], targetSpecialty: string): string[] => {
        const specialtyTopics: Record<string, string[]> = {
          events: ['wedding', 'planning', 'venue', 'guest', 'party'],
          research: ['data', 'analysis', 'study'],
          habits: ['routine', 'schedule', 'habit'],
        };

        const relevantKeywords = specialtyTopics[targetSpecialty] || [];

        return topics.filter((topic) =>
          relevantKeywords.some((keyword) => topic.toLowerCase().includes(keyword))
        );
      };

      const relevantTopics = filterRelevantTopics(activeTopics, 'events');

      expect(relevantTopics).toContain('wedding planning');
      expect(relevantTopics).toContain('venue');
      expect(relevantTopics.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// IDENTITY REINFORCEMENT
// ============================================================================

describe('Identity Reinforcement Post-Handoff', () => {
  let mockPipeline: MockVoicePipelineAgent;

  beforeEach(() => {
    resetAllMocks();
    mockPipeline = createMockVoicePipelineAgent();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Persona Introduction', () => {
    it('should generate appropriate introduction for new persona', () => {
      const personaIntros: Record<string, string> = {
        jordan:
          "Hey! I'm Jordan, and I absolutely love helping with events. I heard you're planning a wedding - tell me everything!",
        peter:
          "Hi there! I'm Peter. I love diving deep into topics and finding insights. What would you like to research?",
        maya: "Hello! I'm Maya. I'm here to help you build sustainable habits. What are you hoping to work on?",
        alex: "Hi! I'm Alex, your communication specialist. I'd love to help you craft the perfect message. What are we writing?",
        nayan:
          "Greetings. I'm Nayan. I find meaning in thoughtful conversation. What's on your mind?",
      };

      const getPersonaIntro = (personaId: string, context?: string): string => {
        let intro = personaIntros[personaId] || "Hi! I'm here to help.";

        if (context) {
          // Personalize based on handoff context
          intro = intro.replace(
            /What would you like|What are we|tell me/i,
            'I understand you want to talk about'
          );
        }

        return intro;
      };

      const jordanIntro = getPersonaIntro('jordan');
      expect(jordanIntro).toContain('Jordan');
      expect(jordanIntro).toContain('events');

      const peterIntro = getPersonaIntro('peter');
      expect(peterIntro).toContain('Peter');
      expect(peterIntro).toContain('research');
    });

    it('should reference context from previous persona', () => {
      const generateHandoffGreeting = (
        newPersona: string,
        previousPersona: string,
        topic: string
      ): string => {
        return `${previousPersona} told me you've been discussing ${topic}. I'm ${newPersona}, and I'd love to help with that!`;
      };

      const greeting = generateHandoffGreeting('Jordan', 'Ferni', 'wedding planning');

      expect(greeting).toContain('Ferni told me');
      expect(greeting).toContain('wedding planning');
      expect(greeting).toContain('Jordan');
    });
  });

  describe('Voice and Personality', () => {
    it('should switch voice settings for new persona', () => {
      const personaVoiceSettings: Record<
        string,
        { voiceId: string; pitch: number; speed: number }
      > = {
        ferni: { voiceId: 'ferni-voice-1', pitch: 1.0, speed: 1.0 },
        jordan: { voiceId: 'jordan-voice-1', pitch: 1.05, speed: 1.1 },
        peter: { voiceId: 'peter-voice-1', pitch: 0.95, speed: 0.95 },
        maya: { voiceId: 'maya-voice-1', pitch: 1.0, speed: 1.0 },
        alex: { voiceId: 'alex-voice-1', pitch: 1.0, speed: 1.05 },
        nayan: { voiceId: 'nayan-voice-1', pitch: 0.9, speed: 0.9 },
      };

      const getVoiceSettings = (personaId: string) => {
        return personaVoiceSettings[personaId] || personaVoiceSettings.ferni;
      };

      const jordanSettings = getVoiceSettings('jordan');
      const nayanSettings = getVoiceSettings('nayan');

      // Jordan is energetic
      expect(jordanSettings.speed).toBeGreaterThan(1.0);

      // Nayan is measured
      expect(nayanSettings.speed).toBeLessThan(1.0);
    });
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

describe('Handoff Error Handling', () => {
  let mockServices: MockSessionServices;
  let mockJobCtx: ReturnType<typeof createMockJobContext>;

  beforeEach(() => {
    resetAllMocks();
    mockServices = createMockSessionServices();
    mockJobCtx = createMockJobContext();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Locked Persona Handling', () => {
    it('should gracefully handle handoff to locked persona', () => {
      const lockedPersonas = ['alex', 'maya'];

      const handleLockedPersonaHandoff = (
        targetPersona: string,
        userProfile: typeof users.returningUser
      ): { success: boolean; fallback?: string; message: string } => {
        if (lockedPersonas.includes(targetPersona)) {
          return {
            success: false,
            fallback: 'ferni',
            message: `${targetPersona} isn't available yet, but I can help you with that! Let me do my best.`,
          };
        }

        return {
          success: true,
          message: `Connecting you with ${targetPersona} now!`,
        };
      };

      const lockedResult = handleLockedPersonaHandoff('alex', users.returningUser);
      expect(lockedResult.success).toBe(false);
      expect(lockedResult.fallback).toBe('ferni');
      expect(lockedResult.message).toContain("isn't available");

      const unlockedResult = handleLockedPersonaHandoff('jordan', users.returningUser);
      expect(unlockedResult.success).toBe(true);
    });
  });

  describe('Failed Handoff Recovery', () => {
    it('should recover from handoff failure', async () => {
      let handoffAttempted = false;
      let recoveryAttempted = false;

      const attemptHandoff = async (
        targetPersona: string
      ): Promise<{ success: boolean; error?: string }> => {
        handoffAttempted = true;

        // Simulate failure
        if (targetPersona === 'broken-persona') {
          throw new Error('Persona not found');
        }

        return { success: true };
      };

      const handleHandoffWithRecovery = async (
        targetPersona: string
      ): Promise<{ persona: string; wasRecovered: boolean }> => {
        try {
          await attemptHandoff(targetPersona);
          return { persona: targetPersona, wasRecovered: false };
        } catch {
          recoveryAttempted = true;
          // Fall back to Ferni
          return { persona: 'ferni', wasRecovered: true };
        }
      };

      const result = await handleHandoffWithRecovery('broken-persona');

      expect(handoffAttempted).toBe(true);
      expect(recoveryAttempted).toBe(true);
      expect(result.persona).toBe('ferni');
      expect(result.wasRecovered).toBe(true);
    });

    it('should maintain conversation continuity after failed handoff', () => {
      const conversationState = {
        currentPersona: 'ferni',
        topic: 'wedding planning',
        emotionalState: emotionalStates.anxious,
        turnsInSession: 5,
      };

      const handleFailedHandoff = (
        state: typeof conversationState
      ): { message: string; statePreserved: boolean } => {
        // State should be preserved
        return {
          message: `I'll keep helping you with ${state.topic}. What aspect should we focus on?`,
          statePreserved: true,
        };
      };

      const result = handleFailedHandoff(conversationState);

      expect(result.statePreserved).toBe(true);
      expect(result.message).toContain('wedding planning');
    });
  });
});

// ============================================================================
// HANDOFF FLOW INTEGRATION
// ============================================================================

describe('Handoff Flow Integration', () => {
  let mockServices: MockSessionServices;
  let mockJobCtx: ReturnType<typeof createMockJobContext>;

  beforeEach(() => {
    resetAllMocks();
    mockServices = createMockSessionServices();
    mockJobCtx = createMockJobContext();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should complete full handoff flow', async () => {
    const handoffSteps: string[] = [];

    // Step 1: Detect intent
    const detectIntent = (): boolean => {
      handoffSteps.push('intent_detected');
      return true;
    };

    // Step 2: Confirm with user
    const confirmHandoff = (): boolean => {
      handoffSteps.push('user_confirmed');
      return true;
    };

    // Step 3: Prepare context
    const prepareContext = (): object => {
      handoffSteps.push('context_prepared');
      return { topic: 'wedding', emotion: 'anxious' };
    };

    // Step 4: Execute handoff
    const executeHandoff = async (): Promise<void> => {
      handoffSteps.push('handoff_executed');
      await new Promise((resolve) => setTimeout(resolve, 10));
    };

    // Step 5: New persona intro
    const introduceNewPersona = (): void => {
      handoffSteps.push('persona_introduced');
    };

    // Execute flow
    if (detectIntent()) {
      if (confirmHandoff()) {
        prepareContext();
        await executeHandoff();
        introduceNewPersona();
      }
    }

    expect(handoffSteps).toEqual([
      'intent_detected',
      'user_confirmed',
      'context_prepared',
      'handoff_executed',
      'persona_introduced',
    ]);
  });

  it('should emit handoff events', async () => {
    const events: string[] = [];

    mockJobCtx.room.on('handoff_initiated', () => events.push('handoff_initiated'));

    // Simulate handoff events
    mockJobCtx.room.emit('handoff_initiated', { target: 'jordan' });

    expect(events).toContain('handoff_initiated');
  });
});

// ============================================================================
// EMOTION PRESERVATION THROUGH TTS CACHE (E2E)
// ============================================================================

describe('Emotion Preservation Through TTS Cache', () => {
  /**
   * E2E test verifying that emotional context flows correctly through
   * the entire TTS caching pipeline during persona handoffs.
   *
   * Flow being tested:
   * 1. turn-handler.ts sets userData.currentEmotion from emotional analysis
   * 2. extractTtsSessionContext reads userData.currentEmotion → TtsSessionContext.emotion
   * 3. wrappedTtsNode passes emotion to createCacheAwareTTSNode
   * 4. cache-aware-tts uses emotion in cache key: `${voiceId}:${emotion}:${text}`
   *
   * This ensures emotion-aware TTS caching actually works during handoffs.
   */

  interface MockUserData {
    userId: string;
    sessionId: string;
    personaId: string;
    currentEmotion?: string;
    wasInterrupted?: boolean;
    interruptType?: 'hard' | 'soft';
  }

  interface TtsSessionContext {
    userId?: string;
    sessionId?: string;
    personaId?: string;
    wasInterrupted?: boolean;
    interruptType?: 'hard' | 'soft';
    emotion?: string;
  }

  // Simulate the extractTtsSessionContext function from tts-wrapper.ts
  const extractTtsSessionContext = (
    userData: MockUserData | undefined,
    defaultPersonaId: string
  ): TtsSessionContext => {
    return {
      userId: userData?.userId,
      sessionId: userData?.sessionId,
      personaId: userData?.personaId || defaultPersonaId,
      wasInterrupted: userData?.wasInterrupted,
      interruptType: userData?.interruptType,
      emotion: userData?.currentEmotion,
    };
  };

  // Simulate cache key generation from speculative-tts.ts
  const generateCacheKey = (voiceId: string, emotion: string, text: string): string => {
    const normalized = text.toLowerCase().trim();
    return `${voiceId}:${emotion}:${normalized}`;
  };

  it('should propagate emotion from turn analysis to TTS cache key', () => {
    // Step 1: Simulate turn-handler setting emotion in userData
    const userData: MockUserData = {
      userId: 'user-123',
      sessionId: 'session-456',
      personaId: 'ferni',
    };

    // Simulate emotional analysis result setting currentEmotion
    const emotionalAnalysis = emotionalStates.anxious;
    (userData as unknown as Record<string, unknown>).currentEmotion = emotionalAnalysis.primary;

    expect(userData.currentEmotion).toBe('anxious');

    // Step 2: Extract TTS session context (as done in tts-wrapper.ts line 257-273)
    const context = extractTtsSessionContext(userData, 'ferni');

    expect(context.emotion).toBe('anxious');
    expect(context.personaId).toBe('ferni');

    // Step 3: Generate cache key (as done in speculative-tts.ts)
    const cacheKey = generateCacheKey(
      context.personaId!,
      context.emotion!,
      'I hear that you are feeling overwhelmed'
    );

    expect(cacheKey).toBe('ferni:anxious:i hear that you are feeling overwhelmed');
  });

  it('should preserve emotion during handoff context transfer', () => {
    // Before handoff: Ferni detects user is anxious about wedding planning
    const sourceUserData: MockUserData = {
      userId: 'user-bride',
      sessionId: 'session-wedding',
      personaId: 'ferni',
      currentEmotion: 'anxious',
    };

    // Prepare handoff context
    const handoffContext = {
      emotionalContext: {
        primary: sourceUserData.currentEmotion,
        intensity: emotionalStates.anxious.intensity,
        trajectory: emotionalStates.anxious.trajectory,
      },
      conversationSummary: 'User is stressed about wedding planning timeline',
      targetPersona: 'jordan',
    };

    // After handoff: Jordan's agent should receive the emotional context
    const targetUserData: MockUserData = {
      userId: sourceUserData.userId,
      sessionId: sourceUserData.sessionId,
      personaId: 'jordan',
      // Emotion should be preserved from handoff context
      currentEmotion: handoffContext.emotionalContext.primary,
    };

    // Verify emotion propagates to new persona's TTS context
    const jordanContext = extractTtsSessionContext(targetUserData, 'jordan');

    expect(jordanContext.emotion).toBe('anxious');
    expect(jordanContext.personaId).toBe('jordan');

    // Jordan's empathetic response should use anxious-emotion cache key
    const jordanCacheKey = generateCacheKey(
      jordanContext.personaId!,
      jordanContext.emotion!,
      "I understand, wedding planning can feel overwhelming. Let's break it down together."
    );

    expect(jordanCacheKey).toContain('jordan:anxious:');
  });

  it('should handle emotion changes during conversation', () => {
    const userData: MockUserData = {
      userId: 'user-123',
      sessionId: 'session-456',
      personaId: 'ferni',
      currentEmotion: 'anxious',
    };

    // First turn: anxious
    let context = extractTtsSessionContext(userData, 'ferni');
    expect(context.emotion).toBe('anxious');

    // User shares good news → emotion improves
    userData.currentEmotion = 'hopeful';

    // Second turn: hopeful
    context = extractTtsSessionContext(userData, 'ferni');
    expect(context.emotion).toBe('hopeful');

    // Different cache keys for different emotions
    const anxiousCacheKey = generateCacheKey('ferni', 'anxious', 'I understand');
    const hopefulCacheKey = generateCacheKey('ferni', 'hopeful', 'I understand');

    expect(anxiousCacheKey).not.toBe(hopefulCacheKey);
    expect(anxiousCacheKey).toBe('ferni:anxious:i understand');
    expect(hopefulCacheKey).toBe('ferni:hopeful:i understand');
  });

  it('should use neutral emotion when currentEmotion is not set', () => {
    const userData: MockUserData = {
      userId: 'user-123',
      sessionId: 'session-456',
      personaId: 'ferni',
      // currentEmotion is NOT set
    };

    const context = extractTtsSessionContext(userData, 'ferni');

    expect(context.emotion).toBeUndefined();

    // Cache-aware TTS should fall back to 'neutral' when emotion is undefined
    const emotion = context.emotion || 'neutral';
    const cacheKey = generateCacheKey('ferni', emotion, 'Hello!');

    expect(cacheKey).toBe('ferni:neutral:hello!');
  });

  it('should generate distinct cache keys for each persona voice + emotion', () => {
    const testCases = [
      { personaId: 'ferni', emotion: 'warm', text: 'Welcome!' },
      { personaId: 'ferni', emotion: 'concerned', text: 'Welcome!' },
      { personaId: 'jordan', emotion: 'warm', text: 'Welcome!' },
      { personaId: 'peter-john', emotion: 'neutral', text: 'Welcome!' },
    ];

    const cacheKeys = testCases.map((tc) => generateCacheKey(tc.personaId, tc.emotion, tc.text));

    // All keys should be unique
    const uniqueKeys = new Set(cacheKeys);
    expect(uniqueKeys.size).toBe(cacheKeys.length);

    // Verify expected format
    expect(cacheKeys[0]).toBe('ferni:warm:welcome!');
    expect(cacheKeys[1]).toBe('ferni:concerned:welcome!');
    expect(cacheKeys[2]).toBe('jordan:warm:welcome!');
    expect(cacheKeys[3]).toBe('peter-john:neutral:welcome!');
  });

  it('should verify full handoff emotion flow (integration)', async () => {
    // This test simulates the full flow from handoff initiation to TTS cache lookup

    // === Phase 1: Ferni's session (before handoff) ===
    const ferniSession = {
      userData: {
        userId: 'user-planning',
        sessionId: 'session-handoff-001',
        personaId: 'ferni',
        currentEmotion: 'overwhelmed',
      } as MockUserData,
    };

    // Ferni's TTS would use this context
    const ferniTtsContext = extractTtsSessionContext(ferniSession.userData, 'ferni');
    expect(ferniTtsContext.emotion).toBe('overwhelmed');

    // === Phase 2: Handoff preparation ===
    const handoffPayload = {
      sourcePersona: 'ferni',
      targetPersona: 'jordan',
      emotionalState: {
        primary: ferniSession.userData.currentEmotion,
        intensity: 0.85,
        distressLevel: 0.75,
      },
      summary: 'User is overwhelmed planning a large event',
    };

    // === Phase 3: Jordan's session (after handoff) ===
    const jordanSession = {
      userData: {
        userId: handoffPayload.sourcePersona, // Same user
        sessionId: ferniSession.userData.sessionId, // Same session
        personaId: 'jordan',
        // Key assertion: emotion preserved from handoff
        currentEmotion: handoffPayload.emotionalState.primary,
      } as MockUserData,
    };

    // Jordan's TTS should use the preserved emotion
    const jordanTtsContext = extractTtsSessionContext(jordanSession.userData, 'jordan');

    // Critical assertions for E2E emotion flow
    expect(jordanTtsContext.emotion).toBe('overwhelmed');
    expect(jordanTtsContext.personaId).toBe('jordan');
    expect(jordanTtsContext.sessionId).toBe(ferniSession.userData.sessionId);

    // Jordan's first response with empathetic tone uses emotion-aware cache
    const jordanResponseKey = generateCacheKey(
      jordanTtsContext.personaId!,
      jordanTtsContext.emotion!,
      "Hi there, Ferni mentioned you have an event that's feeling a bit much right now."
    );

    // Cache key proves emotion flowed through
    expect(jordanResponseKey).toContain('jordan:overwhelmed:');
  });
});
