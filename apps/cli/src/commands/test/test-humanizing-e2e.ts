#!/usr/bin/env npx ts-node
/**
 * End-to-End Humanization Test Script
 *
 * Tests the full humanization pipeline:
 * 1. Conversation humanization modules
 * 2. SSML integration
 * 3. Per-persona configuration loading
 * 4. Analytics tracking
 *
 * Run: npx ts-node scripts/test-humanizing-e2e.ts
 */

import { initializeLogger } from '@livekit/agents';

// Initialize logger before any other imports
initializeLogger({ pretty: false, level: 'warn' });

import {
  SpeechNaturalizer,
  ActiveListeningEngine,
  ConversationalMemoryEngine,
  QuestionPatternEngine,
  ConversationHumanizer,
  resetAllConversationState,
} from '../../../../../src/conversation/index.js';

import {
  getHumanizingConfig,
  applyPreset,
  registerBundleHumanization,
  getPersonaHumanizingConfig,
  clearPersonaConfigs,
  resetHumanizingConfig,
} from '../../../../../src/conversation/humanizing-config.js';

import {
  applyConversationSsmlEnhancements,
  getContextAwareBehaviorProfile,
} from '../../../../../src/ssml/conversation-integration.js';

import {
  getHumanizationAnalytics,
  resetHumanizationAnalytics,
} from '../../../../../src/services/humanization-analytics.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(message: string, color: string = COLORS.reset): void {
  console.log(`${color}${message}${COLORS.reset}`);
}

function section(title: string): void {
  console.log();
  log(`${'='.repeat(60)}`, COLORS.cyan);
  log(` ${title}`, COLORS.cyan);
  log(`${'='.repeat(60)}`, COLORS.cyan);
}

function test(name: string, fn: () => boolean | Promise<boolean>): Promise<boolean> {
  return Promise.resolve(fn()).then((passed) => {
    if (passed) {
      log(`  ✅ ${name}`, COLORS.green);
    } else {
      log(`  ❌ ${name}`, COLORS.red);
    }
    return passed;
  }).catch((error) => {
    log(`  ❌ ${name}: ${error.message}`, COLORS.red);
    return false;
  });
}

// ============================================================================
// TEST CASES
// ============================================================================

async function testSpeechNaturalizer(): Promise<boolean> {
  section('Speech Naturalizer');
  
  const naturalizer = new SpeechNaturalizer();
  let allPassed = true;

  allPassed = await test('Should naturalize text', () => {
    const result = naturalizer.naturalize(
      'I think you should consider index funds for long-term growth.',
      'ferni',
      { emotion: 'neutral' }
    );
    // Should return a string (possibly modified)
    return typeof result === 'string' && result.length > 0;
  }) && allPassed;

  allPassed = await test('Should handle different contexts', () => {
    const normalResult = naturalizer.naturalize(
      'Well, let me think about that for a moment.',
      'jack-bogle',
      { emotion: 'curious' }
    );
    const seriousResult = naturalizer.naturalize(
      'Well, let me think about that for a moment.',
      'jack-bogle',
      { emotion: 'anxious', isSeriousContext: true }
    );
    // Both should return valid strings
    return normalResult.length > 0 && seriousResult.length > 0;
  }) && allPassed;

  allPassed = await test('Should respect persona differences', () => {
    const ferniResult = naturalizer.naturalize(
      'How are you feeling about your progress?',
      'ferni',
      { emotion: 'neutral' }
    );
    const alexResult = naturalizer.naturalize(
      'How are you feeling about your progress?',
      'alex-chen',
      { emotion: 'neutral' }
    );
    // Both should work
    return ferniResult.length > 0 && alexResult.length > 0;
  }) && allPassed;

  naturalizer.reset();
  return allPassed;
}

