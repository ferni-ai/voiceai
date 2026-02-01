/**
 * Spanner Memory Graph
 *
 * Implements the MemoryGraph interface using Google Cloud Spanner.
 * Provides persistent graph storage for memory associations with
 * support for graph traversal queries.
 *
 * @module memory/associative-cortex/graph/spanner-graph
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { MemoryGraph, MemoryLink } from '../types.js';
import type { MemoryLinkType } from '../../unified-store/types.js';
import {
  isSpannerReady,
  insertRelationship,
  getEntitiesByUser,
} from '../../spanner-graph/client.js';

const log = createLogger({ module: 'SpannerMemoryGraph' });

// ============================================================================
// SPANNER LINK STORAGE
// ============================================================================

// In-memory fallback when Spanner is unavailable
const fallbackLinks: Map<string, MemoryLink[]> = new Map();
const fallbackReverseLinks: Map<string, MemoryLink[]> = new Map();

// ============================================================================
// SPANNER QUERIES
// ============================================================================

async function getSpannerDatabase() {
  const { Spanner } = await import('@google-cloud/spanner');
  const { SPANNER_CONFIG } = await import('../../spanner-graph/schema.js');

  const spanner = new Spanner({ projectId: SPANNER_CONFIG.projectId });
  const instance = spanner.instance(SPANNER_CONFIG.instanceId);
  return instance.database(SPANNER_CONFIG.databaseId);
}

/**
 * Query links from Spanner
 */
async function queryLinksFromSpanner(
  memoryId: string,
  direction: 'from' | 'to' | 'both'
): Promise<MemoryLink[]> {
  if (!isSpannerReady()) {
    return [];
  }

  const db = await getSpannerDatabase();

  try {
    let sql: string;
    const params: Record<string, unknown> = { memoryId };

    if (direction === 'from') {
      sql = `
        SELECT source_memory_id, target_memory_id, link_type, weight, created_at, metadata
        FROM memory_links
        WHERE source_memory_id = @memoryId
        ORDER BY weight DESC
        LIMIT 100
      `;
    } else if (direction === 'to') {
      sql = `
        SELECT source_memory_id, target_memory_id, link_type, weight, created_at, metadata
        FROM memory_links
        WHERE target_memory_id = @memoryId
        ORDER BY weight DESC
        LIMIT 100
      `;
    } else {
      sql = `
        SELECT source_memory_id, target_memory_id, link_type, weight, created_at, metadata
        FROM memory_links
        WHERE source_memory_id = @memoryId OR target_memory_id = @memoryId
        ORDER BY weight DESC
        LIMIT 100
      `;
    }

    const [rows] = await db.run({ sql, params });

    return rows.map((row) => {
      const json = row.toJSON() as Record<string, unknown>;
      return {
        sourceId: json.source_memory_id as string,
        targetId: json.target_memory_id as string,
        type: json.link_type as MemoryLinkType,
        weight: json.weight as number,
        createdAt: new Date(json.created_at as string),
        metadata: json.metadata ? JSON.parse(json.metadata as string) : undefined,
      };
    });
  } catch (error) {
    log.warn({ error: String(error), memoryId }, 'Failed to query links from Spanner');
    return [];
  } finally {
    await db.close();
  }
}

/**
 * Insert a link into Spanner
 */
async function insertLinkToSpanner(link: Omit<MemoryLink, 'createdAt'>): Promise<void> {
  if (!isSpannerReady()) {
    return;
  }

  const db = await getSpannerDatabase();
  const now = new Date().toISOString();

  try {
    await db.runTransactionAsync(async (transaction) => {
      await transaction.runUpdate({
        sql: `
          INSERT OR UPDATE INTO memory_links
          (source_memory_id, target_memory_id, link_type, weight, metadata, created_at, updated_at)
          VALUES
          (@sourceId, @targetId, @linkType, @weight, @metadata, @createdAt, @updatedAt)
        `,
        params: {
          sourceId: link.sourceId,
          targetId: link.targetId,
          linkType: link.type,
          weight: link.weight,
          metadata: link.metadata ? JSON.stringify(link.metadata) : null,
          createdAt: now,
          updatedAt: now,
        },
      });
      await transaction.commit();
    });

    log.debug({ sourceId: link.sourceId, targetId: link.targetId, type: link.type }, 'Link inserted to Spanner');
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to insert link to Spanner');
  } finally {
    await db.close();
  }
}

