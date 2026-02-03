#!/usr/bin/env npx tsx
/**
 * Test PersonaPlex Integration
 *
 * This script tests the PersonaPlex integration components without requiring
 * an actual PersonaPlex server.
 *
 * Usage:
 *   pnpm tsx scripts/personaplex/test-integration.ts
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dynamic imports to handle module resolution
async function runTests(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  PersonaPlex Integration Test Suite                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  // Helper function for test assertions
  function test(name: string, fn: () => boolean | Promise<boolean>): void {
    try {
      const result = fn();
      if (result instanceof Promise) {
        result.then((r) => {
          if (r) {
            console.log(`  ✅ ${name}`);
            passed++;
          } else {
            console.log(`  ❌ ${name}`);
            failed++;
          }
        });
      } else if (result) {
        console.log(`  ✅ ${name}`);
        passed++;
      } else {
        console.log(`  ❌ ${name}`);
        failed++;
      }
    } catch (error) {
      console.log(`  ❌ ${name}: ${error}`);
      failed++;
    }
  }

  // Test 1: Configuration
  console.log('\n📋 Test 1: Configuration');
  console.log('────────────────────────────────────────────────────────────────');

  const {
    isPersonaPlexEnabled,
    getPersonaPlexConfig,
    getVoicePromptForPersona,
    getFallbackVoice,
    VOICE_EMBEDDING_CONFIGS,
  } = await import('../../src/integrations/personaplex/config.js');

  test('isPersonaPlexEnabled returns boolean', () => {
    const result = isPersonaPlexEnabled();
    return typeof result === 'boolean';
  });

  test('getPersonaPlexConfig returns valid config', () => {
    const config = getPersonaPlexConfig();
    return (
      typeof config.url === 'string' &&
      typeof config.voicePromptDir === 'string' &&
      config.url.includes('api/chat')
    );
  });

  test('VOICE_EMBEDDING_CONFIGS has all 6 personas', () => {
    return VOICE_EMBEDDING_CONFIGS.length === 6;
  });

  test('getVoicePromptForPersona returns .pt file', () => {
    const result = getVoicePromptForPersona('ferni');
    return result.endsWith('.pt');
  });

  test('getFallbackVoice returns valid PersonaPlex voice', () => {
    const validVoices = ['NATF0', 'NATF1', 'NATF2', 'NATF3', 'NATM0', 'NATM1', 'NATM2', 'NATM3'];
    return validVoices.includes(getFallbackVoice('ferni'));
  });

  // Test 2: Prompt Builder
  console.log('\n📋 Test 2: Prompt Builder');
  console.log('────────────────────────────────────────────────────────────────');

  const {
    buildPersonaPlexPrompt,
    buildMemoryContext,
    buildSessionContext,
    buildTimeContext,
    getDefaultToolDescriptions,
  } = await import('../../src/integrations/personaplex/prompt-builder.js');

  test('buildPersonaPlexPrompt builds valid prompt for Ferni', async () => {
    const result = await buildPersonaPlexPrompt('ferni');
    return (
      result.textPrompt.includes('Ferni') &&
      result.voicePrompt.endsWith('.pt') &&
      result.estimatedTokens > 0
    );
  });

  test('buildPersonaPlexPrompt includes context when provided', async () => {
    const result = await buildPersonaPlexPrompt('ferni', {
      userId: 'test-user',
      memoryContext: "User's name is TestUser",
    });
    return result.textPrompt.includes('TestUser');
  });

  test('buildMemoryContext formats facts correctly', () => {
    const result = buildMemoryContext(['Fact 1', 'Fact 2']);
    return result.includes('- Fact 1') && result.includes('- Fact 2');
  });

  test('buildSessionContext formats transcript correctly', () => {
    const result = buildSessionContext([
      { role: 'user', text: 'Hello' },
      { role: 'assistant', text: 'Hi there' },
    ]);
    return result.includes('User: Hello') && result.includes('You: Hi there');
  });

  test('buildTimeContext returns time string', () => {
    const result = buildTimeContext();
    return result.includes("It's") && result.includes('on');
  });

  test('getDefaultToolDescriptions returns tools for Ferni', () => {
    const tools = getDefaultToolDescriptions('ferni');
    return tools.length > 0 && tools.some((t) => t.name === 'music');
  });

  // Test 3: Voice Embedding Generator
  console.log('\n📋 Test 3: Voice Embedding Generator');
  console.log('────────────────────────────────────────────────────────────────');

  const {
    getVoiceEmbeddingPath,
    validateVoiceEmbeddings,
    getEmbeddingGenerationCommand,
  } = await import('../../src/integrations/personaplex/voice-embeddings/generator.js');

  test('getVoiceEmbeddingPath returns path info', () => {
    const result = getVoiceEmbeddingPath('ferni');
    return typeof result.path === 'string' && typeof result.isCustom === 'boolean';
  });

  test('validateVoiceEmbeddings returns results for all personas', () => {
    const results = validateVoiceEmbeddings();
    return results.length === 6;
  });

  test('getEmbeddingGenerationCommand returns shell command', () => {
    const command = getEmbeddingGenerationCommand('ferni');
    return command.includes('python') && command.includes('moshi.offline');
  });

  // Test 4: Client (basic instantiation)
  console.log('\n📋 Test 4: Client');
  console.log('────────────────────────────────────────────────────────────────');

  const { PersonaPlexClient, createPersonaPlexClient } = await import(
    '../../src/integrations/personaplex/client.js'
  );

  test('PersonaPlexClient can be instantiated', () => {
    const client = new PersonaPlexClient();
    return client.getState() === 'disconnected';
  });

  test('createPersonaPlexClient factory works', () => {
    const client = createPersonaPlexClient({ debug: true });
    return client.getState() === 'disconnected';
  });

  test('Client can register event handlers', () => {
    const client = createPersonaPlexClient();
    let called = false;
    client.on('onStateChange', () => {
      called = true;
    });
    // Just verify it doesn't throw
    return true;
  });

  // Test 5: Integration with Ferni systems
  console.log('\n📋 Test 5: Integration with Ferni Systems');
  console.log('────────────────────────────────────────────────────────────────');

  // Test that we can import from Ferni's existing systems
  test('Can import from Ferni voice-ids', async () => {
    const { VOICE_IDS } = await import('../../src/config/voice-ids.js');
    return typeof VOICE_IDS.FERNI === 'string';
  });

  test('Voice IDs match between Ferni and PersonaPlex config', async () => {
    const { VOICE_IDS } = await import('../../src/config/voice-ids.js');
    return VOICE_EMBEDDING_CONFIGS.some((c) => c.cartesiaVoiceId === VOICE_IDS.FERNI);
  });

  // Test 6: Enhanced Prompt Builder
  console.log('\n📋 Test 6: Enhanced Prompt Builder (Full Persona Integration)');
  console.log('────────────────────────────────────────────────────────────────');

  const { buildEnhancedPersonaPlexPrompt } = await import(
    '../../src/integrations/personaplex/enhanced-prompt-builder.js'
  );

  test('buildEnhancedPersonaPlexPrompt builds comprehensive prompt', async () => {
    const result = await buildEnhancedPersonaPlexPrompt('ferni', {
      userId: 'test-user',
      trustLevel: 0.7,
      isReturningUser: true,
      userName: 'TestUser',
      emotionalState: 'feeling thoughtful',
    });
    return (
      result.textPrompt.includes('IDENTITY') &&
      result.textPrompt.includes('VOICE PERSONALITY') &&
      result.textPrompt.includes('SUPERHUMAN') &&
      result.voicePrompt.endsWith('.pt')
    );
  });

  test('Enhanced prompt includes time-based presence', async () => {
    const result = await buildEnhancedPersonaPlexPrompt('ferni');
    // Should include time-based mode (morning/afternoon/evening/late night)
    return (
      result.textPrompt.includes('mode') ||
      result.textPrompt.includes('Morning') ||
      result.textPrompt.includes('Afternoon') ||
      result.textPrompt.includes('Evening') ||
      result.textPrompt.includes('Late night')
    );
  });

  test('Enhanced prompt includes humanization guidance', async () => {
    const result = await buildEnhancedPersonaPlexPrompt('ferni');
    return (
      result.textPrompt.includes('HUMANIZATION') &&
      result.textPrompt.includes('ACTIVE LISTENING')
    );
  });

  test('Enhanced prompt includes I-notice patterns', async () => {
    const result = await buildEnhancedPersonaPlexPrompt('ferni');
    return result.textPrompt.includes('I notice');
  });

  test('Enhanced prompt handles trust levels', async () => {
    const lowTrust = await buildEnhancedPersonaPlexPrompt('ferni', {
      userId: 'test',
      trustLevel: 0.2,
    });
    const highTrust = await buildEnhancedPersonaPlexPrompt('ferni', {
      userId: 'test',
      trustLevel: 0.8,
    });
    return (
      lowTrust.textPrompt.includes('Building trust') &&
      highTrust.textPrompt.includes('Deep trust')
    );
  });

  // Summary
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('📊 Test Summary');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📊 Total:  ${passed + failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