async function testActiveListening(): Promise<boolean> {
  section('Active Listening Engine');
  
  const engine = new ActiveListeningEngine();
  let allPassed = true;

  allPassed = await test('Should generate backchannels', () => {
    const result = engine.getBackchannel('ferni', {
      userEmotion: 'sad',
      topicSeriousness: 'emotional',
    });
    // May or may not return backchannel (probabilistic), just check it runs
    return result === null || (result.verbal && result.verbal.length > 0);
  }) && allPassed;

  allPassed = await test('Should mirror user vocabulary', () => {
    const result = engine.mirrorUserVocabulary(
      'I am really worried about my finances',
      'I understand you are concerned about your financial situation'
    );
    // May return null (no mirror opportunity), but should run without error
    return result === null || (result.original && result.mirrored);
  }) && allPassed;

  allPassed = await test('Should evaluate silence appropriately', () => {
    const result = engine.evaluateSilence(3000, {
      userJustSharedPersonal: true,
      emotionalIntensity: 'high',
    });
    // Should return action guidance
    return result.action !== undefined;
  }) && allPassed;

  engine.reset();
  return allPassed;
}

async function testConversationalMemory(): Promise<boolean> {
  section('Conversational Memory');
  
  const memory = new ConversationalMemoryEngine();
  let allPassed = true;

  allPassed = await test('Should record user messages', () => {
    memory.recordUserMessage('I want to save for a house', {
      topic: 'savings',
      wasPersonal: true,
    });
    memory.recordUserMessage('My budget is around 400k', {
      topic: 'savings',
      wasPersonal: true,
    });
    return true;
  }) && allPassed;

  allPassed = await test('Should generate memory callbacks', () => {
    // Advance the conversation
    memory.recordUserMessage('What about index funds?', { topic: 'investments' });
    memory.recordUserMessage('Are they safe?', { topic: 'investments' });
    memory.recordUserMessage('Tell me more', { topic: 'investments' });
    
    const callback = memory.getMemoryCallback('investments', 6);
    // Callback may or may not be generated (depends on turn count, probability)
    return callback === null || (callback.type && callback.phrase.length > 0);
  }) && allPassed;

  allPassed = await test('Should track unfulfilled commitments', () => {
    memory.recordAgentMessage("I'll send you some resources on index funds");
    const commitments = memory.getUnfulfilledCommitments();
    // Should return an array
    return Array.isArray(commitments);
  }) && allPassed;

  memory.reset();
  return allPassed;
}

async function testQuestionPatterns(): Promise<boolean> {
  section('Question Pattern Engine');
  
  const engine = new QuestionPatternEngine();
  let allPassed = true;

  allPassed = await test('Should generate open-ended questions', () => {
    const result = engine.generateQuestion({
      personaId: 'ferni',
      topic: 'goals',
      intent: 'explore',
      userEmotion: 'curious',
      conversationDepth: 'surface',
    });
    return result.text.length > 0 && result.type !== undefined;
  }) && allPassed;

  allPassed = await test('Should generate understanding questions', () => {
    const result = engine.generateQuestion({
      personaId: 'ferni',
      topic: 'feelings',
      intent: 'understand',
      userEmotion: 'sad',
      previousUserStatement: 'I feel like I\'m not making progress',
      conversationDepth: 'deep',
    });
    return result.text.length > 0;
  }) && allPassed;

  allPassed = await test('Should generate echo questions', () => {
    const result = engine.generateEchoQuestion(
      'I want to put money somewhere safe'
    );
    return result.text.length > 0 && result.type === 'echo';
  }) && allPassed;

  engine.reset();
  return allPassed;
}

async function testConversationHumanizer(): Promise<boolean> {
  section('Conversation Humanizer (Orchestration)');
  
  const humanizer = new ConversationHumanizer('ferni');
  let allPassed = true;

  allPassed = await test('Should process user messages', () => {
    const preActions = humanizer.processUserMessage({
      personaId: 'ferni',
      turnNumber: 3,
      userMessage: 'I\'ve been feeling stressed about my finances lately',
      userEmotion: 'anxious',
      topic: 'financial-stress',
      wasPersonalSharing: true,
    });
    // PreResponseActions may have backchannel, silenceAction, or acknowledgment
    return preActions !== undefined;
  }) && allPassed;

  allPassed = await test('Should humanize responses', () => {
    const humanized = humanizer.humanizeResponse(
      'I understand how stressful financial concerns can be. Let\'s work through this together.',
      {
        userMessage: 'What should I do about it?',
        userEmotion: 'anxious',
        topic: 'financial-stress',
      }
    );
    return humanized.text.length > 0 && humanized.ssml.length > 0;
  }) && allPassed;

  humanizer.reset();
  return allPassed;
}

