/**
 * Tool Versioning System
 *
 * Tracks tool versions and changes over time, enabling:
 * - A/B testing between versions
 * - Rollback to previous versions
 * - Change tracking for debugging
 * - Migration between versions
 *
 * Follows semantic versioning (major.minor.patch)
 */

import { getLogger } from '../utils/safe-logger.js';
import type { ToolDefinition, ToolDomain } from './registry/types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ToolVersion {
  /** Semantic version string */
  version: string;
  /** Tool ID */
  toolId: string;
  /** Domain */
  domain: ToolDomain;
  /** Version release date */
  releasedAt: Date;
  /** What changed in this version */
  changelog: string;
  /** Is this version active? */
  active: boolean;
  /** Breaking changes? */
  breaking: boolean;
  /** Schema hash for detecting changes */
  schemaHash: string;
  /** Tool definition snapshot */
  definition: ToolDefinitionSnapshot;
}

export interface ToolDefinitionSnapshot {
  id: string;
  name: string;
  description: string;
  domain: ToolDomain;
  tags?: string[];
  /** Parameters schema (JSON string) */
  parametersSchema: string;
}

export interface VersionChange {
  field: string;
  oldValue: string | undefined;
  newValue: string | undefined;
  changeType: 'added' | 'removed' | 'modified';
}

export interface VersionComparison {
  toolId: string;
  fromVersion: string;
  toVersion: string;
  changes: VersionChange[];
  isBreaking: boolean;
  summary: string;
}

export interface VersioningConfig {
  /** Keep history for this many versions */
  maxVersionsToKeep: number;
  /** Auto-version on schema changes */
  autoVersionOnChange: boolean;
  /** Require changelog for new versions */
  requireChangelog: boolean;
}

// ============================================================================
// VERSION UTILITIES
// ============================================================================

/**
 * Parse semantic version string
 */
function parseVersion(version: string): { major: number; minor: number; patch: number } {
  const parts = version.split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
}

/**
 * Compare two versions (-1, 0, 1)
 */
function compareVersions(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);

  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  return va.patch - vb.patch;
}

/**
 * Increment version
 */
function incrementVersion(
  version: string,
  type: 'major' | 'minor' | 'patch'
): string {
  const v = parseVersion(version);

  switch (type) {
    case 'major':
      return `${v.major + 1}.0.0`;
    case 'minor':
      return `${v.major}.${v.minor + 1}.0`;
    case 'patch':
      return `${v.major}.${v.minor}.${v.patch + 1}`;
  }
}

/**
 * Generate hash for tool schema (for change detection)
 */
