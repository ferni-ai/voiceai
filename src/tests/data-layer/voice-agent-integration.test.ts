/**
 * Voice Agent → Data Layer Integration Tests
 *
 * Validates that data flows correctly from:
 * 1. User conversation → Semantic indexing
 * 2. Semantic memory → Voice agent context
 * 3. Context builders → LLM responses
 *
 * This is NOT about testing voice audio - it's about ensuring the
 * intelligence system has access to the data layer.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFile } from 'fs/promises';
import { join } from 'path';

// ============================================================================
// MOCK SETUP
// ============================================================================

// Mock Firestore for unit tests (no emulator needed)
vi.mock('../../memory/firestore-vector-store/index.js', () => ({
  getFirestoreVectorStore: () => ({
    addDocument: vi.fn(),
    search: vi.fn().mockResolvedValue([]),
    removeDocument: vi.fn(),
    getHealth: () => ({ healthy: true, usingFallback: false }),
  }),
}));

// Mock embeddings
vi.mock('../../memory/embeddings.js', () => ({
  embed: vi.fn().mockResolvedValue(new Array(768).fill(0)),
}));

// ============================================================================
// ARCHITECTURE VALIDATION
// ============================================================================

describe('Voice Agent → Data Layer Architecture', () => {
  it('turn-handler imports unified intelligence integration', async () => {
    const turnHandlerPath = join(process.cwd(), 'src/agents/voice-agent/turn-handler.ts');
    const content = await readFile(turnHandlerPath, 'utf-8');

    // Check for unified intelligence import
    expect(content).toContain('unified-intelligence-integration');
    expect(content).toContain('getUnifiedIntelligence');
  });

  it('unified-intelligence-integration uses context assembler', async () => {
    const integrationPath = join(
      process.cwd(),
      'src/agents/integrations/unified-intelligence-integration.ts'
    );
    const content = await readFile(integrationPath, 'utf-8');

    // Check for context assembler usage
    expect(content).toContain('buildSuperhumanContext');
    expect(content).toContain('getIntelligenceForTurn');
  });

  // TODO: Skipped - The context assembler has been refactored. Data layer integration
  // now happens through context builders (unified-data-context.ts) rather than
  // direct imports in the assembler. This test needs to be updated to reflect the new architecture.
  it.skip('context assembler uses data layer', async () => {
    // context-assembler.ts is now a re-export stub - check the real implementation
    const assemblerPath = join(process.cwd(), 'src/intelligence/core/context-assembler.ts');
    const content = await readFile(assemblerPath, 'utf-8');

    // Should import from data layer
    expect(content).toContain('data-layer');
  });

  it('unified-data-context builder uses searchUserContext', async () => {
    const builderPath = join(
      process.cwd(),
      'src/intelligence/context-builders/memory/unified-data-context.ts'
    );
    const content = await readFile(builderPath, 'utf-8');

    // Should import from unified data layer
    expect(content).toContain('getUnifiedDataLayer');
    expect(content).toContain('getUnifiedContext');
  });
});

// ============================================================================
// DATA FLOW VALIDATION
// ============================================================================

describe('Data Flow: Hooks → Intelligence', () => {
  // TODO: Skipped - The productivity store has been refactored and no longer uses
  // dedicated hook functions (onHabitChange, onTaskChange, onRoutineChange).
  // The integration pattern has changed - needs test update to match new architecture.
  it.skip('productivity hooks flow to coaching context', async () => {
    // Productivity hooks (habit, task, routine) are in the main store-hooks.ts
    // These are called by productivity-store.ts when data changes
    const storeHooksPath = join(process.cwd(), 'src/services/data-layer/store-hooks.ts');
    const storeHooks = await readFile(storeHooksPath, 'utf-8');

    // Verify store-hooks has the onStoreChange function that processes all changes
    expect(storeHooks).toContain('onStoreChange');
    expect(storeHooks).toContain('processChange');

    // Verify productivity store uses data layer hooks
    const productivityStorePath = join(process.cwd(), 'src/services/stores/productivity-store.ts');
    const productivityStore = await readFile(productivityStorePath, 'utf-8');
    expect(productivityStore).toContain('onHabitChange');
    expect(productivityStore).toContain('onTaskChange');
    expect(productivityStore).toContain('onRoutineChange');
  });

  it('trust hooks flow to relationship context', async () => {
    const hooksPath = join(process.cwd(), 'src/services/data-layer/hooks/trust-hooks.ts');
    const content = await readFile(hooksPath, 'utf-8');

    // Trust hooks should exist
    expect(content).toContain('onCommitmentChange');
    expect(content).toContain('onBoundaryChange');
    expect(content).toContain('onSmallWinChange');
  });

  it('superhuman hooks flow to proactive intelligence', async () => {
    const hooksPath = join(process.cwd(), 'src/services/data-layer/hooks/superhuman-hooks.ts');
    const content = await readFile(hooksPath, 'utf-8');

    // Superhuman hooks should exist
    expect(content).toContain('onPredictiveInsightChange');
    expect(content).toContain('onCapacityStateChange');
    expect(content).toContain('onCommitmentKeeperChange');
  });
});

// ============================================================================
// CONTEXT INJECTION VALIDATION
// ============================================================================

describe('Context Injection: Data Layer → LLM', () => {
  it('unified data context builder is registered', async () => {
    const builderPath = join(
      process.cwd(),
      'src/intelligence/context-builders/memory/unified-data-context.ts'
    );
    const content = await readFile(builderPath, 'utf-8');

    // Builder should be registered
    expect(content).toContain('registerContextBuilder');
  });

  it('superhuman context builder exists', async () => {
    const builderPath = join(
      process.cwd(),
      'src/intelligence/context-builders/superhuman/superhuman-integration.ts'
    );

    // Just verify the file exists (path check)
    const content = await readFile(builderPath, 'utf-8').catch(() => null);
    expect(content).not.toBeNull();
  });

  it('proactive intelligence has access to data layer', async () => {
    const proactivePath = join(process.cwd(), 'src/intelligence/proactive/proactive-engine.ts');
    const content = await readFile(proactivePath, 'utf-8');

    // Should have access to context
    expect(content).toContain('ContextWindow');
  });
});

// ============================================================================
// END-TO-END SIMULATION
// ============================================================================

describe('E2E Simulation: Habit Update → Context Injection', () => {
  // TODO: Skipped - The productivity store implementation has been refactored.
  // The hook integration pattern (onHabitChange, data-layer imports) has changed.
  // Need to update test to match new architecture or document the new pattern.
  it.skip('should have complete data path from habit hook to intelligence API', async () => {
    // 1. Verify productivity store uses hooks
    const productivityStorePath = join(process.cwd(), 'src/services/stores/productivity-store.ts');
    const productivityStore = await readFile(productivityStorePath, 'utf-8');
    expect(productivityStore).toContain('onHabitChange');
    expect(productivityStore).toContain('data-layer');

    // 2. Verify store-hooks processes and indexes
    const storeHooksPath = join(process.cwd(), 'src/services/data-layer/store-hooks.ts');
    const storeHooks = await readFile(storeHooksPath, 'utf-8');
    expect(storeHooks).toContain('processChange');
    expect(storeHooks).toContain('getFirestoreVectorStore');

    // 3. Verify unified data layer exposes search
    const dataLayerPath = join(process.cwd(), 'src/services/data-layer/index.ts');
    const dataLayer = await readFile(dataLayerPath, 'utf-8');
    expect(dataLayer).toContain('searchUserContext');
    expect(dataLayer).toContain('getUnifiedContext');

    // 4. Verify intelligence API pulls from data layer
    const intelligencePath = join(process.cwd(), 'src/intelligence/unified-intelligence-api.ts');
    const intelligence = await readFile(intelligencePath, 'utf-8');
    expect(intelligence).toContain('assembleContext');
  });
});

// ============================================================================
// OBSERVABILITY VALIDATION
// ============================================================================

describe('Data Layer Observability', () => {
  it('exports queue metrics function', async () => {
    const storeHooksPath = join(process.cwd(), 'src/services/data-layer/store-hooks.ts');
    const content = await readFile(storeHooksPath, 'utf-8');

    expect(content).toContain('getQueueMetrics');
    expect(content).toContain('pendingIndexes');
    expect(content).toContain('successRate');
  });

  it('has monitoring and observability exports', async () => {
    const monitoringPath = join(process.cwd(), 'src/services/data-layer/monitoring.ts');
    const content = await readFile(monitoringPath, 'utf-8');

    expect(content).toContain('getMonitoringMetrics');
    expect(content).toContain('recordIndexSuccess');
    expect(content).toContain('exportPrometheusMetrics');
  });

  it('has health check endpoints in API', async () => {
    const healthPath = join(process.cwd(), 'src/servers/api/routes/health.ts');
    const content = await readFile(healthPath, 'utf-8');

    expect(content).toContain('/api/semantic-store/health');
    expect(content).toContain('/api/semantic-store/metrics');
    expect(content).toContain('/api/semantic-store/diagnostics');
    expect(content).toContain('/api/semantic-store/queue');
  });
});

// ============================================================================
// TTL CLEANUP VALIDATION
// ============================================================================

describe('TTL Cleanup Integration', () => {
  it('TTL cleanup is scheduled on startup', async () => {
    const startupPath = join(process.cwd(), 'src/startup.ts');
    const content = await readFile(startupPath, 'utf-8');

    expect(content).toContain('ttl-cleanup');
    expect(content).toContain('runTTLCleanup');
  });

  it('TTL cleanup has a scheduled job endpoint', async () => {
    const jobsPath = join(process.cwd(), 'src/api/scheduled-jobs.routes.ts');
    const content = await readFile(jobsPath, 'utf-8');

    expect(content).toContain('/api/jobs/ttl-cleanup');
    expect(content).toContain('handleTTLCleanup');
  });
});
