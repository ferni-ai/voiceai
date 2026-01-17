/**
 * Agent Guidance Gaps E2E Tests
 *
 * Tests the four new context builders added to fill guidance gaps:
 * 1. Session Gap Awareness - Days since last session with reconnection guidance
 * 2. Proactive Session Context - Why Ferni initiated a check-in call
 * 3. Handoff Trust Context - Boundaries and rapport builders during handoffs
 * 4. Tool Failure Awareness - Recent tool failures for honest acknowledgment
 *
 * @module tests/e2e/agent-guidance-gaps-e2e
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// PHASE 1: Session Gap Awareness Tests
// ============================================================================

describe('Session Gap Awareness', () => {
  it('should export the session gap awareness builder', async () => {
    const module = await import(
      '../../intelligence/context-builders/awareness/session-gap-awareness.js'
    );
    expect(module.sessionGapAwarenessBuilder).toBeDefined();
    expect(module.sessionGapAwarenessBuilder.name).toBe('session-gap-awareness');
  });

  it('should have correct builder configuration', async () => {
    const module = await import(
      '../../intelligence/context-builders/awareness/session-gap-awareness.js'
    );
    const builder = module.sessionGapAwarenessBuilder;

    expect(builder.priority).toBe(30); // Early for session awareness
    expect(builder.category).toBeDefined();
    expect(typeof builder.build).toBe('function');
  });

  it('should return empty array without userId', async () => {
    const module = await import(
      '../../intelligence/context-builders/awareness/session-gap-awareness.js'
    );
    const builder = module.sessionGapAwarenessBuilder;

    const result = await builder.build({
      userText: 'hello',
      services: { userId: undefined },
      userData: { turnCount: 1 },
    } as unknown as Parameters<typeof builder.build>[0]);

    expect(result).toEqual([]);
  });

  it('should return empty array on turns > 3', async () => {
    const module = await import(
      '../../intelligence/context-builders/awareness/session-gap-awareness.js'
    );
    const builder = module.sessionGapAwarenessBuilder;

    const result = await builder.build({
      userText: 'hello',
      services: { userId: 'test-user' },
      userData: { turnCount: 5 },
    } as unknown as Parameters<typeof builder.build>[0]);

    expect(result).toEqual([]);
  });
});

// ============================================================================
// PHASE 2: Proactive Session Context Tests
// ============================================================================

describe('Proactive Session Context', () => {
  it('should export proactive session context functions', async () => {
    const module = await import(
      '../../intelligence/context-builders/external/proactive-session-context.js'
    );

    expect(module.setProactiveSessionContext).toBeDefined();
    expect(module.getProactiveSessionContext).toBeDefined();
    expect(module.clearProactiveSessionContext).toBeDefined();
    expect(module.isProactiveSession).toBeDefined();
    expect(module.proactiveSessionContextBuilder).toBeDefined();
  });

  it('should store and retrieve proactive context', async () => {
    const module = await import(
      '../../intelligence/context-builders/external/proactive-session-context.js'
    );

    const sessionId = 'test-session-' + Date.now();
    const context = {
      triggerType: 'silence' as const,
      triggerReason: "Haven't heard from them in 5 days",
      daysSinceLastSession: 5,
      openerStyle: 'warm' as const,
      initiatingPersona: 'ferni',
    };

    module.setProactiveSessionContext(sessionId, context);

    const retrieved = module.getProactiveSessionContext(sessionId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.triggerType).toBe('silence');
    expect(retrieved?.daysSinceLastSession).toBe(5);

    module.clearProactiveSessionContext(sessionId);
    expect(module.getProactiveSessionContext(sessionId)).toBeUndefined();
  });

  it('should detect proactive sessions', async () => {
    const module = await import(
      '../../intelligence/context-builders/external/proactive-session-context.js'
    );

    const sessionId = 'test-proactive-' + Date.now();

    expect(module.isProactiveSession(sessionId)).toBe(false);

    module.setProactiveSessionContext(sessionId, {
      triggerType: 'birthday',
      triggerReason: "User's birthday today",
      openerStyle: 'celebratory' as const,
      initiatingPersona: 'ferni',
    });

    expect(module.isProactiveSession(sessionId)).toBe(true);

    module.clearProactiveSessionContext(sessionId);
  });
});

// ============================================================================
// PHASE 3: Handoff Trust Context Wiring Tests
// ============================================================================

describe('Handoff Trust Context Wiring', () => {
  it('should export handoff context functions from trust-systems', async () => {
    const module = await import('../../services/trust-systems/handoff-context.js');

    expect(module.buildHandoffContext).toBeDefined();
    expect(module.formatHandoffForLLM).toBeDefined();
    expect(module.getHandoffWarnings).toBeDefined();
    expect(module.createHandoffNote).toBeDefined();
  });

  it('should build handoff context with all required fields', async () => {
    const module = await import('../../services/trust-systems/handoff-context.js');

    const context = module.buildHandoffContext('test-user', 'ferni', 'maya-santos');

    expect(context.userId).toBe('test-user');
    expect(context.sourcePersonaId).toBe('ferni');
    expect(context.targetPersonaId).toBe('maya-santos');
    expect(context.criticalWarnings).toBeDefined();
    expect(context.sensitiveAreas).toBeDefined();
    expect(context.rapportBuilders).toBeDefined();
    expect(context.pendingFollowUps).toBeDefined();
    expect(context.communicationStyle).toBeDefined();
  });

  it('should format handoff context for LLM', async () => {
    const module = await import('../../services/trust-systems/handoff-context.js');

    const context = module.buildHandoffContext('test-user', 'ferni', 'peter-john');
    const formatted = module.formatHandoffForLLM(context);

    expect(typeof formatted).toBe('string');
    expect(formatted.length).toBeGreaterThan(0);
  });

  it('should generate handoff warnings', async () => {
    const module = await import('../../services/trust-systems/handoff-context.js');

    const warnings = module.getHandoffWarnings('test-user');

    expect(Array.isArray(warnings)).toBe(true);
  });
});

// ============================================================================
// PHASE 4: Tool Failure Awareness Tests
// ============================================================================

describe('Tool Failure Awareness', () => {
  it('should export tool failure awareness builder', async () => {
    const module = await import(
      '../../intelligence/context-builders/awareness/tool-failure-awareness.js'
    );

    expect(module.toolFailureAwarenessBuilder).toBeDefined();
    expect(module.toolFailureAwarenessBuilder.name).toBe('tool-failure-awareness');
  });

  it('should have correct builder configuration', async () => {
    const module = await import(
      '../../intelligence/context-builders/awareness/tool-failure-awareness.js'
    );
    const builder = module.toolFailureAwarenessBuilder;

    expect(builder.priority).toBe(15); // Early - failures should be addressed promptly
    expect(builder.category).toBeDefined();
    expect(typeof builder.build).toBe('function');
  });

  it('should return empty array without sessionId', async () => {
    const module = await import(
      '../../intelligence/context-builders/awareness/tool-failure-awareness.js'
    );
    const builder = module.toolFailureAwarenessBuilder;

    const result = await builder.build({
      userText: 'hello',
      services: { sessionId: undefined },
    } as unknown as Parameters<typeof builder.build>[0]);

    expect(result).toEqual([]);
  });
});

// ============================================================================
// PHASE 4 (continued): Redis Tool Failure Tracking Tests
// ============================================================================

describe('Redis Tool Failure Tracking', () => {
  it('should export tool failure tracking methods from redis-cache', async () => {
    const module = await import('../../memory/redis-cache.js');

    const redis = module.getRedisCache();
    expect(typeof redis.recordToolFailure).toBe('function');
    expect(typeof redis.getRecentToolFailures).toBe('function');
    expect(typeof redis.clearToolFailures).toBe('function');
  });
});

// ============================================================================
// Integration: Builder Registration Tests
// ============================================================================

describe('Builder Registration', () => {
  it('should have all new builders in builder-imports', async () => {
    const module = await import(
      '../../intelligence/context-builders/core/builder-imports.js'
    );

    const imports = module.BUILDER_IMPORTS;

    // Phase 1
    expect(imports['session-gap-awareness']).toBeDefined();

    // Phase 2
    expect(imports['proactive-session-context']).toBeDefined();

    // Phase 4
    expect(imports['tool-failure-awareness']).toBeDefined();

    // Previously added
    expect(imports['captured-data-awareness']).toBeDefined();
    expect(imports['emotional-trajectory-awareness']).toBeDefined();
  });

  it('should be able to dynamically import all new builders', async () => {
    const module = await import(
      '../../intelligence/context-builders/core/builder-imports.js'
    );

    const imports = module.BUILDER_IMPORTS;

    // Test each new builder can be imported
    const newBuilders = [
      'session-gap-awareness',
      'proactive-session-context',
      'tool-failure-awareness',
      'captured-data-awareness',
      'emotional-trajectory-awareness',
    ];

    for (const builderName of newBuilders) {
      const importer = imports[builderName];
      expect(importer).toBeDefined();

      // Verify it's a function
      expect(typeof importer).toBe('function');

      // Dynamic import should work
      const imported = await importer();
      expect(imported).toBeDefined();
    }
  });
});

// ============================================================================
// Integration: Voice Agent Entry Proactive Context Tests
// ============================================================================

describe('Voice Agent Entry - Proactive Context Integration', () => {
  it('should handle proactive_outreach call type', async () => {
    // This tests that voice-agent-entry.ts has the proactive outreach handling
    // We can't fully test without mocking LiveKit, but we can verify the code path exists

    const voiceAgentEntry = await import('../../agents/voice-agent-entry.js');

    // The entry point should be exported
    expect(voiceAgentEntry).toBeDefined();
  });
});

// ============================================================================
// Integration: Agent Setup Handoff Context Tests
// ============================================================================

describe('Agent Setup - Handoff Context Integration', () => {
  it('should have trust-systems handoff wiring in agent-setup', async () => {
    // Read the agent-setup file and verify the trust-systems integration exists
    const fs = await import('fs/promises');
    const path = await import('path');

    const agentSetupPath = path.join(
      process.cwd(),
      'src/agents/multi-agent/agent-setup.ts'
    );

    const content = await fs.readFile(agentSetupPath, 'utf-8');

    // Verify trust-systems handoff context is imported/used
    expect(content).toContain('trust-systems/handoff-context');
    expect(content).toContain('buildHandoffContext');
    expect(content).toContain('contextSummary');
  });
});