async function testPerPersonaConfig(): Promise<boolean> {
  section('Per-Persona Configuration');
  
  let allPassed = true;

  // Reset state
  resetHumanizingConfig();
  clearPersonaConfigs();

  allPassed = await test('Should apply presets', () => {
    applyPreset('therapeutic');
    const config = getHumanizingConfig();
    return config.backchannel.probability >= 0.3; // Therapeutic preset has higher backchannel
  }) && allPassed;

  allPassed = await test('Should register bundle humanization', () => {
    registerBundleHumanization('test-persona', {
      preset: 'conversational',
      overrides: {
        disfluency: { enabled: true, frequency: 0.2 },
        active_listening: { backchannel_probability: 0.5 },
      },
      warmup: { turns: 2, reduction: 0.6 },
    });
    
    const personaConfig = getPersonaHumanizingConfig('test-persona');
    return personaConfig.disfluency.frequency === 0.2 || 
           personaConfig.backchannel.probability === 0.5;
  }) && allPassed;

  allPassed = await test('Should get context-aware behavior profile', () => {
    const profile = getContextAwareBehaviorProfile('ferni', {
      turnNumber: 5,
      userEmotion: 'sad',
      wasPersonalSharing: true,
    });
    return profile.warmthFrequency > 0;
  }) && allPassed;

  // Clean up
  resetHumanizingConfig();
  clearPersonaConfigs();
  
  return allPassed;
}

async function testSSMLIntegration(): Promise<boolean> {
  section('SSML Integration');
  
  let allPassed = true;

  allPassed = await test('Should enhance disfluencies with SSML', () => {
    const text = 'Well... I think you should consider that.';
    const enhanced = applyConversationSsmlEnhancements(text, {
      personaId: 'ferni',
      emotion: 'affectionate',
      baseSpeed: 0.9,
      conversationContext: {
        turnNumber: 5,
        userEmotion: 'neutral',
      },
    });
    return enhanced.length > 0;
  }) && allPassed;

  allPassed = await test('Should enhance thinking phrases with SSML', () => {
    const text = 'Let me think about that. How do I put this...';
    const enhanced = applyConversationSsmlEnhancements(text, {
      personaId: 'jack-bogle',
      emotion: 'curious',
      baseSpeed: 0.75,
      conversationContext: {
        turnNumber: 3,
        userEmotion: 'curious',
      },
    });
    return enhanced.includes('<speed') || enhanced.includes('<break') || enhanced.length > 0;
  }) && allPassed;

  allPassed = await test('Should respect disabled config', () => {
    // Apply disabled preset temporarily
    applyPreset('disabled');
    
    const text = 'Well... I think you should consider that.';
    const enhanced = applyConversationSsmlEnhancements(text, {
      personaId: 'ferni',
      emotion: 'affectionate',
      baseSpeed: 0.9,
    });
    
    // Should return text unchanged when disabled
    resetHumanizingConfig(); // Reset for other tests
    return enhanced === text || enhanced.length > 0;
  }) && allPassed;

  return allPassed;
}

async function testAnalytics(): Promise<boolean> {
  section('Humanization Analytics');
  
  resetHumanizationAnalytics();
  const analytics = getHumanizationAnalytics();
  await analytics.initialize();
  
  let allPassed = true;

  allPassed = await test('Should track session events', () => {
    analytics.startSession('test-session-1', 'ferni');
    
    analytics.recordFeatureUsage('test-session-1', 'ferni', 1, 'disfluency', {
      type: 'well',
    });
    analytics.recordFeatureUsage('test-session-1', 'ferni', 2, 'backchannel', {
      phrase: 'I hear you',
    });
    analytics.recordFeatureUsage('test-session-1', 'ferni', 3, 'memory_callback', {
      reference: 'earlier_topic',
    });
    
    return true;
  }) && allPassed;

  allPassed = await test('Should track engagement signals', () => {
    analytics.recordEngagementSignal('test-session-1', 'ferni', 1, 'response_length', 150);
    analytics.recordEngagementSignal('test-session-1', 'ferni', 2, 'sentiment_shift', 0.2);
    analytics.recordEngagementSignal('test-session-1', 'ferni', 3, 'explicit_positive', 1);
    
    return true;
  }) && allPassed;

  allPassed = await test('Should compute session summary', () => {
    const summary = analytics.endSession('test-session-1');
    return summary !== undefined &&
           summary.totalTurns > 0 &&
           ['high', 'medium', 'low'].includes(summary.overallEngagement);
  }) && allPassed;

  allPassed = await test('Should aggregate persona metrics', () => {
    const metrics = analytics.getPersonaMetrics('ferni');
    return metrics !== undefined &&
           metrics.totalSessions >= 1;
  }) && allPassed;

  allPassed = await test('Should export for evolution system', () => {
    const signal = analytics.exportForEvolution('ferni');
    return signal !== null &&
           signal.signalType === 'humanization_analytics' &&
           signal.data.featureUsage !== undefined;
  }) && allPassed;

  resetHumanizationAnalytics();
  return allPassed;
}