/**
 * Delete a link from Spanner
 */
async function deleteLinkFromSpanner(
  sourceId: string,
  targetId: string,
  type: MemoryLinkType
): Promise<void> {
  if (!isSpannerReady()) {
    return;
  }

  const db = await getSpannerDatabase();

  try {
    await db.runTransactionAsync(async (transaction) => {
      await transaction.runUpdate({
        sql: `
          DELETE FROM memory_links
          WHERE source_memory_id = @sourceId 
            AND target_memory_id = @targetId 
            AND link_type = @linkType
        `,
        params: { sourceId, targetId, linkType: type },
      });
      await transaction.commit();
    });
  } catch (error) {
    log.warn({ error: String(error), sourceId, targetId }, 'Failed to delete link from Spanner');
  } finally {
    await db.close();
  }
}

/**
 * Check if a link exists in Spanner
 */
async function checkLinkInSpanner(
  sourceId: string,
  targetId: string,
  type?: MemoryLinkType
): Promise<boolean> {
  if (!isSpannerReady()) {
    return false;
  }

  const db = await getSpannerDatabase();

  try {
    let sql = `
      SELECT 1 FROM memory_links
      WHERE source_memory_id = @sourceId AND target_memory_id = @targetId
    `;
    const params: Record<string, unknown> = { sourceId, targetId };

    if (type) {
      sql += ' AND link_type = @linkType';
      params.linkType = type;
    }

    sql += ' LIMIT 1';

    const [rows] = await db.run({ sql, params });
    return rows.length > 0;
  } catch (error) {
    log.warn({ error: String(error), sourceId, targetId }, 'Failed to check link in Spanner');
    return false;
  } finally {
    await db.close();
  }
}

/**
 * Count links for a memory in Spanner
 */
async function countLinksInSpanner(memoryId: string): Promise<number> {
  if (!isSpannerReady()) {
    return 0;
  }

  const db = await getSpannerDatabase();

  try {
    const [rows] = await db.run({
      sql: `
        SELECT COUNT(*) as link_count
        FROM memory_links
        WHERE source_memory_id = @memoryId OR target_memory_id = @memoryId
      `,
      params: { memoryId },
    });

    if (rows.length > 0) {
      const json = rows[0].toJSON() as Record<string, unknown>;
      return Number(json.link_count) || 0;
    }
    return 0;
  } catch (error) {
    log.warn({ error: String(error), memoryId }, 'Failed to count links in Spanner');
    return 0;
  } finally {
    await db.close();
  }
}

// ============================================================================
// SPANNER MEMORY GRAPH IMPLEMENTATION
// ============================================================================

/**
 * Spanner-backed implementation of MemoryGraph
 *
 * Uses Spanner for persistent storage with in-memory fallback
 * when Spanner is unavailable.
 */
export class SpannerMemoryGraph implements MemoryGraph {
  private useSpanner: boolean;

  constructor(options?: { useSpanner?: boolean }) {
    this.useSpanner = options?.useSpanner ?? true;
  }

  /**
   * Get all links from a memory (outgoing)
   */
  async getLinksFrom(memoryId: string): Promise<MemoryLink[]> {
    if (this.useSpanner && isSpannerReady()) {
      const spannerLinks = await queryLinksFromSpanner(memoryId, 'from');
      if (spannerLinks.length > 0) {
        return spannerLinks;
      }
    }

    // Fall back to in-memory
    return fallbackLinks.get(memoryId) || [];
  }

