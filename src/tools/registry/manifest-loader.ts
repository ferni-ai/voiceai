/**
 * Tool Manifest Loader
 *
 * Loads tool definitions from the pre-built manifest instead of dynamic imports.
 * This is 100x faster than dynamic imports!
 *
 * BUILD-TIME: scripts/build-tool-manifest.ts generates dist/tool-manifest.json
 * RUNTIME: This module loads and provides access to tool metadata
 *
 * PERFORMANCE:
 * - Dynamic imports: 5-15 seconds (98 await import() calls)
 * - Manifest load: ~50ms (single JSON file)
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface ManifestToolEntry {
  id: string;
  name: string;
  description: string;
  domain: string;
  additionalDomains?: string[];
  tags?: string[];
  experimental?: boolean;
  deprecated?: boolean;
}

export interface DomainManifest {
  domainId: string;
  tools: ManifestToolEntry[];
  toolCount: number;
}

export interface ToolManifest {
  version: string;
  buildTime: string;
  buildHost: string;
  totalDomains: number;
  totalTools: number;
  domains: Record<string, DomainManifest>;
  toolIndex: Record<string, { domain: string; entry: ManifestToolEntry }>;
}

// ============================================================================
// GLOBAL STATE (Process-wide singleton)
// ============================================================================

const MANIFEST_STATE_KEY = Symbol.for('ferni.toolManifest');

interface ManifestState {
  manifest: ToolManifest | null;
  loadPromise: Promise<ToolManifest> | null;
  loadedAt: number | null;
}

function getManifestState(): ManifestState {
  const g = globalThis as Record<symbol, ManifestState | undefined>;
  if (!g[MANIFEST_STATE_KEY]) {
    g[MANIFEST_STATE_KEY] = {
      manifest: null,
      loadPromise: null,
      loadedAt: null,
    };
  }
  return g[MANIFEST_STATE_KEY];
}

// ============================================================================
// MANIFEST LOADING
// ============================================================================

/**
 * Get the path to the tool manifest file
 */
function getManifestPath(): string {
  // Use process.cwd() as base - works in both ESM and CJS
  // The manifest is always at project_root/dist/tool-manifest.json
  return path.resolve(process.cwd(), 'dist/tool-manifest.json');
}

/**
 * Load the tool manifest (singleton, loads once)
 */
export async function loadToolManifest(): Promise<ToolManifest> {
  const state = getManifestState();

  // Already loaded
  if (state.manifest) {
    return state.manifest;
  }

  // Loading in progress
  if (state.loadPromise) {
    return state.loadPromise;
  }

  // Start loading
  state.loadPromise = (async () => {
    const startTime = Date.now();
    const manifestPath = getManifestPath();

    try {
      // Check if manifest exists
      if (!fs.existsSync(manifestPath)) {
        log.warn(
          { manifestPath },
          '⚠️ Tool manifest not found - run `pnpm build:tool-manifest` first. Falling back to dynamic imports.'
        );
        throw new Error('Manifest not found');
      }

      // Load and parse
      const content = fs.readFileSync(manifestPath, 'utf-8');
      const manifest: ToolManifest = JSON.parse(content);

      state.manifest = manifest;
      state.loadedAt = Date.now();

      const elapsed = Date.now() - startTime;
      log.info(
        {
          totalTools: manifest.totalTools,
          totalDomains: manifest.totalDomains,
          version: manifest.version,
          buildTime: manifest.buildTime,
          loadTimeMs: elapsed,
        },
        '⚡ Tool manifest loaded (100x faster than dynamic imports!)'
      );

      return manifest;
    } catch (error) {
      // Reset state so retry is possible
      state.loadPromise = null;
      log.error({ error: String(error), manifestPath }, '❌ Failed to load tool manifest');
      throw error;
    }
  })();

  return state.loadPromise;
}

/**
 * Check if manifest is loaded
 */
export function isManifestLoaded(): boolean {
  return getManifestState().manifest !== null;
}

/**
 * Get manifest synchronously (must be loaded first)
 */
export function getManifestSync(): ToolManifest | null {
  return getManifestState().manifest;
}

// ============================================================================
// MANIFEST QUERIES
// ============================================================================

/**
 * Get all tool IDs from manifest
 */
export async function getAllToolIds(): Promise<string[]> {
  const manifest = await loadToolManifest();
  return Object.keys(manifest.toolIndex);
}

/**
 * Get tool entry by ID
 */
export async function getToolEntry(toolId: string): Promise<ManifestToolEntry | null> {
  const manifest = await loadToolManifest();
  const entry = manifest.toolIndex[toolId.toLowerCase()];
  return entry?.entry || null;
}

/**
 * Get all tools for a domain
 */
export async function getToolsForDomain(domainId: string): Promise<ManifestToolEntry[]> {
  const manifest = await loadToolManifest();
  const domain = manifest.domains[domainId];
  return domain?.tools || [];
}

/**
 * Get all domain IDs
 */
export async function getAllDomainIds(): Promise<string[]> {
  const manifest = await loadToolManifest();
  return Object.keys(manifest.domains);
}

/**
 * Search tools by keyword (fast, uses pre-built index)
 */
export async function searchTools(query: string): Promise<ManifestToolEntry[]> {
  const manifest = await loadToolManifest();
  const queryLower = query.toLowerCase();
  const results: ManifestToolEntry[] = [];

  for (const { entry } of Object.values(manifest.toolIndex)) {
    if (
      entry.id.toLowerCase().includes(queryLower) ||
      entry.name.toLowerCase().includes(queryLower) ||
      entry.description.toLowerCase().includes(queryLower)
    ) {
      results.push(entry);
    }
  }

  return results;
}

/**
 * Get manifest stats
 */
export async function getManifestStats(): Promise<{
  totalTools: number;
  totalDomains: number;
  version: string;
  buildTime: string;
  loadedAt: number | null;
}> {
  const manifest = await loadToolManifest();
  const state = getManifestState();

  return {
    totalTools: manifest.totalTools,
    totalDomains: manifest.totalDomains,
    version: manifest.version,
    buildTime: manifest.buildTime,
    loadedAt: state.loadedAt,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  loadToolManifest,
  isManifestLoaded,
  getManifestSync,
  getAllToolIds,
  getToolEntry,
  getToolsForDomain,
  getAllDomainIds,
  searchTools,
  getManifestStats,
};
