/**
 * Tool Fixtures Generator
 *
 * Auto-generates E2E fixture stubs for all Ferni tools.
 * Scans tool registry and creates JSON fixtures with:
 * - Default test parameters inferred from Zod schemas
 * - Storage expectations based on tool domain
 * - Insight expectations based on tool category
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import type { ToolFixture, StorageExpectation } from '../../../../../src/e2e/types.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PROJECT_ROOT = process.env.FERNI_PROJECT_ROOT || process.cwd();
const FIXTURES_DIR = join(PROJECT_ROOT, 'src', 'e2e', 'fixtures', 'tools');

// ============================================================================
// TYPES
// ============================================================================

export interface GenerateOptions {
  /** Generate for specific domain only */
  domain?: string;
  /** Overwrite existing fixtures */
  force?: boolean;
}

export interface GenerateResult {
  created: number;
  skipped: number;
  domains: string[];
}

// ============================================================================
// STORAGE PATH INFERENCE
// ============================================================================

/**
 * Infer storage expectations based on tool domain and ID.
 */
function inferStorageExpectations(domain: string, toolId: string): StorageExpectation[] {
  // Map domains to common storage paths
  const domainStorageMap: Record<string, StorageExpectation[]> = {
    habits: [
      {
        path: 'bogle_users/{userId}/habits',
        exists: true,
        requiredFields: ['name', 'frequency'],
      },
    ],
    career: [
      {
        path: 'bogle_users/{userId}/career',
        exists: true,
      },
    ],
    calendar: [
      {
        path: 'bogle_users/{userId}/calendar_events',
        exists: true,
      },
    ],
    contacts: [
      {
        path: 'bogle_users/{userId}/contacts',
        exists: true,
      },
    ],
    memory: [
      {
        path: 'bogle_users/{userId}/memories',
        exists: true,
      },
    ],
    finance: [
      {
        path: 'bogle_users/{userId}/bills',
        exists: true,
      },
    ],
    wellness: [
      {
        path: 'bogle_users/{userId}/wellness',
        exists: true,
      },
    ],
    goals: [
      {
        path: 'bogle_users/{userId}/goals',
        exists: true,
      },
    ],
    tasks: [
      {
        path: 'bogle_users/{userId}/tasks',
        exists: true,
      },
    ],
  };

  return domainStorageMap[domain] || [];
}

/**
 * Infer if a tool should create insights based on its category.
 */
function shouldCreateInsight(domain: string, toolId: string): boolean {
  // Tools that typically create cross-persona insights
  const insightDomains = [
    'habits',
    'career',
    'wellness',
    'goals',
    'relationships',
    'learning',
    'life-planning',
  ];

  // Tool patterns that create insights
  const insightPatterns = [
    'track',
    'log',
    'record',
    'complete',
    'analyze',
    'assess',
    'evaluate',
    'create',
    'add',
    'set',
  ];

  if (insightDomains.includes(domain)) {
    return insightPatterns.some((p) => toolId.toLowerCase().includes(p));
  }

  return false;
}

/**
 * Generate default test params for a tool based on its schema.
 */
function generateDefaultParams(
  toolId: string,
  description: string,
  domain: string
): Record<string, unknown> {
  // Common parameter patterns
  const params: Record<string, unknown> = {};

  // Always include userId for tracking
  params.userId = '{testUserId}';

  // Infer from tool ID patterns
  const lowerToolId = toolId.toLowerCase();

  // Company-related
  if (lowerToolId.includes('job') || lowerToolId.includes('application')) {
    params.company = 'Test Company';
  }

  // Habit-related
  if (lowerToolId.includes('habit')) {
    params.habitId = 'test-habit-id';
    if (lowerToolId.includes('create') || lowerToolId.includes('add')) {
      params.name = 'Test Habit';
      params.frequency = 'daily';
    }
  }

  // Contact-related
  if (lowerToolId.includes('contact')) {
    params.name = 'Test Contact';
  }

  // Calendar-related
  if (lowerToolId.includes('event') || lowerToolId.includes('calendar')) {
    params.title = 'Test Event';
    params.date = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  }

  // Goal-related
  if (lowerToolId.includes('goal')) {
    params.goal = 'Test Goal';
  }

  // Memory-related
  if (lowerToolId.includes('memory') || lowerToolId.includes('remember')) {
    params.content = 'Test memory content';
  }

  // Search/query patterns
  if (lowerToolId.includes('search') || lowerToolId.includes('find') || lowerToolId.includes('query')) {
    params.query = 'test query';
  }

  return params;
}

