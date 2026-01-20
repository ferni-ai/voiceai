/**
 * Tool Fixtures Loader
 *
 * Loads E2E test fixtures for tool validation.
 * Fixtures define test cases with expected API responses, storage, and insights.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { E2ETestCase, ToolFixture } from '../../../../../src/e2e/types.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PROJECT_ROOT = process.env.FERNI_PROJECT_ROOT || process.cwd();
const FIXTURES_DIR = join(PROJECT_ROOT, 'src', 'e2e', 'fixtures', 'tools');

// ============================================================================
// TYPES
// ============================================================================

export interface LoadOptions {
  /** Load specific tool fixture */
  toolId?: string;
  /** Load all fixtures in a domain */
  domain?: string;
  /** Load all fixtures */
  all?: boolean;
  /** Include incomplete fixtures */
  includeIncomplete?: boolean;
}

interface FixtureFile {
  domain: string;
  tools: ToolFixture[];
}

// ============================================================================
// FIXTURE LOADING
// ============================================================================

/**
 * Load tool fixtures based on criteria.
 */
export async function loadToolFixtures(options: LoadOptions): Promise<E2ETestCase[]> {
  const fixtures: E2ETestCase[] = [];

  // Check if fixtures directory exists
  if (!existsSync(FIXTURES_DIR)) {
    console.log(`  Fixtures directory not found: ${FIXTURES_DIR}`);
    console.log('  Run: ferni tools generate-fixtures');
    return [];
  }

  // Get all fixture files
  const fixtureFiles = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.fixture.ts') || f.endsWith('.fixture.json'));

  if (fixtureFiles.length === 0) {
    console.log('  No fixture files found');
    return [];
  }

  for (const file of fixtureFiles) {
    const filePath = join(FIXTURES_DIR, file);
    const domainName = file.replace(/\.fixture\.(ts|json)$/, '');

    // Skip if filtering by domain and this doesn't match
    if (options.domain && domainName !== options.domain) {
      continue;
    }

    try {
      let fixtureData: FixtureFile;

      if (file.endsWith('.json')) {
        // Load JSON fixture
        const content = readFileSync(filePath, 'utf-8');
        fixtureData = JSON.parse(content);
      } else {
        // Load TypeScript fixture
        const module = await import(filePath);
        fixtureData = {
          domain: domainName,
          tools: module.fixtures || module.default || [],
        };
      }

      // Filter fixtures
      for (const tool of fixtureData.tools) {
        // Skip if filtering by toolId and this doesn't match
        if (options.toolId && tool.toolId !== options.toolId) {
          continue;
        }

        // Skip incomplete unless requested
        if (tool.incomplete && !options.includeIncomplete) {
          continue;
        }

        // Convert to E2ETestCase (keep toolId/toolDomain for executor)
        const testCase: E2ETestCase & { toolId?: string; toolDomain?: string } = {
          id: tool.id || `tool-${tool.toolId}`,
          category: 'tool',
          name: tool.name || tool.toolId,
          description: tool.description,
          tags: tool.tags || [domainName],
          toolId: tool.toolId,
          toolDomain: tool.toolDomain || domainName,
          testParams: tool.testParams || {},
          expectedApiResponse: tool.expectedApiResponse,
          expectedStorage: tool.expectedStorage,
          expectedInsight: tool.expectedInsight,
          skip: tool.skip,
          skipReason: tool.skipReason,
          incomplete: tool.incomplete,
          timeout: tool.timeout,
        };

        fixtures.push(testCase);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`  Warning: Failed to load fixture ${file}: ${msg}`);
    }
  }

  // If searching for specific tool and not found in fixtures, return empty
  if (options.toolId && fixtures.length === 0) {
    console.log(`  No fixture found for tool: ${options.toolId}`);
  }

  return fixtures;
}

/**
 * Get all domains with fixtures.
 */
export function getFixtureDomains(): string[] {
  if (!existsSync(FIXTURES_DIR)) {
    return [];
  }

  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.fixture.ts') || f.endsWith('.fixture.json'))
    .map((f) => f.replace(/\.fixture\.(ts|json)$/, ''));
}

/**
 * Check if a fixture exists for a tool.
 */
export function hasFixture(toolId: string): boolean {
  if (!existsSync(FIXTURES_DIR)) {
    return false;
  }

  const files = readdirSync(FIXTURES_DIR);

  for (const file of files) {
    if (!file.endsWith('.fixture.json')) continue;

    const filePath = join(FIXTURES_DIR, file);
    const content = readFileSync(filePath, 'utf-8');

    try {
      const data = JSON.parse(content) as FixtureFile;
      if (data.tools.some((t) => t.toolId === toolId)) {
        return true;
      }
    } catch {
      // Ignore parse errors
    }
  }

  return false;
}