function generateSchemaHash(def: ToolDefinition): string {
  const relevant = {
    id: def.id,
    name: def.name,
    description: def.description,
    domain: def.domain,
    tags: def.tags,
  };

  // Simple hash function
  const str = JSON.stringify(relevant);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ============================================================================
// VERSIONING SERVICE
// ============================================================================

export class ToolVersioningService {
  private config: VersioningConfig;
  private versions = new Map<string, ToolVersion[]>(); // toolId -> versions
  private activeVersions = new Map<string, string>(); // toolId -> active version

  constructor(config: Partial<VersioningConfig> = {}) {
    this.config = {
      maxVersionsToKeep: 10,
      autoVersionOnChange: true,
      requireChangelog: false,
      ...config,
    };
  }

  // ==========================================================================
  // VERSION MANAGEMENT
  // ==========================================================================

  /**
   * Register initial version of a tool
   */
  registerTool(def: ToolDefinition, initialVersion = '1.0.0'): ToolVersion {
    const version = this.createVersion(def, initialVersion, 'Initial version', false);
    this.setActiveVersion(def.id, initialVersion);
    return version;
  }

  /**
   * Create a new version
   */
  createVersion(
    def: ToolDefinition,
    version: string,
    changelog: string,
    breaking = false
  ): ToolVersion {
    const toolVersion: ToolVersion = {
      version,
      toolId: def.id,
      domain: def.domain,
      releasedAt: new Date(),
      changelog,
      active: false,
      breaking,
      schemaHash: generateSchemaHash(def),
      definition: {
        id: def.id,
        name: def.name,
        description: def.description,
        domain: def.domain,
        tags: def.tags,
        parametersSchema: '{}', // Would serialize actual schema
      },
    };

    // Store version
    const toolVersions = this.versions.get(def.id) || [];
    toolVersions.push(toolVersion);

    // Sort by version
    toolVersions.sort((a, b) => compareVersions(a.version, b.version));

    // Trim old versions
    while (toolVersions.length > this.config.maxVersionsToKeep) {
      toolVersions.shift();
    }

    this.versions.set(def.id, toolVersions);

    getLogger().info(
      { toolId: def.id, version, breaking },
      '📦 New tool version created'
    );

    return toolVersion;
  }

  /**
   * Bump version automatically based on changes
   */
  bumpVersion(
    def: ToolDefinition,
    changelog: string,
    type?: 'major' | 'minor' | 'patch'
  ): ToolVersion | null {
    const currentVersion = this.getActiveVersion(def.id);
    if (!currentVersion) {
      return this.registerTool(def);
    }

    // Determine version type if not specified
    if (!type) {
      const comparison = this.compareWithActive(def);
      if (comparison && comparison.isBreaking) {
        type = 'major';
      } else if (comparison && comparison.changes.length > 0) {
        type = 'minor';
      } else {
        type = 'patch';
      }
    }

    const newVersion = incrementVersion(currentVersion, type);
    const breaking = type === 'major';

    return this.createVersion(def, newVersion, changelog, breaking);
  }

  /**
   * Set active version for a tool
   */
  setActiveVersion(toolId: string, version: string): boolean {
    const toolVersions = this.versions.get(toolId);
    if (!toolVersions) return false;

    const targetVersion = toolVersions.find((v) => v.version === version);
    if (!targetVersion) return false;

    // Deactivate all
    for (const v of toolVersions) {
      v.active = false;
    }

    // Activate target
    targetVersion.active = true;
    this.activeVersions.set(toolId, version);

    getLogger().info({ toolId, version }, '✅ Active version set');
    return true;
  }

  /**
   * Rollback to a previous version
   */
  rollback(toolId: string, targetVersion?: string): boolean {
    const toolVersions = this.versions.get(toolId);
    if (!toolVersions || toolVersions.length < 2) return false;

    const currentVersion = this.getActiveVersion(toolId);
    if (!currentVersion) return false;

    // Find target version (previous if not specified)
    if (!targetVersion) {
      const currentIdx = toolVersions.findIndex((v) => v.version === currentVersion);
      if (currentIdx <= 0) return false;
      targetVersion = toolVersions[currentIdx - 1].version;
    }

    const success = this.setActiveVersion(toolId, targetVersion);
    if (success) {
      getLogger().warn({ toolId, from: currentVersion, to: targetVersion }, '⏪ Tool rolled back');
    }

    return success;
  }

  // ==========================================================================
  // VERSION QUERIES
  // ==========================================================================

  /**
   * Get active version for a tool
   */
  getActiveVersion(toolId: string): string | null {
    return this.activeVersions.get(toolId) || null;
  }

  /**
   * Get all versions for a tool
   */
  getVersionHistory(toolId: string): ToolVersion[] {
    return this.versions.get(toolId) || [];
  }

  /**
   * Get specific version
   */
  getVersion(toolId: string, version: string): ToolVersion | null {
    const toolVersions = this.versions.get(toolId);
    return toolVersions?.find((v) => v.version === version) || null;
  }

  /**
   * Get latest version for a tool
   */
  getLatestVersion(toolId: string): ToolVersion | null {
    const toolVersions = this.versions.get(toolId);
    if (!toolVersions || toolVersions.length === 0) return null;
    return toolVersions[toolVersions.length - 1];
  }

  // ==========================================================================
  // CHANGE DETECTION
  // ==========================================================================

  /**
   * Check if a tool has changed from its active version
   */
  hasChanged(def: ToolDefinition): boolean {
    const activeVersion = this.getActiveVersionObject(def.id);
    if (!activeVersion) return true;

    const newHash = generateSchemaHash(def);
    return newHash !== activeVersion.schemaHash;
  }

  /**
   * Compare tool definition with active version
   */
  compareWithActive(def: ToolDefinition): VersionComparison | null {
    const activeVersion = this.getActiveVersionObject(def.id);
    if (!activeVersion) return null;

    return this.compareVersions(def.id, activeVersion.version, def);
  }

  /**
   * Compare two versions
   */
  compareVersions(
    toolId: string,
    fromVersion: string,
    toDef: ToolDefinition
  ): VersionComparison | null {
    const fromVersionObj = this.getVersion(toolId, fromVersion);
    if (!fromVersionObj) return null;

    const changes: VersionChange[] = [];
    const fromDef = fromVersionObj.definition;

    // Compare name
    if (fromDef.name !== toDef.name) {
      changes.push({
        field: 'name',
        oldValue: fromDef.name,
        newValue: toDef.name,
        changeType: 'modified',
      });
    }

    // Compare description
    if (fromDef.description !== toDef.description) {
      changes.push({
        field: 'description',
        oldValue: fromDef.description,
        newValue: toDef.description,
        changeType: 'modified',
      });
    }

    // Compare domain
    if (fromDef.domain !== toDef.domain) {
      changes.push({
        field: 'domain',
        oldValue: fromDef.domain,
        newValue: toDef.domain,
        changeType: 'modified',
      });
    }

    // Compare tags
    const oldTags = new Set(fromDef.tags || []);
    const newTags = new Set(toDef.tags || []);

    for (const tag of newTags) {
      if (!oldTags.has(tag)) {
        changes.push({
          field: `tags.${tag}`,
          oldValue: undefined,
          newValue: tag,
          changeType: 'added',
        });
      }
    }

    for (const tag of oldTags) {
      if (!newTags.has(tag)) {
        changes.push({
          field: `tags.${tag}`,
          oldValue: tag,
          newValue: undefined,
          changeType: 'removed',
        });
      }
    }

    // Determine if breaking
    const isBreaking = changes.some(
      (c) =>
        c.changeType === 'removed' ||
        (c.field === 'domain' && c.changeType === 'modified')
    );

    // Generate summary
    let summary = '';
    if (changes.length === 0) {
      summary = 'No changes detected';
    } else {
      const added = changes.filter((c) => c.changeType === 'added').length;
      const removed = changes.filter((c) => c.changeType === 'removed').length;
      const modified = changes.filter((c) => c.changeType === 'modified').length;

      const parts: string[] = [];
      if (added > 0) parts.push(`${added} added`);
      if (removed > 0) parts.push(`${removed} removed`);
      if (modified > 0) parts.push(`${modified} modified`);

      summary = parts.join(', ');
      if (isBreaking) summary += ' (BREAKING)';
    }

    return {
      toolId,
      fromVersion,
      toVersion: 'current',
      changes,
      isBreaking,
      summary,
    };
  }

  private getActiveVersionObject(toolId: string): ToolVersion | null {
    const version = this.getActiveVersion(toolId);
    if (!version) return null;
    return this.getVersion(toolId, version);
  }

  // ==========================================================================
  // REPORTING
  // ==========================================================================

  /**
   * Get version summary for all tools
   */
  getVersionSummary(): Record<string, { current: string; versions: number; lastUpdated: Date }> {
    const summary: Record<string, { current: string; versions: number; lastUpdated: Date }> = {};

    for (const [toolId, versions] of this.versions) {
      const activeVersion = this.getActiveVersion(toolId) || '?';
      const latestVersion = this.getLatestVersion(toolId);

      summary[toolId] = {
        current: activeVersion,
        versions: versions.length,
        lastUpdated: latestVersion?.releasedAt || new Date(),
      };
    }

    return summary;
  }

  /**
   * Generate changelog report
   */
  generateChangelog(toolId?: string): string {
    let report = '═══════════════════════════════════════════════════════════════\n';
    report += '                       TOOL CHANGELOG                            \n';
    report += '═══════════════════════════════════════════════════════════════\n\n';

    const toolIds = toolId ? [toolId] : Array.from(this.versions.keys());

    for (const id of toolIds) {
      const versions = this.getVersionHistory(id);
      if (versions.length === 0) continue;

      const activeVersion = this.getActiveVersion(id);
      report += `📦 ${id} (active: ${activeVersion || 'none'})\n`;
      report += '─────────────────────────────────────────────────────────────────\n';

      for (const version of [...versions].reverse()) {
        const marker = version.active ? '→' : ' ';
        const breakingTag = version.breaking ? ' [BREAKING]' : '';
        report += `${marker} v${version.version}${breakingTag} - ${version.releasedAt.toISOString().split('T')[0]}\n`;
        report += `    ${version.changelog}\n\n`;
      }
    }

    return report;
  }

  /**
   * Get tools with recent changes
   */
  getRecentlyUpdated(daysBack = 7): ToolVersion[] {
    const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
    const recent: ToolVersion[] = [];

    for (const versions of this.versions.values()) {
      for (const version of versions) {
        if (version.releasedAt.getTime() >= cutoff) {
          recent.push(version);
        }
      }
    }

    return recent.sort((a, b) => b.releasedAt.getTime() - a.releasedAt.getTime());
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

export const versioningService = new ToolVersioningService();

export default versioningService;