// ============================================================================
// FIXTURE GENERATION
// ============================================================================

/**
 * Generate fixtures for all tools.
 */
export async function generateFixtures(options: GenerateOptions): Promise<GenerateResult> {
  const result: GenerateResult = {
    created: 0,
    skipped: 0,
    domains: [],
  };

  console.log('  Loading tool registry...');

  // Dynamic imports
  const { toolRegistry } = await import('../../../../../src/tools/registry/index.js');
  const { autoRegisterAllDomains, initializeToolRegistry, getLoadedDomains } = await import(
    '../../../../../src/tools/registry/loader.js'
  );

  // Initialize (load all domains)
  await autoRegisterAllDomains();
  await initializeToolRegistry({ lazyLoading: false });

  // Get all loaded domains
  const loadedDomains = getLoadedDomains();

  console.log(`  Found ${loadedDomains.length} domains\n`);

  // Ensure fixtures directory exists
  if (!existsSync(FIXTURES_DIR)) {
    mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  for (const domainName of loadedDomains) {
    // Skip if filtering by domain
    if (options.domain && domainName !== options.domain) {
      continue;
    }

    const fixtureFile = join(FIXTURES_DIR, `${domainName}.fixture.json`);
    const existingFixtures: ToolFixture[] = [];

    // Load existing fixtures if not forcing
    if (!options.force && existsSync(fixtureFile)) {
      try {
        const content = readFileSync(fixtureFile, 'utf-8');
        const data = JSON.parse(content);
        existingFixtures.push(...(data.tools || []));
      } catch {
        // Ignore parse errors
      }
    }

    // Get tools for this domain
    const domainTools = toolRegistry.getByDomain(domainName);

    // Generate fixtures for each tool in domain
    const fixtures: ToolFixture[] = [];

    for (const tool of domainTools) {
      // Check if fixture already exists
      const existing = existingFixtures.find((f) => f.toolId === tool.id);
      if (existing && !options.force) {
        fixtures.push(existing);
        result.skipped++;
        continue;
      }

      // Generate fixture stub
      const fixture: ToolFixture = {
        // E2ETestCase required fields
        id: `tool-${tool.id}`,
        category: 'tool',
        name: tool.name,
        description: tool.description || `Test for ${tool.name}`,
        tags: tool.tags || [domainName],
        testParams: generateDefaultParams(tool.id, tool.description || '', domainName),

        // ToolFixture specific fields
        toolId: tool.id,
        toolDomain: domainName,

        // Storage expectations
        expectedStorage: inferStorageExpectations(domainName, tool.id),

        // Insight expectations
        expectedInsight: shouldCreateInsight(domainName, tool.id)
          ? { anyInsight: true }
          : undefined,

        // Mark as incomplete until manually verified
        incomplete: true,
      };

      fixtures.push(fixture);
      result.created++;
    }

    // Write fixture file
    if (fixtures.length > 0) {
      const fixtureData = {
        domain: domainName,
        description: `E2E fixtures for ${domainName} domain tools`,
        generatedAt: new Date().toISOString(),
        tools: fixtures,
      };

      writeFileSync(fixtureFile, JSON.stringify(fixtureData, null, 2));
      result.domains.push(domainName);
      console.log(`  ${domainName}: ${fixtures.length} fixtures`);
    }
  }

  console.log('');
  return result;
}
