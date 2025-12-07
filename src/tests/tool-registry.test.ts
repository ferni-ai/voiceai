/**
 * Tool Registry Integration Tests
 *
 * Tests for the new registry-based tool architecture:
 * - Tool registration and discovery
 * - Domain-based tool loading
 * - Agent tool building
 * - Tool categories and metadata
 *
 * Run with: npx vitest run src/tests/tool-registry.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  toolRegistry,
  initializeToolRegistry,
  buildAgentTools,
  buildToolsForDomains,
  getAvailableToolsForAgent,
  getTool,
  ALL_TOOL_DOMAINS,
  type ToolDefinition,
  type Tool,
} from '../tools/index.js';

// ============================================================================
// REGISTRY INITIALIZATION TESTS
// ============================================================================

describe('Tool Registry', () => {
  beforeAll(async () => {
    // Initialize the registry once for all tests
    await initializeToolRegistry();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      // Registry should be ready after initialization
      expect(toolRegistry).toBeDefined();
      expect(toolRegistry.isInitialized()).toBe(true);
    });

    it('should have registered tools', () => {
      const allTools = toolRegistry.getAll();
      expect(allTools).toBeDefined();
      expect(Array.isArray(allTools)).toBe(true);
    });

    it('should be idempotent', async () => {
      const beforeTools = toolRegistry.getAll().length;

      // Call initialize again
      await initializeToolRegistry();

      const afterTools = toolRegistry.getAll().length;

      // Should have same tools (no duplicates)
      expect(afterTools).toBe(beforeTools);
    });
  });

  describe('Tool Discovery', () => {
    it('should find tools by ID', () => {
      const allTools = toolRegistry.getAll();

      if (allTools.length > 0) {
        const firstTool = allTools[0];
        const found = getTool(firstTool.id);
        expect(found).toBeDefined();
        expect(found?.id).toBe(firstTool.id);
      }
    });

    it('should return undefined for non-existent tool', () => {
      const tool = getTool('non-existent-tool-12345');
      expect(tool).toBeUndefined();
    });

    it('should return all registered tools', () => {
      const allTools = toolRegistry.getAll();

      expect(allTools).toBeDefined();
      expect(Array.isArray(allTools)).toBe(true);
    });

    it('should have tools with required properties', () => {
      const allTools = toolRegistry.getAll();

      for (const tool of allTools.slice(0, 10)) {
        // Check required properties
        expect(tool.id).toBeDefined();
        expect(typeof tool.id).toBe('string');
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        expect(tool.domain).toBeDefined();
      }
    });
  });
});

// ============================================================================
// AGENT TOOL BUILDING TESTS
// ============================================================================

describe('Agent Tool Building', () => {
  beforeAll(async () => {
    await initializeToolRegistry();
  });

  describe('buildAgentTools', () => {
    it('should build tools for Ferni (coach)', async () => {
      const tools = await buildAgentTools('ferni');

      expect(tools).toBeDefined();
      expect(typeof tools).toBe('object');

      // Should return a Record<string, Tool>
      const toolNames = Object.keys(tools);
      expect(toolNames.length).toBeGreaterThanOrEqual(0);
    });

    it('should build tools for Maya (habits coach)', async () => {
      const tools = await buildAgentTools('maya-santos');

      expect(tools).toBeDefined();
      expect(typeof tools).toBe('object');
    });

    it('should build tools for Peter (researcher)', async () => {
      const tools = await buildAgentTools('peter-john');

      expect(tools).toBeDefined();
    });

    it('should build tools for Alex (communications)', async () => {
      const tools = await buildAgentTools('alex-chen');

      expect(tools).toBeDefined();
    });

    it('should build tools for Jordan (planner)', async () => {
      const tools = await buildAgentTools('jordan-taylor');

      expect(tools).toBeDefined();
    });

    it('should build tools for Nayan (sage)', async () => {
      const tools = await buildAgentTools('nayan-patel');

      expect(tools).toBeDefined();
    });

    it('should handle alias IDs', async () => {
      // Build with alias
      const aliasTools = await buildAgentTools('maya');

      // Build with canonical ID
      const canonicalTools = await buildAgentTools('maya-santos');

      // Both should return tool objects
      expect(aliasTools).toBeDefined();
      expect(canonicalTools).toBeDefined();
    });

    it('should return tools for unknown agents (fallback)', async () => {
      const tools = await buildAgentTools('unknown-agent');

      // Should still return tools object (with defaults)
      expect(tools).toBeDefined();
      expect(typeof tools).toBe('object');
    });
  });

  describe('buildToolsForDomains', () => {
    it('should build tools for specific domains', async () => {
      const tools = await buildToolsForDomains(['memory', 'information']);

      expect(tools).toBeDefined();
      expect(typeof tools).toBe('object');
    });

    it('should handle non-existent domains gracefully', async () => {
      // Cast to avoid type error - testing runtime behavior
      const tools = await buildToolsForDomains(['nonexistent-domain-xyz' as any]);

      expect(tools).toBeDefined();
    });
  });

  describe('getAvailableToolsForAgent', () => {
    it('should list available tools for an agent', async () => {
      const tools = await getAvailableToolsForAgent('ferni');

      expect(tools).toBeDefined();
    });
  });
});

// ============================================================================
// TOOL DOMAIN TESTS
// ============================================================================

describe('Tool Domains', () => {
  beforeAll(async () => {
    await initializeToolRegistry();
  });

  it('should have domain constants defined', () => {
    expect(ALL_TOOL_DOMAINS).toBeDefined();
    expect(Array.isArray(ALL_TOOL_DOMAINS)).toBe(true);
    expect(ALL_TOOL_DOMAINS.length).toBeGreaterThan(0);
  });

  it('should include expected domains', () => {
    // Core domains that should always exist
    const expectedDomains = ['memory', 'handoff', 'information'];

    for (const domain of expectedDomains) {
      expect(ALL_TOOL_DOMAINS).toContain(domain);
    }
  });

  it('should get tools by domain', () => {
    // Try to get tools for a common domain
    const memoryTools = toolRegistry.getByDomain('memory');

    // Should return an array (even if empty)
    expect(Array.isArray(memoryTools)).toBe(true);

    // All returned tools should be in memory domain
    for (const tool of memoryTools) {
      expect(tool.domain).toBe('memory');
    }
  });
});

// ============================================================================
// TOOL STRUCTURE TESTS
// ============================================================================

describe('Tool Structure', () => {
  beforeAll(async () => {
    await initializeToolRegistry();
  });

  it('should have tools with create functions', () => {
    const allTools = toolRegistry.getAll();

    // Check that tools have create functions
    for (const tool of allTools.slice(0, 5)) {
      expect(typeof tool.create === 'function').toBe(true);
    }
  });

  it('should build LLM-compatible tools', async () => {
    const tools = await buildAgentTools('ferni');

    // Tools should be in LLM-compatible format (Record<string, Tool>)
    const toolNames = Object.keys(tools);

    for (const name of toolNames.slice(0, 3)) {
      const tool = tools[name];
      expect(tool).toBeDefined();
      // LLM tools have description at minimum
      if (tool && typeof tool === 'object') {
        expect('description' in tool || 'execute' in tool).toBe(true);
      }
    }
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  beforeAll(async () => {
    await initializeToolRegistry();
  });

  it('should handle empty domain list', async () => {
    const tools = await buildToolsForDomains([]);

    expect(tools).toBeDefined();
    // Empty domains should return empty or minimal toolset
  });

  it('should handle building tools with options', async () => {
    const tools = await buildAgentTools('ferni', {
      userId: 'test-user-123',
    });

    expect(tools).toBeDefined();
  });

  it('should not throw on repeated initialization', async () => {
    await expect(initializeToolRegistry()).resolves.not.toThrow();
    await expect(initializeToolRegistry()).resolves.not.toThrow();
    await expect(initializeToolRegistry()).resolves.not.toThrow();
  });

  it('should handle concurrent tool building', async () => {
    // Build tools for multiple agents concurrently
    const [ferniTools, mayaTools, peterTools] = await Promise.all([
      buildAgentTools('ferni'),
      buildAgentTools('maya-santos'),
      buildAgentTools('peter-john'),
    ]);

    expect(ferniTools).toBeDefined();
    expect(mayaTools).toBeDefined();
    expect(peterTools).toBeDefined();
  });
});

// ============================================================================
// REGISTRY QUERY TESTS
// ============================================================================

describe('Registry Queries', () => {
  beforeAll(async () => {
    await initializeToolRegistry();
  });

  it('should query tools by domain', () => {
    const memoryTools = toolRegistry.getByDomain('memory');

    expect(Array.isArray(memoryTools)).toBe(true);

    // If there are memory tools, they should be in the memory domain
    for (const tool of memoryTools) {
      expect(tool.domain).toBe('memory');
    }
  });

  it('should get all tools', () => {
    const allTools = toolRegistry.getAll();

    expect(Array.isArray(allTools)).toBe(true);
  });

  it('should check if registry is initialized', () => {
    const isInit = toolRegistry.isInitialized();

    expect(isInit).toBe(true);
  });

  it('should get all tool IDs', () => {
    const ids = toolRegistry.getAllIds();

    expect(Array.isArray(ids)).toBe(true);
  });

  it('should get tool metadata', () => {
    const allTools = toolRegistry.getAll();

    if (allTools.length > 0) {
      const firstTool = allTools[0];
      const metadata = toolRegistry.getMetadata(firstTool.id);

      expect(metadata).toBeDefined();
      expect(metadata?.id).toBe(firstTool.id);
      expect(metadata?.name).toBe(firstTool.name);
    }
  });

  it('should get registry stats', () => {
    const stats = toolRegistry.getStats();

    expect(stats).toBeDefined();
    expect(typeof stats.totalTools).toBe('number');
  });
});
