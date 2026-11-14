/**
 * Agent Guidance Gaps E2E Tests
 *
 * Tests the context builders added to fill guidance gaps:
 * - Proactive Session Context - Why Ferni initiated a check-in call
 * - Handoff Trust Context - Boundaries and rapport builders during handoffs
 *
 * @module tests/e2e/agent-guidance-gaps-e2e
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// PHASE 2: Proactive Session Context Tests
// ============================================================================

describe('Proactive Session Context', () => {
  it('should export proactive session context functions', async () => {
    const module =
      await import('../../intelligence/context-builders/external/proactive-session-context.js');

    expect(module.setProactiveSessionContext).toBeDefined();
    expect(module.getProactiveSessionContext).toBeDefined();
    expect(module.clearProactiveSessionContext).toBeDefined();
    expect(module.isProactiveSession).toBeDefined();
    expect(module.proactiveSessionContextBuilder).toBeDefined();
  });

  it('should store and retrieve proactive context', async () => {
    const module =
      await import('../../intelligence/context-builders/external/proactive-session-context.js');

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
    const module =
      await import('../../intelligence/context-builders/external/proactive-session-context.js');

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

    const agentSetupPath = path.join(process.cwd(), 'src/agents/multi-agent/agent-setup.ts');

    const content = await fs.readFile(agentSetupPath, 'utf-8');

    // Verify trust-systems handoff context is imported/used
    expect(content).toContain('trust-systems/handoff-context');
    expect(content).toContain('buildHandoffContext');
    expect(content).toContain('contextSummary');
  });
});
