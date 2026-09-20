/**
 * Life Automation Tool Domains Tests
 *
 * Tests for the tool domain implementations:
 * - commerce
 * - documents
 * - meal-planning
 * - workflows
 * - transportation
 */

import { describe, it, expect } from 'vitest';
// Tool domains were standardised on createDomainExport(), whose
// getToolDefinitions() is ASYNC. These suites read the definitions
// synchronously, so they use the `definitions` array each domain also exports.
import { definitions as commerceDefinitions } from '../../tools/domains/commerce/index.js';
import { definitions as documentDefinitions } from '../../tools/domains/documents/index.js';
import { definitions as mealPlanningDefinitions } from '../../tools/domains/meal-planning/index.js';
import { definitions as workflowDefinitions } from '../../tools/domains/workflows/index.js';
import { definitions as transportationDefinitions } from '../../tools/domains/transportation/index.js';
import type { ToolDefinition } from '../../tools/registry/types.js';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function validateToolDefinition(tool: ToolDefinition): void {
  expect(tool.id).toBeDefined();
  expect(typeof tool.id).toBe('string');
  expect(tool.name).toBeDefined();
  expect(typeof tool.name).toBe('string');
  expect(tool.description).toBeDefined();
  expect(typeof tool.description).toBe('string');
  expect(tool.domain).toBeDefined();
  expect(Array.isArray(tool.tags)).toBe(true);
  expect(typeof tool.create).toBe('function');
}

// ============================================================================
// COMMERCE TOOLS TESTS
// ============================================================================

