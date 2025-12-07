#!/usr/bin/env npx tsx
/**
 * Humanization Validation Script
 *
 * Validates that all humanization modules are properly configured and wired.
 * Run this script to ensure the humanization pipeline is working correctly.
 *
 * Usage:
 *   npx tsx scripts/validate-humanization.ts
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - One or more checks failed
 *
 * @module scripts/validate-humanization
 */

import { getLogger } from '../src/utils/safe-logger.js';

// Type for validation check
interface ValidationCheck {
  name: string;
  fn: () => Promise<ValidationResult> | ValidationResult;
}

interface ValidationResult {
  success: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

// Store results
const results: Array<{ name: string; result: ValidationResult }> = [];

// Colored output helpers
const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

// ============================================================================
// VALIDATION CHECKS
// ============================================================================

const checks: ValidationCheck[] = [
  // Check 1: Speech Naturalizer
  {
    name: 'SpeechNaturalizer singleton',
    fn: async () => {
      const { getSpeechNaturalizer } = await import('../src/conversation/speech-naturalizer.js');
      const naturalizer = getSpeechNaturalizer();

      if (!naturalizer) {
        return { success: false, message: 'getSpeechNaturalizer() returned null/undefined' };
      }

      // Verify key methods exist
      const methods = ['naturalize', 'getThinkingPhrase', 'getHedge'];
      const missing = methods.filter((m) => typeof (naturalizer as any)[m] !== 'function');

      if (missing.length > 0) {
        return { success: false, message: `Missing methods: ${missing.join(', ')}` };
      }

      // Test naturalization
      const testText = 'This is a test sentence.';
      const result = naturalizer.naturalize(testText, 'ferni', {});

      if (typeof result !== 'string') {
        return { success: false, message: 'naturalize() did not return a string' };
      }

      return { success: true, details: { methodCount: methods.length } };
    },
  },

  // Check 2: Active Listening Engine
  {
    name: 'ActiveListeningEngine singleton',
    fn: async () => {
      const { getActiveListeningEngine } = await import('../src/conversation/active-listening.js');
      const engine = getActiveListeningEngine();

      if (!engine) {
        return { success: false, message: 'getActiveListeningEngine() returned null/undefined' };
      }

      // Verify key methods exist
      const methods = ['getBackchannel', 'mirrorUserVocabulary', 'getGentlePrompt'];
      const missing = methods.filter((m) => typeof (engine as any)[m] !== 'function');

      if (missing.length > 0) {
        return { success: false, message: `Missing methods: ${missing.join(', ')}` };
      }

      // Test backchannel generation
      const backchannel = engine.getBackchannel('ferni', {
        userEmotion: 'neutral',
        topicSeriousness: 'casual',
      });

      if (!backchannel || !backchannel.verbal) {
        return { success: false, message: 'generateBackchannel() returned invalid result' };
      }

      return { success: true, details: { methodCount: methods.length } };
    },
  },

  // Check 3: Conversational Memory
  {
    name: 'ConversationalMemory singleton',
    fn: async () => {
      const { getConversationalMemory } = await import('../src/conversation/conversational-memory.js');
      const memory = getConversationalMemory();

      if (!memory) {
        return { success: false, message: 'getConversationalMemory() returned null/undefined' };
      }

      // Verify key methods
      const methods = ['recordUserMessage', 'getMemoryCallback', 'getUnresolvedThreads'];
      const missing = methods.filter((m) => typeof (memory as any)[m] !== 'function');

      if (missing.length > 0) {
        return { success: false, message: `Missing methods: ${missing.join(', ')}` };
      }

      return { success: true, details: { methodCount: methods.length } };
    },
  },

  // Check 4: Question Pattern Engine
  {
    name: 'QuestionPatternEngine singleton',
    fn: async () => {
      const { getQuestionPatternEngine } = await import('../src/conversation/question-patterns.js');
      const engine = getQuestionPatternEngine();

      if (!engine) {
        return { success: false, message: 'getQuestionPatternEngine() returned null/undefined' };
      }

      // Test question generation
      const question = engine.generateQuestion('ferni', 'finances', 'curiosity');

      if (!question || !question.text) {
        return { success: false, message: 'generateQuestion() returned invalid result' };
      }

      return { success: true };
    },
  },

  // Check 5: Conversation Humanizer (orchestrator)
  {
    name: 'ConversationHumanizer for each persona',
    fn: async () => {
      const { getConversationHumanizer, resetConversationHumanizer } = await import(
        '../src/conversation/humanizer.js'
      );

      const personas = ['ferni', 'nayan-patel', 'peter-john', 'maya-santos', 'alex-chen', 'jordan-taylor'];
      const failures: string[] = [];

      for (const personaId of personas) {
        resetConversationHumanizer();

        try {
          const humanizer = getConversationHumanizer(personaId);

          if (!humanizer) {
            failures.push(`${personaId}: humanizer is null`);
            continue;
          }

          // Test humanization
          const result = humanizer.humanizeResponse('Test response', {
            personaId,
            turnNumber: 1,
            userMessage: 'Test message',
          });

          if (!result || !result.text) {
            failures.push(`${personaId}: humanizeResponse returned invalid result`);
          }
        } catch (err) {
          failures.push(`${personaId}: ${err}`);
        }
      }

      if (failures.length > 0) {
        return { success: false, message: failures.join('; ') };
      }

      return { success: true, details: { personasTested: personas.length } };
    },
  },

  // Check 6: Humanizing Config
  {
    name: 'HumanizingConfig loads correctly',
    fn: async () => {
      const { getHumanizingConfig } = await import('../src/conversation/humanizing-config.js');
      const config = getHumanizingConfig();

      if (!config) {
        return { success: false, message: 'getHumanizingConfig() returned null/undefined' };
      }

      const requiredSections = ['stories', 'turnTaking', 'disfluency', 'hedging', 'backchannel', 'silence'];
      const missing = requiredSections.filter((s) => !(s in config));

      if (missing.length > 0) {
        return { success: false, message: `Missing config sections: ${missing.join(', ')}` };
      }

      // Validate config values
      if (config.disfluency.frequency < 0 || config.disfluency.frequency > 1) {
        return { success: false, message: `Invalid disfluency.frequency: ${config.disfluency.frequency}` };
      }

      return { success: true, details: { sections: requiredSections } };
    },
  },

  // Check 7: Interruption Handler
  {
    name: 'InterruptionHandler singleton',
    fn: async () => {
      const { getInterruptionHandler } = await import('../src/conversation/interruption-handler.js');
      const handler = getInterruptionHandler();

      if (!handler) {
        return { success: false, message: 'getInterruptionHandler() returned null/undefined' };
      }

      const methods = ['detectInterruption', 'setAgentSpeaking', 'estimateEnergy', 'isSpeechDetected', 'analyzeAudio', 'getRecoveryPhrase'];
      const missing = methods.filter((m) => typeof (handler as any)[m] !== 'function');

      if (missing.length > 0) {
        return { success: false, message: `Missing methods: ${missing.join(', ')}` };
      }

      return { success: true, details: { methodCount: methods.length } };
    },
  },

  // Check 8: Response Dynamics
  {
    name: 'ResponseDynamicsEngine singleton',
    fn: async () => {
      const { getResponseDynamicsEngine } = await import('../src/conversation/response-dynamics.js');
      const engine = getResponseDynamicsEngine();

      if (!engine) {
        return { success: false, message: 'getResponseDynamicsEngine() returned null/undefined' };
      }

      const methods = ['recordMessage'];
      const missing = methods.filter((m) => typeof (engine as any)[m] !== 'function');

      if (missing.length > 0) {
        return { success: false, message: `Missing methods: ${missing.join(', ')}` };
      }

      return { success: true };
    },
  },

  // Check 9: Emotion Matching
  {
    name: 'EmotionMatching functions',
    fn: async () => {
      const emotionModule = await import('../src/speech/emotion-matching.js');

      const requiredExports = ['getEmotionModulation', 'wrapWithEmotionProsody'];
      const missing = requiredExports.filter((e) => typeof (emotionModule as any)[e] !== 'function');

      if (missing.length > 0) {
        return { success: false, message: `Missing exports: ${missing.join(', ')}` };
      }

      // Test emotion modulation (VoiceEmotionResult structure)
      const modulation = emotionModule.getEmotionModulation({
        primary: 'happy',
        confidence: 0.8,
        arousal: 0.7,
        valence: 0.8,
        stressLevel: 0.2,
      });

      if (!modulation) {
        return { success: false, message: 'getEmotionModulation() returned null' };
      }

      return { success: true };
    },
  },

  // Check 10: Emotional Arc Tracker
  {
    name: 'EmotionalArcTracker singleton',
    fn: async () => {
      const { getEmotionalArcTracker } = await import('../src/conversation/emotional-arc.js');
      const tracker = getEmotionalArcTracker();

      if (!tracker) {
        return { success: false, message: 'getEmotionalArcTracker() returned null/undefined' };
      }

      const methods = ['recordEmotion', 'getSsmlAdjustments'];
      const missing = methods.filter((m) => typeof (tracker as any)[m] !== 'function');

      if (missing.length > 0) {
        return { success: false, message: `Missing methods: ${missing.join(', ')}` };
      }

      return { success: true };
    },
  },
];

// ============================================================================
// MAIN RUNNER
// ============================================================================

async function runValidation(): Promise<void> {
  console.log('\n' + colors.cyan('='.repeat(60)));
  console.log(colors.cyan('  HUMANIZATION VALIDATION'));
  console.log(colors.cyan('='.repeat(60)) + '\n');

  let passed = 0;
  let failed = 0;

  for (const check of checks) {
    process.stdout.write(`  ${check.name}... `);

    try {
      const result = await check.fn();
      results.push({ name: check.name, result });

      if (result.success) {
        console.log(colors.green('OK'));
        if (result.details) {
          console.log(colors.dim(`    ${JSON.stringify(result.details)}`));
        }
        passed++;
      } else {
        console.log(colors.red('FAIL'));
        console.log(colors.red(`    ${result.message}`));
        failed++;
      }
    } catch (err) {
      results.push({
        name: check.name,
        result: { success: false, message: String(err) },
      });
      console.log(colors.red('ERROR'));
      console.log(colors.red(`    ${err}`));
      failed++;
    }
  }

  // Summary
  console.log('\n' + colors.cyan('-'.repeat(60)));
  console.log(`  ${colors.green(`Passed: ${passed}`)}  |  ${failed > 0 ? colors.red(`Failed: ${failed}`) : `Failed: ${failed}`}`);
  console.log(colors.cyan('-'.repeat(60)) + '\n');

  // Exit with appropriate code
  if (failed > 0) {
    console.log(colors.red('Validation FAILED. Please fix the issues above.'));
    process.exit(1);
  } else {
    console.log(colors.green('All humanization modules validated successfully!'));
    process.exit(0);
  }
}

// Run
runValidation().catch((err) => {
  console.error('Validation script crashed:', err);
  process.exit(1);
});
