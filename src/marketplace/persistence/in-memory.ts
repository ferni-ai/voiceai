/**
 * In-Memory Marketplace Store
 *
 * Provides in-memory storage for development and testing.
 * Uses Maps for fast synchronous access.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type {
  AgentManifest,
  Installation,
  MarketplaceId,
  ToolExecution,
  ToolManifest,
  TrustLevel,
  UserId,
} from '../schema/types.js';
import type { MarketplaceStore } from './firestore.js';

const log = getLogger().child({ module: 'marketplace-in-memory' });

// ============================================================================
// IN-MEMORY IMPLEMENTATION
// ============================================================================

export class InMemoryMarketplaceStore implements MarketplaceStore {
  private tools = new Map<MarketplaceId, ToolManifest>();
  private agents = new Map<MarketplaceId, AgentManifest>();
  private installations = new Map<string, Installation>();
  private executions: ToolExecution[] = [];

  async initialize(): Promise<void> {
    log.info('In-memory marketplace store initialized');
  }

  isAvailable(): boolean {
    return true;
  }

  // Tool operations
  async saveTool(manifest: ToolManifest): Promise<void> {
    this.tools.set(manifest.id, manifest);
  }

  async getTool(id: MarketplaceId): Promise<ToolManifest | null> {
    return this.tools.get(id) || null;
  }

  async listTools(options?: {
    category?: string;
    trustLevel?: TrustLevel;
    tags?: string[];
  }): Promise<ToolManifest[]> {
    let tools = Array.from(this.tools.values());

    if (options?.category) {
      tools = tools.filter((t) => t.metadata.category === options.category);
    }

    if (options?.trustLevel) {
      tools = tools.filter((t) => t.verification.trustLevel === options.trustLevel);
    }

    if (options?.tags?.length) {
      tools = tools.filter((t) => options.tags!.some((tag) => t.metadata.tags.includes(tag)));
    }

    return tools;
  }

  async deleteTool(id: MarketplaceId): Promise<void> {
    this.tools.delete(id);
  }

  // Agent operations
  async saveAgent(manifest: AgentManifest): Promise<void> {
    this.agents.set(manifest.id, manifest);
  }

  async getAgent(id: MarketplaceId): Promise<AgentManifest | null> {
    return this.agents.get(id) || null;
  }

  async listAgents(options?: {
    category?: string;
    trustLevel?: TrustLevel;
    tags?: string[];
  }): Promise<AgentManifest[]> {
    let agents = Array.from(this.agents.values());

    if (options?.category) {
      agents = agents.filter((a) => a.metadata.category === options.category);
    }

    if (options?.trustLevel) {
      agents = agents.filter((a) => a.verification.trustLevel === options.trustLevel);
    }

    if (options?.tags?.length) {
      agents = agents.filter((a) => options.tags!.some((tag) => a.metadata.tags.includes(tag)));
    }

    return agents;
  }

  async deleteAgent(id: MarketplaceId): Promise<void> {
    this.agents.delete(id);
  }

  // Installation operations
  async saveInstallation(installation: Installation): Promise<void> {
    this.installations.set(installation.id, installation);
  }

  async getInstallation(id: string): Promise<Installation | null> {
    return this.installations.get(id) || null;
  }

  async getInstallationByUserItem(
    userId: UserId,
    itemId: MarketplaceId
  ): Promise<Installation | null> {
    return (
      Array.from(this.installations.values()).find(
        (i) => i.userId === userId && i.itemId === itemId && i.status === 'active'
      ) || null
    );
  }

  async listInstallations(
    userId: UserId,
    options?: { itemType?: 'agent' | 'tool' }
  ): Promise<Installation[]> {
    let installations = Array.from(this.installations.values()).filter(
      (i) => i.userId === userId && i.status === 'active'
    );

    if (options?.itemType) {
      installations = installations.filter((i) => i.itemType === options.itemType);
    }

    return installations;
  }

  async updateInstallation(id: string, updates: Partial<Installation>): Promise<void> {
    const existing = this.installations.get(id);
    if (existing) {
      this.installations.set(id, { ...existing, ...updates });
    }
  }

  // Execution tracking
  async saveExecution(execution: ToolExecution): Promise<void> {
    this.executions.push(execution);
  }

  async listExecutions(
    userId: UserId,
    options?: { toolId?: MarketplaceId; limit?: number; since?: string }
  ): Promise<ToolExecution[]> {
    let results = this.executions.filter((e) => e.userId === userId);

    if (options?.toolId) {
      results = results.filter((e) => e.toolId === options.toolId);
    }

    if (options?.since) {
      const sinceDate = new Date(options.since);
      results = results.filter((e) => new Date(e.executedAt) >= sinceDate);
    }

    results.sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  // For testing
  clear(): void {
    this.tools.clear();
    this.agents.clear();
    this.installations.clear();
    this.executions = [];
  }
}

