/**
 * Voice Agent Entry Integration Tests
 *
 * Tests for the fully integrated voice-agent-entry.ts
 * Verifies core functionality and module exports.
 *
 * These tests focus on verifying the structure and integration points
 * without requiring full runtime infrastructure.
 *
 * @module agents/__tests__/voice-agent-entry
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

// Get the directory of the current file
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// CORE MODULE STRUCTURE TESTS
// ============================================================================

describe('Voice Agent Entry - Module Structure', () => {
  it('should export runFullVoiceAgentEntry function', async () => {
    const fs = await import('fs/promises');
    const entryPath = path.resolve(__dirname, '../voice-agent-entry.ts');
    const content = await fs.readFile(entryPath, 'utf-8');

    expect(content).toContain('export async function runFullVoiceAgentEntry');
  });

  it('should have all handler imports', async () => {
    const fs = await import('fs/promises');
    const entryPath = path.resolve(__dirname, '../voice-agent-entry.ts');
    const content = await fs.readFile(entryPath, 'utf-8');

    // Check that all handlers are imported
    const requiredImports = [
      'identifyUser',
      'initializeSession',
      'initializeHandoffContext',
      'setupMusicHandler',
      'setupDataChannelHandler',
      'createTranscriptHandler',
      'setupSessionStateHandlers',
      'setupToolTrackingHandler',
      'createHandoffHandler',
      'registerCameoHandlers',
      'generateAndSpeakGreeting',
      'handleSessionCleanup',
    ];

    for (const importName of requiredImports) {
      expect(content, `Missing import: ${importName}`).toContain(importName);
    }
  });

  it('should use FerniAgent which builds its own tools', async () => {
    const fs = await import('fs/promises');
    const entryPath = path.resolve(__dirname, '../voice-agent-entry.ts');
    const content = await fs.readFile(entryPath, 'utf-8');

    // Check that FerniAgent is used (agents now build their own tools internally)
    expect(content).toContain('FerniAgent');
    // The agent can use orchestrator tools OR internal tools
    expect(content).toContain('tools built internally');
  });

  it('should have frontend publisher integration', async () => {
    const fs = await import('fs/promises');
    const entryPath = path.resolve(__dirname, '../voice-agent-entry.ts');
    const content = await fs.readFile(entryPath, 'utf-8');

    expect(content).toContain('initializeFrontendPublisher');
    expect(content).toContain('getFrontendPublisher');
    expect(content).toContain('initFrontendSignal');
  });

  it('should have cleanup handler integration', async () => {
    const fs = await import('fs/promises');
    const entryPath = path.resolve(__dirname, '../voice-agent-entry.ts');
    const content = await fs.readFile(entryPath, 'utf-8');

    expect(content).toContain('handleSessionCleanup');
    expect(content).toContain('cleanupHandlers');
  });

  it('should have e2e diagnostics integration', async () => {
    const fs = await import('fs/promises');
    const entryPath = path.resolve(__dirname, '../voice-agent-entry.ts');
    const content = await fs.readFile(entryPath, 'utf-8');

    expect(content).toContain('e2e-diagnostics');
    expect(content).toContain('e2e.resourceLoading');
    expect(content).toContain('e2e.resourceLoaded');
    expect(content).toContain('e2e.sessionStarted');
    expect(content).toContain('e2e.sessionEnded');
  });

  it('should have resilience utilities', async () => {
    const fs = await import('fs/promises');
    const entryPath = path.resolve(__dirname, '../voice-agent-entry.ts');
    const content = await fs.readFile(entryPath, 'utf-8');

    expect(content).toContain('withResilience');
    expect(content).toContain('humanizeError');
  });
});

// ============================================================================
// E2E DIAGNOSTICS TESTS
// ============================================================================

describe('Voice Agent Entry - E2E Diagnostics', () => {
  it('should have all required diagnostic methods', async () => {
    const { e2e } = await import('../shared/e2e-diagnostics.js');

    expect(e2e).toBeDefined();
    expect(typeof e2e.childEntry).toBe('function');
    expect(typeof e2e.resourceLoading).toBe('function');
    expect(typeof e2e.resourceLoaded).toBe('function');
    expect(typeof e2e.sessionConnecting).toBe('function');
    expect(typeof e2e.sessionConnected).toBe('function');
    expect(typeof e2e.sessionStarted).toBe('function');
    expect(typeof e2e.sessionEnded).toBe('function');
    expect(typeof e2e.captureError).toBe('function');
    expect(typeof e2e.custom).toBe('function');
  });

  it('should not throw when calling diagnostic methods', async () => {
    const { e2e } = await import('../shared/e2e-diagnostics.js');

    // These should not throw
    expect(() => e2e.childEntry('test-job')).not.toThrow();
    expect(() => e2e.resourceLoading('test-resource')).not.toThrow();
    expect(() => e2e.resourceLoaded('test-resource', 100)).not.toThrow();
    expect(() => e2e.sessionConnecting('test-room', 'test-participant')).not.toThrow();
    expect(() => e2e.sessionConnected('test-job', 'test-room', 'test-agent', 100)).not.toThrow();
    expect(() => e2e.sessionStarted('test-job', 'ferni')).not.toThrow();
    expect(() => e2e.sessionEnded('test-job', 'disconnected', 1000)).not.toThrow();
    expect(() => e2e.captureError('TEST', new Error('test'), {})).not.toThrow();
  });
});

// ============================================================================
// RESILIENCE MODULE TESTS
// ============================================================================

describe('Voice Agent Entry - Resilience Module', () => {
  it('should export withResilience function', async () => {
    const { withResilience } = await import('../shared/lightweight-resilience.js');
    expect(typeof withResilience).toBe('function');
  });

  it('should export humanizeError function', async () => {
    const { humanizeError } = await import('../shared/lightweight-resilience.js');
    expect(typeof humanizeError).toBe('function');
  });

  it('should humanize errors correctly', async () => {
    const { humanizeError } = await import('../shared/lightweight-resilience.js');

    const error = new Error('ECONNREFUSED');
    const result = humanizeError(error);

    expect(result).toBeDefined();
    expect(result.userMessage).toBeDefined();
    expect(typeof result.userMessage).toBe('string');
    expect(typeof result.shouldNotifyUser).toBe('boolean');
  });

  it('should retry failed operations', async () => {
    const { withResilience } = await import('../shared/lightweight-resilience.js');

    let attempts = 0;
    const failTwiceThenSucceed = async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Temporary failure');
      }
      return 'success';
    };

    const result = await withResilience(failTwiceThenSucceed, {
      maxRetries: 3,
      baseDelay: 10,
      operationName: 'test-operation',
    });

    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });
});

// ============================================================================
// VOICE AGENT HELPER FUNCTIONS TESTS
// ============================================================================

describe('Voice Agent Entry - Helper Functions', () => {
  it('should parse persona from metadata correctly', async () => {
    const { parsePersonaFromMetadata } = await import('../voice-agent/index.js');

    expect(parsePersonaFromMetadata(JSON.stringify({ persona_id: 'ferni' }))).toBe('ferni');
    expect(parsePersonaFromMetadata(JSON.stringify({ personaId: 'peter-john' }))).toBe(
      'peter-john'
    );
    expect(parsePersonaFromMetadata(undefined)).toBeNull();
    expect(parsePersonaFromMetadata('invalid')).toBeNull();
  });

  it('should parse user from metadata correctly', async () => {
    const { parseUserFromMetadata } = await import('../voice-agent/index.js');

    const metadata = JSON.stringify({
      user_id: 'test-user-123',
      user_name: 'Test User',
    });

    const result = parseUserFromMetadata(metadata);

    expect(result.userId).toBe('test-user-123');
    expect(result.userName).toBe('Test User');
  });

  it('should handle missing metadata gracefully', async () => {
    const { parseUserFromMetadata } = await import('../voice-agent/index.js');

    const result = parseUserFromMetadata(undefined);
    expect(result).toEqual({});

    const result2 = parseUserFromMetadata('invalid json');
    expect(result2).toEqual({});
  });

  it('should detect SSML tags correctly', async () => {
    const { hasSsmlTags } = await import('../voice-agent/index.js');

    expect(hasSsmlTags('<speed rate="1.2">Hello</speed>')).toBe(true);
    expect(hasSsmlTags('<emotion name="happy">Hi!</emotion>')).toBe(true);
    expect(hasSsmlTags('<break time="500ms"/>')).toBe(true);
    expect(hasSsmlTags('Hello, world!')).toBe(false);
    expect(hasSsmlTags('No tags here')).toBe(false);
  });

  it('should filter real usernames correctly', async () => {
    const { isRealUserName } = await import('../voice-agent/index.js');

    // Real names
    expect(isRealUserName('John')).toBe(true);
    expect(isRealUserName('Jane Doe')).toBe(true);
    expect(isRealUserName('Seth')).toBe(true);

    // Generated/placeholder names
    expect(isRealUserName('user_1234567890')).toBe(false);
    expect(isRealUserName('user')).toBe(false);
    expect(isRealUserName('User')).toBe(false);
    expect(isRealUserName('user123')).toBe(false);
    expect(isRealUserName('12345')).toBe(false);
    expect(isRealUserName('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(false); // UUID
    expect(isRealUserName(undefined)).toBe(false);
    expect(isRealUserName('')).toBe(false);

    // Note: "User 1" is NOT filtered because the regex expects underscore/dash, not space
    // This is intentional - "User 1" could be a real name like "Ali 1" in some contexts
    expect(isRealUserName('User 1')).toBe(true);
  });
});

// ============================================================================
// INTEGRATION CHECKLIST
// ============================================================================

describe('Voice Agent Entry - Integration Checklist', () => {
  it('should document all integrated features', async () => {
    const fs = await import('fs/promises');
    const entryPath = path.resolve(__dirname, '../voice-agent-entry.ts');
    const content = await fs.readFile(entryPath, 'utf-8');

    // List of all integrations we've added
    const integrations = [
      // Session services
      { name: 'Session Services', pattern: 'initializeSession' },
      { name: 'User Identification', pattern: 'identifyUser' },
      { name: 'Handoff Context', pattern: 'initializeHandoffContext' },

      // Handlers
      { name: 'Music Handler', pattern: 'setupMusicHandler' },
      { name: 'Data Channel Handler', pattern: 'setupDataChannelHandler' },
      { name: 'Transcript Handler', pattern: 'createTranscriptHandler' },
      { name: 'Session State Handlers', pattern: 'setupSessionStateHandlers' },
      { name: 'Tool Tracking Handler', pattern: 'setupToolTrackingHandler' },
      { name: 'Handoff Handler', pattern: 'createHandoffHandler' },
      { name: 'Cameo Handlers', pattern: 'registerCameoHandlers' },
      { name: 'Greeting Handler', pattern: 'generateAndSpeakGreeting' },
      { name: 'Cleanup Handler', pattern: 'handleSessionCleanup' },

      // Tools & Optimization (agents now build their own tools)
      { name: 'Agent Tools', pattern: 'FerniAgent' },
      { name: 'Auto Optimizer', pattern: 'autoOptimizer' },
      { name: 'Pattern Analyzer', pattern: 'patternAnalyzer' },
      { name: 'Feedback Collector', pattern: 'feedbackCollector' },
      { name: 'Dynamic Tool Loader', pattern: 'dynamicToolLoader' },

      // Frontend Communication
      { name: 'Frontend Publisher', pattern: 'initializeFrontendPublisher' },
      { name: 'Frontend Signal', pattern: 'initFrontendSignal' },

      // Events
      { name: 'Handoff Events', pattern: 'handoffEvents' },

      // Diagnostics
      { name: 'E2E Diagnostics', pattern: 'e2e.sessionStarted' },
      { name: 'Resilience', pattern: 'withResilience' },

      // Voice Localization
      { name: 'Voice Localization', pattern: 'getLocalizedVoiceId' },
      { name: 'TTS Registration', pattern: 'registerSessionTTS' },
      { name: 'Voice Manager', pattern: 'getSessionVoiceManager' },

      // Phone Call Support
      { name: 'Phone Call Detection', pattern: 'isPhoneCall' },
      { name: 'Noise Cancellation', pattern: 'TelephonyBackgroundVoiceCancellation' },

      // Humanization Signals
      { name: 'Humanization Signal Emitter', pattern: 'initHumanizationSignalEmitter' },
      { name: 'Trust Signal Emitter', pattern: 'setSignalEmitter' },

      // Background Services
      { name: 'Async Events', pattern: 'emitConversationStart' },
      { name: 'Conversation Session', pattern: 'initConversationSession' },
      { name: 'Humanization Persistence', pattern: 'initializeFromPersistence' },
      { name: 'Voice Humanization Init', pattern: 'setupVoiceHumanizationInit' },
      { name: 'Engagement Data', pattern: 'getEngagementDataSender' },
      { name: 'Cognitive Session', pattern: 'onCognitiveSessionStart' },
      { name: 'Game Engine', pattern: 'getSessionGameEngine' },

      // NEW: Advanced Humanization
      { name: 'Voice Humanization Integration', pattern: 'quickSetupVoiceHumanization' },
      { name: 'Emotional Arc Tracker', pattern: 'getEmotionalArcTracker' },
      { name: 'Insight Callback', pattern: 'setInsightCallback' },

      // NEW: Prosody & Bundle
      { name: 'Prosody Bridge', pattern: 'initProsodyBridge' },
      { name: 'Bundle Runtime', pattern: 'createBundleRuntime' },
      { name: 'Bundle Loader', pattern: 'loadBundleById' },

      // NEW: Extensibility
      { name: 'Extensibility Hook', pattern: 'extensibilitySessionPrompt' },
    ];

    const results: { name: string; integrated: boolean }[] = [];

    for (const integration of integrations) {
      results.push({
        name: integration.name,
        integrated: content.includes(integration.pattern),
      });
    }

    // Log results
    console.log('\n=== Voice Agent Entry Integration Status ===\n');
    for (const result of results) {
      const status = result.integrated ? '✅' : '❌';
      console.log(`${status} ${result.name}`);
    }
    console.log('\n');

    // All integrations should be present
    const missing = results.filter((r) => !r.integrated);
    if (missing.length > 0) {
      console.log('Missing integrations:', missing.map((m) => m.name).join(', '));
    }
    expect(missing).toHaveLength(0);
  });
});