  /**
   * Get all links to a memory (incoming)
   */
  async getLinksTo(memoryId: string): Promise<MemoryLink[]> {
    if (this.useSpanner && isSpannerReady()) {
      const spannerLinks = await queryLinksFromSpanner(memoryId, 'to');
      if (spannerLinks.length > 0) {
        return spannerLinks;
      }
    }

    // Fall back to in-memory
    return fallbackReverseLinks.get(memoryId) || [];
  }

  /**
   * Get all links for a memory (both directions)
   */
  async getLinks(memoryId: string): Promise<MemoryLink[]> {
    if (this.useSpanner && isSpannerReady()) {
      const spannerLinks = await queryLinksFromSpanner(memoryId, 'both');
      if (spannerLinks.length > 0) {
        return spannerLinks;
      }
    }

    // Fall back to in-memory
    const from = fallbackLinks.get(memoryId) || [];
    const to = fallbackReverseLinks.get(memoryId) || [];
    return [...from, ...to];
  }

  /**
   * Add a link
   */
  async addLink(link: Omit<MemoryLink, 'createdAt'>): Promise<void> {
    // Always write to Spanner if available
    if (this.useSpanner && isSpannerReady()) {
      await insertLinkToSpanner(link);
    }

    // Also store in-memory for fast access
    const fullLink: MemoryLink = {
      ...link,
      createdAt: new Date(),
    };

    // Add to forward links
    const sourceLinks = fallbackLinks.get(link.sourceId) || [];
    sourceLinks.push(fullLink);
    fallbackLinks.set(link.sourceId, sourceLinks);

    // Add to reverse links
    const targetLinks = fallbackReverseLinks.get(link.targetId) || [];
    targetLinks.push(fullLink);
    fallbackReverseLinks.set(link.targetId, targetLinks);
  }

  /**
   * Remove a link
   */
  async removeLink(sourceId: string, targetId: string, type: MemoryLinkType): Promise<void> {
    // Remove from Spanner
    if (this.useSpanner && isSpannerReady()) {
      await deleteLinkFromSpanner(sourceId, targetId, type);
    }

    // Remove from in-memory
    const sourceLinks = fallbackLinks.get(sourceId);
    if (sourceLinks) {
      const filtered = sourceLinks.filter(
        (l) => !(l.targetId === targetId && l.type === type)
      );
      fallbackLinks.set(sourceId, filtered);
    }

    const targetLinks = fallbackReverseLinks.get(targetId);
    if (targetLinks) {
      const filtered = targetLinks.filter(
        (l) => !(l.sourceId === sourceId && l.type === type)
      );
      fallbackReverseLinks.set(targetId, filtered);
    }
  }

  /**
   * Check if link exists
   */
  async hasLink(sourceId: string, targetId: string, type?: MemoryLinkType): Promise<boolean> {
    // Check Spanner first
    if (this.useSpanner && isSpannerReady()) {
      const exists = await checkLinkInSpanner(sourceId, targetId, type);
      if (exists) return true;
    }

    // Check in-memory
    const links = fallbackLinks.get(sourceId) || [];
    return links.some(
      (l) => l.targetId === targetId && (type === undefined || l.type === type)
    );
  }

  /**
   * Get link count for a memory
   */
  async getLinkCount(memoryId: string): Promise<number> {
    // Check Spanner first
    if (this.useSpanner && isSpannerReady()) {
      const count = await countLinksInSpanner(memoryId);
      if (count > 0) return count;
    }

    // Count in-memory
    const from = fallbackLinks.get(memoryId) || [];
    const to = fallbackReverseLinks.get(memoryId) || [];
    return from.length + to.length;
  }

  /**
   * Clear in-memory cache (for testing)
   */
  clearCache(): void {
    fallbackLinks.clear();
    fallbackReverseLinks.clear();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: SpannerMemoryGraph | null = null;

/**
 * Get the SpannerMemoryGraph singleton
 */
export function getSpannerMemoryGraph(options?: { useSpanner?: boolean }): SpannerMemoryGraph {
  if (!instance) {
    instance = new SpannerMemoryGraph(options);
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetSpannerMemoryGraph(): void {
  if (instance) {
    instance.clearCache();
  }
  instance = null;
}
