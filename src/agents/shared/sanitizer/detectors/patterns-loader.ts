/**
 * Tool Patterns Loader
 *
 * Loads and caches tool patterns from the JSON configuration.
 * Single source of truth for all tool patterns in the sanitizer.
 *
 * @module agents/shared/sanitizer/detectors/patterns-loader
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../../../../utils/safe-logger.js';
import type { ToolPatternsConfig } from '../types.js';

// Resolve the JSON file path robustly for both dev and production
function loadToolPatternsJson(): ToolPatternsConfig {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Try multiple possible locations for the JSON file
  const possiblePaths = [
    // Relative to this file in src
    join(__dirname, '../config/tool-patterns.json'),
    // Relative to this file in dist
    join(__dirname, '../../config/tool-patterns.json'),
    // From app root (dist)
    join(process.cwd(), 'dist/agents/shared/sanitizer/config/tool-patterns.json'),
    // From app root (src - for dev)
    join(process.cwd(), 'src/agents/shared/sanitizer/config/tool-patterns.json'),
  ];

  for (const filePath of possiblePaths) {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as ToolPatternsConfig;
    }
  }

  // If no file found, return a minimal default config to avoid crashes
  console.warn('[patterns-loader] Could not find tool-patterns.json, using defaults');
  return {
    domains: {},
    paramPatterns: [],
    teamMemberNames: ['ferni', 'maya', 'alex', 'jordan', 'peter', 'nayan'],
    slowTools: [],
  };
}

const toolPatternsJson = loadToolPatternsJson();

const log = createLogger({ module: 'patterns-loader' });

// ============================================================================
// CACHED PATTERN DATA
// ============================================================================

let cachedPatterns: string[] | null = null;
let cachedConfig: ToolPatternsConfig | null = null;

/**
 * Get the full patterns configuration
 */
export function getToolPatternsConfig(): ToolPatternsConfig {
  if (!cachedConfig) {
    cachedConfig = toolPatternsJson as ToolPatternsConfig;
    log.debug(
      'Loaded tool patterns config with',
      Object.keys(cachedConfig.domains).length,
      'domains'
    );
  }
  return cachedConfig;
}

/**
 * Get flattened array of all tool name patterns
 */
export function getAllToolPatterns(): string[] {
  if (!cachedPatterns) {
    const config = getToolPatternsConfig();
    cachedPatterns = [];

    for (const domain of Object.values(config.domains)) {
      cachedPatterns.push(...domain.patterns);
    }

    // Remove duplicates
    cachedPatterns = [...new Set(cachedPatterns)];
    log.debug('Compiled', cachedPatterns.length, 'unique tool patterns');
  }
  return cachedPatterns;
}

/**
 * Get parameter patterns for detection
 */
export function getParamPatterns(): string[] {
  return getToolPatternsConfig().paramPatterns;
}

/**
 * Get team member names for handoff detection
 */
export function getTeamMemberNames(): string[] {
  return getToolPatternsConfig().teamMemberNames;
}

/**
 * Get slow tools that need acknowledgments
 */
export function getSlowTools(): string[] {
  return getToolPatternsConfig().slowTools;
}

/**
 * Get patterns for a specific domain
 */
export function getDomainPatterns(domainName: string): string[] {
  const config = getToolPatternsConfig();
  const domain = config.domains[domainName];
  return domain?.patterns ?? [];
}

/**
 * Check if a domain is marked as critical
 */
export function isDomainCritical(domainName: string): boolean {
  const config = getToolPatternsConfig();
  const domain = config.domains[domainName];
  return domain?.critical ?? false;
}

/**
 * Get all domain names
 */
export function getDomainNames(): string[] {
  return Object.keys(getToolPatternsConfig().domains);
}

/**
 * Find which domain a tool pattern belongs to
 */
export function findDomainForPattern(pattern: string): string | null {
  const config = getToolPatternsConfig();
  const lowerPattern = pattern.toLowerCase();

  for (const [name, domain] of Object.entries(config.domains)) {
    if (domain.patterns.some((p) => p.toLowerCase() === lowerPattern)) {
      return name;
    }
  }
  return null;
}

/**
 * Clear cached patterns (useful for testing)
 */
export function clearPatternsCache(): void {
  cachedPatterns = null;
  cachedConfig = null;
}
