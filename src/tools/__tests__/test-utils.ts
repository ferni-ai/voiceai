/**
 * Shared Test Utilities for Tool Testing
 *
 * Provides mock factories, test contexts, and common assertions
 * for testing tool domains consistently.
 *
 * Usage:
 *   import { createMockContext, executeWithContext, assertNoPlaceholders } from '../__tests__/test-utils.js';
 */

import { vi } from 'vitest';
import type { ServiceRegistry, ToolContext, ToolDefinition } from '../registry/types.js';

// ============================================================================
// MOCK FACTORIES
// ============================================================================

/**
 * Create a mock logger that captures calls
 */
export function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => createMockLogger()),
  };
}

/**
 * Create a mock service registry
 */
export function createMockServiceRegistry(services: Record<string, unknown> = {}): ServiceRegistry {
  return {
    has: (service: string) => service in services,
    get: <T>(service: string): T => {
      if (!(service in services)) {
        throw new Error(`Service not available: ${service}`);
      }
      return services[service] as T;
    },
    getOptional: <T>(service: string): T | undefined => {
      return services[service] as T | undefined;
    },
  };
}

/**
 * Create a standard mock tool context
 */
export function createMockContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: createMockServiceRegistry(),
    ...overrides,
  };
}

// ============================================================================
// TOOL EXECUTION HELPERS
// ============================================================================

/**
 * Execute a tool with context (handles tools that need ctx in second arg)
 */
export async function executeWithContext(
  tool: {
    execute: (params: Record<string, unknown>, context?: { ctx: ToolContext }) => Promise<unknown>;
  },
  params: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const result = await tool.execute(params, { ctx });
  return result as string;
}

/**
 * Execute a tool without context (simpler tools)
 */
export async function executeTool(
  tool: { execute: (params: Record<string, unknown>) => Promise<unknown> },
  params: Record<string, unknown>
): Promise<string> {
  const result = await tool.execute(params);
  return result as string;
}

/**
 * Find and create a tool from definitions
 */
export function findAndCreateTool(
  definitions: ToolDefinition[],
  toolId: string,
  ctx: ToolContext
):
  | {
      execute: (
        params: Record<string, unknown>,
        context?: { ctx: ToolContext }
      ) => Promise<unknown>;
    }
  | undefined {
  const toolDef = definitions.find((t) => t.id === toolId);
  if (!toolDef) return undefined;
  return toolDef.create(ctx);
}

// ============================================================================
// ASSERTIONS
// ============================================================================

/**
 * Assert no placeholder text in response
 */
export function assertNoPlaceholders(result: string): void {
  const placeholders = ['TODO', 'FIXME', 'placeholder', 'undefined', 'null', '[object Object]'];
  for (const placeholder of placeholders) {
    if (result.includes(placeholder)) {
      throw new Error(
        `Response contains placeholder text: "${placeholder}"\nFull response: ${result.substring(0, 200)}`
      );
    }
  }
}

/**
 * Assert response has minimum content
 */
export function assertMinimumContent(result: string, minLength = 50): void {
  if (result.length < minLength) {
    throw new Error(
      `Response too short (${result.length} chars, expected ${minLength}+): ${result}`
    );
  }
}

/**
 * Assert response contains expected keywords
 */
export function assertContainsKeywords(result: string, keywords: string[]): void {
  const lowerResult = result.toLowerCase();
  const missing = keywords.filter((kw) => !lowerResult.includes(kw.toLowerCase()));
  if (missing.length > 0) {
    throw new Error(
      `Response missing keywords: ${missing.join(', ')}\nResponse: ${result.substring(0, 200)}`
    );
  }
}

// ============================================================================
// MOCK SETUP HELPERS
// ============================================================================

/**
 * Standard mocks for safe-logger
 */
export function setupLoggerMock() {
  return {
    getLogger: () => createMockLogger(),
    safeLog: () => createMockLogger(),
    createLogger: () => createMockLogger(),
  };
}

/**
 * Standard mocks for @livekit/agents
 */
export function setupLiveKitMock() {
  return {
    llm: {
      tool: vi.fn((config) => ({
        description: config.description,
        parameters: config.parameters,
        execute: config.execute,
      })),
    },
    log: createMockLogger(),
  };
}

/**
 * Standard mocks for persistence
 */
export function setupPersistenceMock() {
  return {
    persistTrackedItem: vi.fn(),
    persistKeyMoment: vi.fn(),
  };
}

/**
 * Standard mocks for analytics
 */
export function setupAnalyticsMock() {
  return {
    trackToolUsage: vi.fn(() => ({
      success: vi.fn(),
      error: vi.fn(),
    })),
    isLifeCoachAnalyticsEnabled: vi.fn(() => false),
    persistTrackedItem: vi.fn(),
    persistKeyMoment: vi.fn(),
  };
}

// ============================================================================
// TEST GENERATORS
// ============================================================================

/**
 * Generate standard test cases for a domain
 */
export function generateDomainTestSuite(
  domainName: string,
  getToolDefinitions: () => Promise<ToolDefinition[]>,
  expectedToolIds: string[],
  sampleExecutions: Array<{
    toolId: string;
    params: Record<string, unknown>;
    expectedKeywords?: string[];
  }>
) {
  return {
    domainName,
    getToolDefinitions,
    expectedToolIds,
    sampleExecutions,
  };
}
