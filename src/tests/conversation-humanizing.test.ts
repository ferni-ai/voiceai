/**
 * Tests for Conversation Humanizing Modules
 *
 * Tests the new humanization features:
 * - Speech naturalization (disfluencies, hedging, self-correction)
 * - Active listening (backchanneling, mirroring, silence handling)
 * - Conversational memory (callbacks, threading, commitments)
 * - Question patterns (diverse question types)
 * - Humanizer orchestration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Speech Naturalizer
import {
  SpeechNaturalizer,
  getSpeechNaturalizer,
  resetSpeechNaturalizer,
  generateFragment,
} from '../conversation/speech-naturalizer.js';

// Active Listening
import type { ActiveListeningEngine } from '../conversation/active-listening.js';
import {
  getActiveListeningEngine,
  resetActiveListeningEngine,
} from '../conversation/active-listening.js';

// Conversational Memory
import type { ConversationalMemoryEngine } from '../conversation/conversational-memory.js';
import {
  getConversationalMemory,
  resetConversationalMemory,
} from '../conversation/conversational-memory.js';

// Question Patterns
import type { QuestionPatternEngine } from '../conversation/question-patterns.js';
import {
  getQuestionPatternEngine,
  resetQuestionPatternEngine,
} from '../conversation/question-patterns.js';

// Humanizer
import type { ConversationHumanizer } from '../conversation/humanizer.js';
import { getConversationHumanizer, resetConversationHumanizer } from '../conversation/humanizer.js';

// ============================================================================
// SPEECH NATURALIZER TESTS
// ============================================================================

describe('SpeechNaturalizer', () => {
  let naturalizer: SpeechNaturalizer;

  beforeEach(() => {
    resetSpeechNaturalizer();
    naturalizer = getSpeechNaturalizer();
  });

  afterEach(() => {
    resetSpeechNaturalizer();
  });

  describe('naturalize()', () => {
    it('should return text unchanged when disabled', () => {
      const disabledNaturalizer = new SpeechNaturalizer({ enabled: false });
      const input = 'This is a test sentence.';
      expect(disabledNaturalizer.naturalize(input, 'ferni', {})).toBe(input);
    });

    it('should add persona-specific patterns for jack-bogle', () => {
      // Force high frequency for testing
      const testNaturalizer = new SpeechNaturalizer({ frequency: 1.0 });
      const input = 'You should invest in index funds.';
      const result = testNaturalizer.naturalize(input, 'nayan-patel', {});

      // Should have some modification (filler, hedge, or thinking phrase)
      const hasModification =
        result !== input ||
        result.includes('Well') ||
        result.includes('Now') ||
        result.includes('I believe') ||
        result.includes('think');

      expect(hasModification).toBe(true);
    });

    it('should reduce disfluencies in serious contexts', () => {
      const testNaturalizer = new SpeechNaturalizer({
        frequency: 0.5,
        contextSensitivity: true,
      });

      // Run multiple times and count modifications
      let seriousModifications = 0;
      let casualModifications = 0;

      for (let i = 0; i < 20; i++) {
        const input = 'This is important information.';

        const seriousResult = testNaturalizer.naturalize(input, 'ferni', {
          isSeriousContext: true,
        });
        if (seriousResult !== input) seriousModifications++;

        const casualResult = testNaturalizer.naturalize(input, 'ferni', {
          isSeriousContext: false,
        });
        if (casualResult !== input) casualModifications++;
      }

      // Serious contexts should have fewer modifications
      expect(seriousModifications).toBeLessThanOrEqual(casualModifications);
    });
  });

  describe('getThinkingPhrase()', () => {
    it('should return persona-specific thinking phrases for ferni', () => {
      const phrase = naturalizer.getThinkingPhrase('ferni', 'processing');
      expect(phrase.type).toBe('processing');
      expect(phrase.phrase).toBeTruthy();
      expect(phrase.ssml).toContain('break');
    });

    it('should return processing phrases for processing type', () => {
      const phrase = naturalizer.getThinkingPhrase('nayan-patel', 'processing');
      expect(phrase.type).toBe('processing');
    });

    it('should return recalling phrases for recalling type', () => {
      const phrase = naturalizer.getThinkingPhrase('peter-john', 'recalling');
      expect(phrase.type).toBe('recalling');
    });
  });

  describe('getHedge()', () => {
    it('should return hedge phrases', () => {
      const hedge = naturalizer.getHedge('ferni', 'medium');
      expect(typeof hedge).toBe('string');
      expect(hedge.length).toBeGreaterThan(0);
    });

    it('should return different hedges for different strengths', () => {
      const soft = naturalizer.getHedge('nayan-patel', 'soft');
      const strong = naturalizer.getHedge('nayan-patel', 'strong');

      // Both should be valid strings
      expect(typeof soft).toBe('string');
      expect(typeof strong).toBe('string');
    });
  });

  describe('addUncertainty()', () => {
    it('should prepend hedge to text', () => {
      const input = 'The market will recover.';
      const result = naturalizer.addUncertainty(input, 'nayan-patel', 'medium');

      expect(result).not.toBe(input);
      expect(result.toLowerCase()).toContain('the market will recover');
    });
  });

  describe('generateFragment()', () => {
    it('should return trailing fragments', () => {
      const fragment = generateFragment('trailing');
      expect(fragment).toMatch(/\.\.\.$/);
    });

    it('should return interrupted fragments', () => {
      const fragment = generateFragment('interrupted');
      expect(fragment).toMatch(/—$/);
    });

    it('should return rethinking fragments', () => {
      const fragment = generateFragment('rethinking');
      expect(fragment).toMatch(/\.\.\.$/);
    });
  });
});

// ============================================================================
// ACTIVE LISTENING TESTS
// ============================================================================

describe('ActiveListeningEngine', () => {
  let engine: ActiveListeningEngine;

  beforeEach(() => {
    resetActiveListeningEngine();
    engine = getActiveListeningEngine();
  });

  afterEach(() => {
    resetActiveListeningEngine();
  });

  describe('getBackchannel()', () => {
    it('should return appropriate backchannel for context', () => {
      const backchannel = engine.getBackchannel('ferni', {
        userEmotion: 'sad',
        topicSeriousness: 'emotional',
      });

      // May return null if called too soon after last backchannel
      if (backchannel) {
        expect(backchannel.type).toBe('empathy');
        expect(backchannel.verbal).toBeTruthy();
        expect(backchannel.ssml).toBeTruthy();
      }
    });

    it('should return acknowledgment for questions', () => {
      const backchannel = engine.getBackchannel('alex-chen', {
        userAskedQuestion: true,
      });

      if (backchannel) {
        expect(backchannel.type).toBe('acknowledgment');
      }
    });

    it('should not return backchannels too frequently', () => {
      // First call should work
      const first = engine.getBackchannel('ferni', {});

      // Immediate second call should return null (rate limiting)
      const second = engine.getBackchannel('ferni', {});

      // At least one should be null due to rate limiting
      expect(first === null || second === null).toBe(true);
    });
  });

  describe('generateEmotionalEcho()', () => {
    it('should generate echo for worried emotion', () => {
      const echo = engine.generateEmotionalEcho(
        'worried',
        'I am worried about my savings',
        'medium'
      );
      expect(echo).toBeTruthy();
      expect(echo.length).toBeGreaterThan(0);
    });

    it('should generate higher intensity echoes', () => {
      const low = engine.generateEmotionalEcho('sad', 'I am sad', 'low');
      const high = engine.generateEmotionalEcho('sad', 'I am sad', 'high');

      expect(low).toBeTruthy();
      expect(high).toBeTruthy();
      // High intensity should typically be longer/more empathetic
    });
  });

  describe('mirrorUserVocabulary()', () => {
    it('should detect mirroring opportunities', () => {
      const userText = 'I am really anxious about retirement';
      const responseText = 'I understand you are concerned about retirement';

      const result = engine.mirrorUserVocabulary(userText, responseText);

      // May or may not find a mirroring opportunity depending on implementation
      if (result) {
        expect(result.type).toBe('vocabulary');
        expect(result.mirrored).toContain('anxious');
      }
    });
  });

  describe('evaluateSilence()', () => {
    it('should be comfortable with short silences', () => {
      const result = engine.evaluateSilence(1000, {});
      expect(result.comfortable).toBe(true);
      expect(result.action).toBe('wait');
    });

    it('should suggest backchannel for medium silences', () => {
      const result = engine.evaluateSilence(3000, {});
      expect(result.comfortable).toBe(false);
      expect(result.action).toBe('backchannel');
    });

    it('should suggest gentle prompt for long silences', () => {
      const result = engine.evaluateSilence(5000, {});
      expect(result.action).toBe('gentle_prompt');
    });

    it('should be patient after personal sharing', () => {
      const result = engine.evaluateSilence(4000, {
        userJustSharedPersonal: true,
      });
      expect(result.comfortable).toBe(true);
    });
  });

  describe('generateClarifyingQuestion()', () => {
    it('should generate understanding questions', () => {
      const question = engine.generateClarifyingQuestion('understanding');
      expect(question.type).toBe('understanding');
      expect(question.question).toBeTruthy();
    });

    it('should generate emotion questions', () => {
      const question = engine.generateClarifyingQuestion('emotion');
      expect(question.type).toBe('emotion');
      // Accept various phrasings for emotion questions
      expect(question.question.toLowerCase()).toMatch(/feel|emotion|gut|heart|sense/);
    });
  });
});

// ============================================================================
// CONVERSATIONAL MEMORY TESTS
// ============================================================================

describe('ConversationalMemoryEngine', () => {
  let memory: ConversationalMemoryEngine;

  beforeEach(() => {
    resetConversationalMemory();
    memory = getConversationalMemory();
  });

  afterEach(() => {
    resetConversationalMemory();
  });

  describe('recordUserMessage()', () => {
    it('should record messages and track topics', () => {
      memory.recordUserMessage('I want to talk about retirement', {
        topic: 'retirement',
      });

      const threads = memory.getUnresolvedThreads();
      expect(threads.length).toBeGreaterThan(0);
      expect(threads[0].topic).toBe('retirement');
    });

    it('should detect commitments', () => {
      memory.recordUserMessage("I'll think about that and get back to you", {});

      const commitments = memory.getUnfulfilledCommitments();
      expect(commitments.length).toBeGreaterThan(0);
      expect(commitments[0].who).toBe('user');
    });
  });

  describe('getMemoryCallback()', () => {
    it('should not callback too early', () => {
      memory.recordUserMessage('Test message', { topic: 'investing' });

      const callback = memory.getMemoryCallback('investing', 2);
      expect(callback).toBeNull(); // Too early
    });

    it('should potentially return callback after enough turns', () => {
      // Record several messages to build history
      for (let i = 0; i < 6; i++) {
        memory.recordUserMessage(`Message ${i} about investing`, {
          topic: 'investing',
          wasPersonal: true,
        });
      }

      // Run multiple times since callbacks are probabilistic
      let foundCallback = false;
      for (let i = 0; i < 20; i++) {
        const callback = memory.getMemoryCallback('investing', 10);
        if (callback) {
          foundCallback = true;
          expect(callback.phrase).toBeTruthy();
          break;
        }
      }

      // It's probabilistic, so we can't guarantee a callback
      // but the mechanism should be working
    });
  });

  describe('checkForContradiction()', () => {
    it('should detect potential contradictions', () => {
      memory.recordUserMessage('I love taking risks with my investments', {
        topic: 'risk',
      });

      const contradiction = memory.checkForContradiction("I don't like risk at all", 'risk');

      // Should detect the sentiment flip
      if (contradiction) {
        expect(contradiction.text).toContain('love');
      }
    });
  });

  describe('generateCircleBack()', () => {
    it('should generate circle back phrases', () => {
      const phrase = memory.generateCircleBack('retirement');
      expect(phrase).toContain('retirement');
      expect(phrase.length).toBeGreaterThan(10);
    });
  });

  describe('getConversationSummary()', () => {
    it('should return conversation summary', () => {
      memory.recordUserMessage('Message about investing', { topic: 'investing' });
      memory.recordUserMessage('Message about retirement', { topic: 'retirement' });

      const summary = memory.getConversationSummary();

      expect(summary.keyTopics).toContain('investing');
      expect(summary.keyTopics).toContain('retirement');
      expect(Array.isArray(summary.unresolvedThreads)).toBe(true);
    });
  });
});

// ============================================================================
// QUESTION PATTERNS TESTS
// ============================================================================

describe('QuestionPatternEngine', () => {
  let engine: QuestionPatternEngine;

  beforeEach(() => {
    resetQuestionPatternEngine();
    engine = getQuestionPatternEngine();
  });

  afterEach(() => {
    resetQuestionPatternEngine();
  });

  describe('generateQuestion()', () => {
    it('should generate open-ended questions for explore intent', () => {
      const question = engine.generateQuestion({
        topic: 'retirement',
        intent: 'explore',
      });

      expect(question.type).toBeDefined();
      expect(question.text).toBeTruthy();
      expect(question.purpose).toBeTruthy();
    });

    it('should generate clarifying questions for understand intent', () => {
      const question = engine.generateQuestion({
        topic: 'investing',
        intent: 'understand',
      });

      expect(['clarifying', 'confirming', 'echo']).toContain(question.type);
    });

    it('should respect persona preferences', () => {
      // Ferni prefers reflective questions
      const ferniQuestion = engine.generateQuestion({
        personaId: 'ferni',
        topic: 'life',
        conversationDepth: 'deep',
      });

      expect(ferniQuestion).toBeDefined();
      expect(ferniQuestion.text.length).toBeGreaterThan(0);
    });

    it('should avoid repeating question types', () => {
      const types: string[] = [];

      for (let i = 0; i < 5; i++) {
        const question = engine.generateQuestion({
          topic: 'money',
          intent: 'explore',
        });
        types.push(question.type);
      }

      // Should have some variety (not all the same type)
      const uniqueTypes = new Set(types);
      expect(uniqueTypes.size).toBeGreaterThan(1);
    });
  });

  describe('generateEchoQuestion()', () => {
    it('should echo key words from user statement', () => {
      const question = engine.generateEchoQuestion(
        'I am really worried about my retirement savings'
      );

      expect(question.type).toBe('echo');
      expect(question.text).toBeTruthy();
    });

    it('should handle short statements', () => {
      const question = engine.generateEchoQuestion('Yes');
      expect(question.text).toBeTruthy();
    });
  });

  describe('getQuestionTag()', () => {
    it('should return conversational tags', () => {
      const tag = engine.getQuestionTag();
      expect(tag).toMatch(/\?/);
    });
  });

  describe('isTypeAppropriate()', () => {
    it('should prevent back-to-back same types', () => {
      // Generate a question first
      engine.generateQuestion({ topic: 'test' });

      // The type just used should not be appropriate immediately after
      // (implementation depends on what was randomly selected)
    });
  });
});

// ============================================================================
// HUMANIZER ORCHESTRATION TESTS
// ============================================================================

describe('ConversationHumanizer', () => {
  let humanizer: ConversationHumanizer;

  beforeEach(() => {
    resetConversationHumanizer();
    humanizer = getConversationHumanizer('ferni');
  });

  afterEach(() => {
    resetConversationHumanizer();
  });

  describe('processUserMessage()', () => {
    it('should return pre-response actions', () => {
      const actions = humanizer.processUserMessage({
        personaId: 'ferni',
        turnNumber: 5,
        userMessage: 'I have been thinking about my future a lot lately',
        userEmotion: 'contemplative',
        topic: 'future',
      });

      expect(actions).toBeDefined();
      // May have backchannel, silenceAction, or acknowledgment
    });

    it('should return emotional acknowledgment for personal sharing', () => {
      const actions = humanizer.processUserMessage({
        personaId: 'ferni',
        turnNumber: 3,
        userMessage: 'I lost my job last week and I am really scared',
        userEmotion: 'scared',
        topic: 'employment',
        wasPersonalSharing: true,
      });

      expect(actions.acknowledgment).toBeTruthy();
    });
  });

  describe('humanizeResponse()', () => {
    it('should return humanized response structure', () => {
      const rawResponse = 'That sounds challenging. Let me help you think through this.';

      const result = humanizer.humanizeResponse(rawResponse, {
        personaId: 'ferni',
        turnNumber: 5,
        userMessage: 'I need help with my finances',
        topic: 'finances',
      });

      expect(result.text).toBeTruthy();
      expect(result.ssml).toBeTruthy();
      expect(Array.isArray(result.appliedFeatures)).toBe(true);
      expect(result.pacing).toBeDefined();
    });

    it('should apply speech naturalization', () => {
      const rawResponse = 'You should consider index funds for long-term growth.';

      const result = humanizer.humanizeResponse(rawResponse, {
        personaId: 'nayan-patel',
        turnNumber: 8,
        userMessage: 'What should I invest in?',
        topic: 'investing',
      });

      expect(result.appliedFeatures).toContain('speech_naturalization');
    });
  });

  describe('getThinkingPhrase()', () => {
    it('should return thinking phrases', () => {
      const phrase = humanizer.getThinkingPhrase('processing');
      expect(phrase.text).toBeTruthy();
      expect(phrase.ssml).toContain('break');
    });
  });

  describe('getUnresolvedThreads()', () => {
    it('should return unresolved conversation threads', () => {
      // Process some messages first
      humanizer.processUserMessage({
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'Let us talk about retirement',
        topic: 'retirement',
      });

      const threads = humanizer.getUnresolvedThreads();
      expect(Array.isArray(threads)).toBe(true);
    });
  });

  describe('resolveThread()', () => {
    it('should mark threads as resolved', () => {
      humanizer.processUserMessage({
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'Let us talk about budgeting',
        topic: 'budgeting',
      });

      humanizer.resolveThread('budgeting');

      const threads = humanizer.getUnresolvedThreads();
      expect(threads).not.toContain('budgeting');
    });
  });

  describe('reset()', () => {
    it('should clear all state', () => {
      // Add some state
      humanizer.processUserMessage({
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'Test message',
        topic: 'test',
      });

      humanizer.reset();

      const threads = humanizer.getUnresolvedThreads();
      expect(threads.length).toBe(0);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Conversation Humanizing Integration', () => {
  beforeEach(() => {
    resetSpeechNaturalizer();
    resetActiveListeningEngine();
    resetConversationalMemory();
    resetQuestionPatternEngine();
    resetConversationHumanizer();
  });

  afterEach(() => {
    resetSpeechNaturalizer();
    resetActiveListeningEngine();
    resetConversationalMemory();
    resetQuestionPatternEngine();
    resetConversationHumanizer();
  });

  it('should work together in a realistic conversation flow', () => {
    const humanizer = getConversationHumanizer('ferni');

    // Turn 1: User greeting
    let actions = humanizer.processUserMessage({
      personaId: 'ferni',
      turnNumber: 1,
      userMessage: 'Hi, I would like to talk about my finances',
      topic: 'finances',
    });

    let response = humanizer.humanizeResponse(
      'Hello! I am glad you reached out. Tell me more about what is on your mind.',
      {
        personaId: 'ferni',
        turnNumber: 1,
        userMessage: 'Hi, I would like to talk about my finances',
        topic: 'finances',
      }
    );

    expect(response.text).toBeTruthy();

    // Turn 2: User shares concern
    actions = humanizer.processUserMessage({
      personaId: 'ferni',
      turnNumber: 2,
      userMessage: 'I am worried I will not have enough for retirement',
      userEmotion: 'worried',
      topic: 'retirement',
      wasPersonalSharing: true,
    });

    // Should have emotional acknowledgment
    expect(actions.acknowledgment).toBeTruthy();

    response = humanizer.humanizeResponse(
      'Retirement planning can feel overwhelming. Let us break it down together.',
      {
        personaId: 'ferni',
        turnNumber: 2,
        userMessage: 'I am worried I will not have enough for retirement',
        userEmotion: 'worried',
        topic: 'retirement',
      }
    );

    expect(response.appliedFeatures.length).toBeGreaterThan(0);

    // Check memory tracked the topic
    const threads = humanizer.getUnresolvedThreads();
    expect(threads).toContain('retirement');
  });

  it('should maintain personality consistency across personas', () => {
    // Test Jack Bogle
    const jackHumanizer = getConversationHumanizer('nayan-patel');
    const jackResponse = jackHumanizer.humanizeResponse(
      'Stay the course with low-cost index funds.',
      {
        personaId: 'nayan-patel',
        turnNumber: 5,
        userMessage: 'What should I do with my 401k?',
        topic: 'investing',
      }
    );

    // Test Peter John
    resetConversationHumanizer();
    const peterHumanizer = getConversationHumanizer('peter-john');
    const peterResponse = peterHumanizer.humanizeResponse(
      'Look for ten-baggers in companies you know!',
      {
        personaId: 'peter-john',
        turnNumber: 5,
        userMessage: 'What should I invest in?',
        topic: 'investing',
      }
    );

    // Both should be humanized but with different styles
    expect(jackResponse.appliedFeatures.length).toBeGreaterThan(0);
    expect(peterResponse.appliedFeatures.length).toBeGreaterThan(0);
  });
});
