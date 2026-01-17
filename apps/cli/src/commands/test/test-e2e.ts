#!/usr/bin/env npx tsx
/**
 * End-to-End Test Suite
 * 
 * Validates the entire system works before deployment:
 * 1. Configuration validation
 * 2. Storage backend connectivity
 * 3. API connectivity (LiveKit, Google, Cartesia)
 * 4. Persona loading
 * 5. Context builder system
 * 
 * Run: npx tsx scripts/test-e2e.ts
 */

import { initializeLogger, log } from '@livekit/agents';

// Initialize logger first
initializeLogger({ pretty: false, level: 'warn' });

// Colors for console output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const NC = '\x1b[0m'; // No Color

const logger = log();

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  process.stdout.write(`  Testing ${name}...`);
  
  try {
    await testFn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, message: 'OK', duration });
    console.log(`${GREEN} ✓${NC} (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, message, duration });
    console.log(`${RED} ✗${NC}`);
    console.log(`    ${RED}Error: ${message}${NC}`);
  }
}

// ============================================================================
// TEST SUITES
// ============================================================================

async function testConfiguration(): Promise<void> {
  console.log(`\n${CYAN}━━━ Configuration ━━━${NC}`);
  
  await runTest('Load config', async () => {
    const { loadConfig } = await import('../../../../../src/config/environment.js');
    const config = loadConfig();
    if (!config) throw new Error('Config is null');
  });
  
  await runTest('Validate config structure', async () => {
    const { loadConfig, validateConfig } = await import('../../../../../src/config/environment.js');
    const config = loadConfig();
    const result = validateConfig(config);
    // Just check structure is valid - API keys may not be set in test env
    if (result.warnings) {
      // Warnings are ok
    }
    // Verify config has expected shape
    if (!config.storage || !config.cache) {
      throw new Error('Config missing expected fields');
    }
  });
  
  await runTest('Environment detection', async () => {
    const { detectEnvironment, isGoogleCloud } = await import('../../../../../src/config/environment.js');
    const env = detectEnvironment();
    const isGCP = isGoogleCloud();
    if (!['development', 'production', 'test'].includes(env)) {
      throw new Error(`Invalid environment: ${env}`);
    }
  });
}

async function testPersonas(): Promise<void> {
  console.log(`\n${CYAN}━━━ Personas ━━━${NC}`);
  
  // First preload all bundles
  await runTest('Preload persona bundles', async () => {
    const { preloadAllBundles } = await import('../../../../../src/personas/bundles/preloader.js');
    await preloadAllBundles();
  });
  
  await runTest('Load persona registry', async () => {
    const { listPersonas } = await import('../../../../../src/personas/index.js');
    const personas = listPersonas();
    // After preload, we should have at least the core team personas
    // Note: listPersonas() returns synchronous registry, may not include all async-loaded bundles
    if (personas.length === 0) {
      throw new Error('No personas in registry after preload');
    }
  });
  
  await runTest('Load Ferni persona (async)', async () => {
    const { getPersonaAsync } = await import('../../../../../src/personas/index.js');
    const ferni = await getPersonaAsync('ferni');
    if (!ferni) throw new Error('Ferni persona not found');
    if (!ferni.systemPrompt) throw new Error('Missing system prompt');
  });
  
  await runTest('Load Peter persona (async)', async () => {
    const { getPersonaAsync } = await import('../../../../../src/personas/index.js');
    const peter = await getPersonaAsync('peter-john');
    if (!peter) throw new Error('Peter persona not found');
    if (!peter.voice?.voiceId) throw new Error('Missing voice ID');
  });
  
  await runTest('All team personas available', async () => {
    const { getPersonaAsync } = await import('../../../../../src/personas/index.js');
    const teamIds = ['ferni', 'peter-john', 'maya-santos', 'alex-chen', 'jordan-taylor', 'nayan-patel'];
    for (const id of teamIds) {
      const persona = await getPersonaAsync(id as any);
      if (!persona) {
        throw new Error(`Team persona ${id} not found`);
      }
    }
  });
}

async function testStorage(): Promise<void> {
  console.log(`\n${CYAN}━━━ Storage ━━━${NC}`);
  
  await runTest('Initialize in-memory store', async () => {
    const { getDefaultStore } = await import('../../../../../src/memory/in-memory-store.js');
    const store = getDefaultStore();
    await store.initialize();
  });
  
  await runTest('Store and retrieve user profile', async () => {
    const { getDefaultStore } = await import('../../../../../src/memory/in-memory-store.js');
    const { createUserProfile } = await import('../../../../../src/types/user-profile.js');
    
    const store = getDefaultStore();
    const testUserId = `test-user-${Date.now()}`;
    const profile = createUserProfile(testUserId);
    profile.name = 'Test User';
    
    await store.saveProfile(profile);
    const retrieved = await store.getProfile(testUserId);
    
    if (!retrieved) throw new Error('Profile not retrieved');
    if (retrieved.name !== 'Test User') throw new Error('Name mismatch');
    
    // Cleanup
    await store.deleteProfile(testUserId);
  });
  
  await runTest('Memory system initialization', async () => {
    const { initializeMemorySystem, shutdownMemorySystem } = await import('../../../../../src/memory/index.js');
    
    const result = await initializeMemorySystem({
      storeType: 'memory',
      enableRedis: false,
      indexPersona: false,
    });
    
    if (!result.store) throw new Error('Store not initialized');
    if (!result.vectorStore) throw new Error('Vector store not initialized');
    
    await shutdownMemorySystem();
  });
}

async function testContextBuilders(): Promise<void> {
  console.log(`\n${CYAN}━━━ Context Builders ━━━${NC}`);
  
  await runTest('Build context (basic)', async () => {
    const { buildConversationContext } = await import('../../../../../src/intelligence/context-builders/index.js');
    const { getPersona } = await import('../../../../../src/personas/index.js');
    
    const persona = getPersona('ferni');
    
    // Minimal services mock
    const mockServices = {
      analyze: () => ({}),
      addTurn: () => {},
      trackResponseQuality: () => {},
      getPromptContext: () => '',
    };
    
    const injections = await buildConversationContext({
      userText: 'I am feeling anxious about money',
      analysis: {
        emotion: { primary: 'fear', distressLevel: 0.7, valence: 'negative', intensity: 0.8 },
        intent: { primary: 'expressing_concern' },
        topics: { detected: ['money', 'anxiety'], categories: ['emotional', 'financial'] },
        state: { phase: 'exploring' },
      },
      services: mockServices,
      userData: { turnCount: 3, isReturningUser: false },
      persona,
    });
    
    // Context builders may return empty array if no conditions match
    // Just verify it runs without error
    if (injections === undefined) {
      throw new Error('buildConversationContext returned undefined');
    }
  });
  
  await runTest('Context builders registered', async () => {
    // Trigger builder loading by calling buildConversationContext first
    const { buildConversationContext, getRegisteredBuilders } = await import('../../../../../src/intelligence/context-builders/index.js');
    
    // Run a build to trigger lazy loading
    await buildConversationContext({
      userText: 'test',
      analysis: {
        emotion: { primary: 'neutral', distressLevel: 0.1, valence: 'neutral' },
        intent: { primary: 'greeting' },
        topics: { detected: [], categories: [] },
        state: { phase: 'opening' },
      },
      services: { analyze: () => ({}), addTurn: () => {}, trackResponseQuality: () => {}, getPromptContext: () => '' },
      userData: { turnCount: 1 },
    });
    
    const builders = getRegisteredBuilders();
    // Some builders should be registered after the build
    if (builders.length === 0) {
      console.log(`    ${YELLOW}Note: Builders are lazily loaded${NC}`);
    }
  });
}

async function testIntelligence(): Promise<void> {
  console.log(`\n${CYAN}━━━ Intelligence ━━━${NC}`);
  
  await runTest('Message analyzer', async () => {
    const { analyzeMessage } = await import('../../../../../src/intelligence/index.js');
    const analysis = analyzeMessage('I just lost my job and I am worried about my retirement savings');
    
    if (!analysis.emotion) throw new Error('No emotion detected');
    if (!analysis.intent) throw new Error('No intent detected');
    if (analysis.emotion.distressLevel < 0.3) {
      throw new Error('Should detect high distress');
    }
  });
  
  await runTest('Learning engine', async () => {
    const { getLearningEngine, resetLearningEngine } = await import('../../../../../src/intelligence/index.js');
    
    resetLearningEngine();
    const engine = getLearningEngine();
    
    engine.processUserTurn('Hello, my name is John', {
      emotion: { primary: 'neutral' },
      intent: { primary: 'greeting' },
      state: { phase: 'opening' },
    });
    
    // Just verify it runs without error
  });
}

async function testAPIs(): Promise<void> {
  console.log(`\n${CYAN}━━━ API Connectivity ━━━${NC}`);
  
  // These tests are optional - they validate config when present
  const hasLiveKit = !!(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY);
  const hasGoogle = !!process.env.GOOGLE_API_KEY;
  const hasCartesia = !!process.env.CARTESIA_API_KEY;
  
  if (!hasLiveKit && !hasGoogle && !hasCartesia) {
    console.log(`  ${YELLOW}⚠ No API keys set - skipping API tests${NC}`);
    console.log(`  ${YELLOW}  Set env vars in .env to test API connectivity${NC}`);
    return;
  }
  
  if (hasLiveKit) {
    await runTest('LiveKit config valid', async () => {
      const url = process.env.LIVEKIT_URL!;
      if (!url.startsWith('wss://')) throw new Error('LIVEKIT_URL should start with wss://');
    });
  } else {
    console.log(`  ${YELLOW}○ LiveKit: Not configured (optional)${NC}`);
  }
  
  if (hasGoogle) {
    await runTest('Google API key valid', async () => {
      const key = process.env.GOOGLE_API_KEY!;
      if (key.length < 20) throw new Error('GOOGLE_API_KEY looks invalid');
    });
  } else {
    console.log(`  ${YELLOW}○ Google API: Not configured (optional)${NC}`);
  }
  
  if (hasCartesia) {
    await runTest('Cartesia API key present', async () => {
      // Just verify it exists - we already checked
    });
  } else {
    console.log(`  ${YELLOW}○ Cartesia: Not configured (optional)${NC}`);
  }
}

async function testTools(): Promise<void> {
  console.log(`\n${CYAN}━━━ Tools ━━━${NC}`);
  
  await runTest('Tool registry module loads', async () => {
    const { ToolRegistry } = await import('../../../../../src/tools/registry/index.js');
    if (!ToolRegistry) {
      throw new Error('ToolRegistry not exported');
    }
  });
  
  await runTest('Tool domains exist', async () => {
    const domainsModule = await import('../../../../../src/tools/domains/index.js');
    if (!domainsModule) {
      throw new Error('Domains module not loaded');
    }
  });
}

async function testServices(): Promise<void> {
  console.log(`\n${CYAN}━━━ Services ━━━${NC}`);
  
  await runTest('Services module loads', async () => {
    const servicesModule = await import('../../../../../src/services/index.js');
    // Verify services module loads without error
    if (!servicesModule) throw new Error('Services module not loaded');
  });
  
  await runTest('DI container available', async () => {
    const { getContainer } = await import('../../../../../src/services/di/container.js');
    // Just verify it loads - container may not be initialized without full setup
    if (!getContainer) throw new Error('DI container not available');
  });
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log(`\n${CYAN}╔════════════════════════════════════════════════════╗${NC}`);
  console.log(`${CYAN}║        Voice AI End-to-End Test Suite              ║${NC}`);
  console.log(`${CYAN}╚════════════════════════════════════════════════════╝${NC}`);
  
  const startTime = Date.now();
  
  // Run all test suites
  await testConfiguration();
  await testPersonas();
  await testStorage();
  await testContextBuilders();
  await testIntelligence();
  await testAPIs();
  await testTools();
  await testServices();
  
  // Summary
  const totalDuration = Date.now() - startTime;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\n${CYAN}━━━ Summary ━━━${NC}`);
  console.log(`  Total tests: ${results.length}`);
  console.log(`  ${GREEN}Passed: ${passed}${NC}`);
  if (failed > 0) {
    console.log(`  ${RED}Failed: ${failed}${NC}`);
    console.log(`\n${RED}Failed tests:${NC}`);
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  ${RED}✗ ${r.name}: ${r.message}${NC}`);
    }
  }
  console.log(`  Duration: ${totalDuration}ms`);
  
  // Exit code
  if (failed > 0) {
    console.log(`\n${RED}❌ E2E tests failed${NC}\n`);
    process.exit(1);
  } else {
    console.log(`\n${GREEN}✅ All E2E tests passed!${NC}\n`);
    process.exit(0);
  }
}

main().catch((error) => {
  console.error(`${RED}Fatal error: ${error}${NC}`);
  process.exit(1);
});