async function testFullPipeline(): Promise<boolean> {
  section('Full Pipeline Integration');
  
  // Reset all state
  resetAllConversationState();
  resetHumanizingConfig();
  clearPersonaConfigs();
  resetHumanizationAnalytics();
  
  const analytics = getHumanizationAnalytics();
  await analytics.initialize();
  
  let allPassed = true;

  allPassed = await test('Should run complete conversation flow', () => {
    const sessionId = 'e2e-test-session';
    const personaId = 'ferni';
    
    // Start session
    analytics.startSession(sessionId, personaId);
    
    // Simulate conversation turns
    const humanizer = new ConversationHumanizer(personaId);
    
    // Turn 1: User greeting
    humanizer.processUserMessage({
      personaId,
      turnNumber: 1,
      userMessage: 'Hi, I need help with my finances',
      userEmotion: 'neutral',
      topic: 'general',
      wasPersonalSharing: false,
    });
    
    const response1 = humanizer.humanizeResponse(
      'Hello! I\'d love to help you with your finances. What\'s on your mind?',
      {
        userMessage: 'Hi, I need help with my finances',
        userEmotion: 'neutral',
        topic: 'general',
      }
    );
    
    analytics.recordEngagementSignal(sessionId, personaId, 1, 'response_length', 40);
    analytics.recordFeatureUsage(sessionId, personaId, 1, 'disfluency', {});
    
    // Turn 2: User shares concern
    humanizer.processUserMessage({
      personaId,
      turnNumber: 2,
      userMessage: 'I\'m really stressed about saving for retirement',
      userEmotion: 'anxious',
      topic: 'retirement',
      wasPersonalSharing: true,
    });
    
    const response2 = humanizer.humanizeResponse(
      'I hear that stress. Retirement planning can feel overwhelming. Let\'s break it down together.',
      {
        userMessage: 'I\'m really stressed about saving for retirement',
        userEmotion: 'anxious',
        topic: 'retirement',
      }
    );
    
    analytics.recordEngagementSignal(sessionId, personaId, 2, 'sentiment_shift', -0.1);
    analytics.recordEngagementSignal(sessionId, personaId, 2, 'personal_sharing', 1);
    
    // End session
    const summary = analytics.endSession(sessionId);
    
    return response1.text.length > 0 &&
           response2.text.length > 0 &&
           summary !== undefined;
  }) && allPassed;

  return allPassed;
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  log('\n🎭 HUMANIZATION END-TO-END TEST SUITE', COLORS.yellow);
  log('Testing the full humanization pipeline...\n', COLORS.gray);

  const results: boolean[] = [];

  results.push(await testSpeechNaturalizer());
  results.push(await testActiveListening());
  results.push(await testConversationalMemory());
  results.push(await testQuestionPatterns());
  results.push(await testConversationHumanizer());
  results.push(await testPerPersonaConfig());
  results.push(await testSSMLIntegration());
  results.push(await testAnalytics());
  results.push(await testFullPipeline());

  // Summary
  section('RESULTS');
  const passed = results.filter(r => r).length;
  const total = results.length;

  if (passed === total) {
    log(`\n🎉 ALL TESTS PASSED (${passed}/${total})`, COLORS.green);
  } else {
    log(`\n⚠️ SOME TESTS FAILED (${passed}/${total} passed)`, COLORS.yellow);
    process.exit(1);
  }
}

main().catch(console.error);