describe('Commerce Tool Domain', () => {
  const tools = commerceDefinitions;

  it('should export tool definitions', () => {
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('should have all tools in commerce domain', () => {
    for (const tool of tools) {
      expect(tool.domain).toBe('commerce');
    }
  });

  it('should have valid tool definitions', () => {
    for (const tool of tools) {
      validateToolDefinition(tool);
    }
  });

  it('should have expected commerce tools', () => {
    const toolIds = tools.map((t) => t.id);
    expect(toolIds).toContain('orderGroceries');
    expect(toolIds).toContain('detectSubscriptions');
    expect(toolIds).toContain('getSubscriptionSummary');
    expect(toolIds).toContain('trackRenewal');
    expect(toolIds).toContain('cancelSubscription');
  });

  it('should create tools with context', () => {
    const ctx = { userId: 'test-user', personaId: 'ferni' };
    for (const toolDef of tools) {
      const tool = toolDef.create(ctx);
      expect(tool).toBeDefined();
    }
  });
});

// ============================================================================
// DOCUMENTS TOOLS TESTS
// ============================================================================

describe('Documents Tool Domain', () => {
  const tools = documentDefinitions;

  it('should export tool definitions', () => {
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('should have all tools in documents domain', () => {
    for (const tool of tools) {
      expect(tool.domain).toBe('documents');
    }
  });

  it('should have valid tool definitions', () => {
    for (const tool of tools) {
      validateToolDefinition(tool);
    }
  });

  it('should have expected document tools', () => {
    const toolIds = tools.map((t) => t.id);
    expect(toolIds).toContain('saveDocument');
    expect(toolIds).toContain('findDocument');
    expect(toolIds).toContain('trackExpiration');
    expect(toolIds).toContain('getWarrantyStatus');
    expect(toolIds).toContain('organizeReceipts');
  });

  it('should create tools with context', () => {
    const ctx = { userId: 'test-user', personaId: 'ferni' };
    for (const toolDef of tools) {
      const tool = toolDef.create(ctx);
      expect(tool).toBeDefined();
    }
  });
});

// ============================================================================
// MEAL PLANNING TOOLS TESTS
// ============================================================================

describe('Meal Planning Tool Domain', () => {
  const tools = mealPlanningDefinitions;

  it('should export tool definitions', () => {
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('should have all tools in meal-planning domain', () => {
    for (const tool of tools) {
      expect(tool.domain).toBe('meal-planning');
    }
  });

  it('should have valid tool definitions', () => {
    for (const tool of tools) {
      validateToolDefinition(tool);
    }
  });

  it('should have expected meal planning tools', () => {
    const toolIds = tools.map((t) => t.id);
    expect(toolIds).toContain('planWeeklyMeals');
    expect(toolIds).toContain('addRecipe');
    expect(toolIds).toContain('searchRecipes');
    expect(toolIds).toContain('suggestMeals');
    expect(toolIds).toContain('generateShoppingList');
    expect(toolIds).toContain('trackDietaryPreferences');
    expect(toolIds).toContain('markRecipeCooked');
  });

  it('should create tools with context', () => {
    const ctx = { userId: 'test-user', personaId: 'ferni' };
    for (const toolDef of tools) {
      const tool = toolDef.create(ctx);
      expect(tool).toBeDefined();
    }
  });
});

// ============================================================================
// WORKFLOWS TOOLS TESTS
// ============================================================================

describe('Workflows Tool Domain', () => {
  const tools = workflowDefinitions;

  it('should export tool definitions', () => {
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('should have all tools in workflows domain', () => {
    for (const tool of tools) {
      expect(tool.domain).toBe('workflows');
    }
  });

  it('should have valid tool definitions', () => {
    for (const tool of tools) {
      validateToolDefinition(tool);
    }
  });

  it('should have expected workflow tools', () => {
    const toolIds = tools.map((t) => t.id);
    expect(toolIds).toContain('createAutomation');
    expect(toolIds).toContain('listAutomations');
    expect(toolIds).toContain('listWorkflowTemplates');
    expect(toolIds).toContain('triggerAutomation');
    expect(toolIds).toContain('pauseAutomation');
    expect(toolIds).toContain('resumeAutomation');
    expect(toolIds).toContain('deleteAutomation');
  });

  it('should create tools with context', () => {
    const ctx = { userId: 'test-user', personaId: 'ferni' };
    for (const toolDef of tools) {
      const tool = toolDef.create(ctx);
      expect(tool).toBeDefined();
    }
  });
});

// ============================================================================
// TRANSPORTATION TOOLS TESTS
// ============================================================================

describe('Transportation Tool Domain', () => {
  const tools = transportationDefinitions;

  it('should export tool definitions', () => {
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('should have all tools in transportation domain', () => {
    for (const tool of tools) {
      expect(tool.domain).toBe('transportation');
    }
  });

  it('should have valid tool definitions', () => {
    for (const tool of tools) {
      validateToolDefinition(tool);
    }
  });

  it('should have expected transportation tools', () => {
    const toolIds = tools.map((t) => t.id);
    expect(toolIds).toContain('requestRide');
    expect(toolIds).toContain('comparePrices');
    expect(toolIds).toContain('getRideStatus');
    expect(toolIds).toContain('cancelRide');
    expect(toolIds).toContain('getCommuteTime');
    expect(toolIds).toContain('scheduleRide');
  });

  it('should create tools with context', () => {
    const ctx = { userId: 'test-user', personaId: 'ferni' };
    for (const toolDef of tools) {
      const tool = toolDef.create(ctx);
      expect(tool).toBeDefined();
    }
  });
});

// ============================================================================
// DOMAIN REGISTRY TESTS
// ============================================================================

describe('Tool Domain Registry', () => {
  it('should have unique tool IDs across all life automation domains', () => {
    const allTools = [
      ...commerceDefinitions,
      ...documentDefinitions,
      ...mealPlanningDefinitions,
      ...workflowDefinitions,
      ...transportationDefinitions,
    ];

    const ids = allTools.map((t) => t.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have tools in the correct domain categories', () => {
    // Commerce tools should have shopping/subscription related tags
    const commerceTools = commerceDefinitions;
    const commerceTags = commerceTools.flatMap((t) => t.tags);
    expect(commerceTags.some((t) => ['grocery', 'subscription', 'shopping'].includes(t))).toBe(
      true
    );

    // Document tools should have document-related tags
    const docTools = documentDefinitions;
    const docTags = docTools.flatMap((t) => t.tags);
    expect(docTags.some((t) => ['document', 'receipt', 'warranty'].includes(t))).toBe(true);

    // Meal tools should have food-related tags
    const mealTools = mealPlanningDefinitions;
    const mealTags = mealTools.flatMap((t) => t.tags);
    expect(mealTags.some((t) => ['meal', 'recipe', 'shopping'].includes(t))).toBe(true);

    // Workflow tools should have automation-related tags
    const workflowTools = workflowDefinitions;
    const workflowTags = workflowTools.flatMap((t) => t.tags);
    expect(workflowTags.some((t) => ['automation', 'workflow', 'trigger'].includes(t))).toBe(true);

    // Transportation tools should have ride-related tags
    const transportTools = transportationDefinitions;
    const transportTags = transportTools.flatMap((t) => t.tags);
    expect(transportTags.some((t) => ['uber', 'lyft', 'ride', 'transport'].includes(t))).toBe(true);
  });
});
