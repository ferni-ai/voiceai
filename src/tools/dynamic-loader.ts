/**
 * Dynamic Tool Loader
 *
 * Intelligently loads and unloads tool domains based on conversation context.
 * This keeps the active tool count low while ensuring relevant tools are available.
 *
 * Features:
 * - Topic detection → domain mapping
 * - Automatic loading when topic detected
 * - Automatic unloading after inactivity
 * - Priority-based loading (essential domains always loaded)
 */

import { getLogger } from '../utils/safe-logger.js';
import { toolRegistry } from './registry/index.js';
import { loadToolDomain } from './registry/loader.js';
import type { ToolDomain, ToolContext, Tool } from './registry/types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DynamicLoaderConfig {
  /** Domains that are always loaded (never unloaded) */
  essentialDomains: ToolDomain[];
  /** How long (ms) before unloading inactive domains */
  unloadAfterMs: number;
  /** Maximum domains to have loaded at once (excluding essential) */
  maxLoadedDomains: number;
  /** Enable automatic unloading */
  enableAutoUnload: boolean;
}

export interface LoadedDomainState {
  domain: ToolDomain;
  loadedAt: Date;
  lastUsedAt: Date;
  toolCount: number;
  isEssential: boolean;
}

export interface TopicDetectionResult {
  detectedTopics: string[];
  suggestedDomains: ToolDomain[];
  confidence: number;
}

// ============================================================================
// TOPIC TO DOMAIN MAPPING
// ============================================================================

/**
 * Maps conversation topics/keywords to relevant tool domains.
 * This enables intelligent domain loading based on what the user is discussing.
 */
const TOPIC_TO_DOMAINS: Record<string, ToolDomain[]> = {
  // Financial topics
  money: ['finance'],
  budget: ['finance'],
  savings: ['finance'],
  investment: ['finance', 'research'],
  stocks: ['research', 'finance'],
  retirement: ['finance', 'life-planning'],
  debt: ['finance'],
  mortgage: ['finance'],
  taxes: ['finance'],

  // Productivity topics
  task: ['productivity'],
  todo: ['productivity'],
  schedule: ['calendar', 'productivity'],
  meeting: ['calendar', 'communication'],
  appointment: ['calendar'],
  deadline: ['calendar', 'productivity'],
  project: ['productivity'],
  reminder: ['calendar', 'communication'],

  // Wellness topics
  health: ['wellness'],
  medication: ['wellness'],
  sleep: ['wellness', 'habits'],
  exercise: ['wellness', 'habits'],
  stress: ['wellness', 'presence'],
  anxiety: ['wellness', 'presence', 'self-compassion'],
  meditation: ['presence'],
  mindfulness: ['presence'],

  // Relationship topics
  relationship: ['relationships'],
  family: ['relationships'],
  friend: ['relationships'],
  partner: ['relationships'],
  conflict: ['relationships', 'communication'],
  boundary: ['relationships', 'self-compassion'],

  // Life planning topics
  goal: ['life-planning', 'habits'],
  dream: ['dreams', 'life-planning'],
  career: ['life-planning'],
  purpose: ['meaning'],
  values: ['meaning'],
  milestone: ['life-planning'],

  // Entertainment topics
  music: ['entertainment'],
  spotify: ['entertainment'],
  play: ['entertainment', 'play'],
  fun: ['play', 'entertainment'],

  // Information topics
  news: ['information'],
  weather: ['information'],
  sports: ['information'],
  search: ['information'],

  // Emotional topics
  sad: ['grief', 'self-compassion'],
  loss: ['grief'],
  grieving: ['grief'],
  lonely: ['relationships', 'self-compassion'],
  overwhelmed: ['presence', 'self-compassion'],
  grateful: ['presence', 'meaning'],
};

/**
 * Priority scores for domains (higher = more likely to stay loaded)
 */
const DOMAIN_PRIORITY: Partial<Record<ToolDomain, number>> = {
  memory: 100, // Always essential
  handoff: 100, // Always essential
  awareness: 90, // World awareness is important
  information: 70, // Frequently used
  entertainment: 60, // Common request
  productivity: 50,
  calendar: 50,
  habits: 40,
  finance: 40,
  wellness: 40,
  relationships: 40,
  presence: 35,
  meaning: 35,
  communication: 30,
  research: 30,
  'life-planning': 25,
  grief: 20,
  dreams: 20,
  play: 20,
  'self-compassion': 20,
  stories: 15,
  curiosity: 15,
  vulnerability: 15,
  wisdom: 15,
  telephony: 10,
  proactive: 10,
};

// ============================================================================
// DYNAMIC LOADER CLASS
// ============================================================================

export class DynamicToolLoader {
  private config: DynamicLoaderConfig;
  private loadedDomains = new Map<ToolDomain, LoadedDomainState>();
  private toolContext: ToolContext | null = null;
  private unloadTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<DynamicLoaderConfig> = {}) {
    this.config = {
      essentialDomains: ['memory', 'handoff', 'awareness'],
      unloadAfterMs: 5 * 60 * 1000, // 5 minutes
      maxLoadedDomains: 8,
      enableAutoUnload: true,
      ...config,
    };
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize with tool context and load essential domains
   */
  async initialize(ctx: ToolContext): Promise<void> {
    this.toolContext = ctx;

    // Load essential domains
    for (const domain of this.config.essentialDomains) {
      await this.loadDomain(domain, true);
    }

    // Start auto-unload timer if enabled
    if (this.config.enableAutoUnload) {
      this.startUnloadTimer();
    }

    getLogger().info(
      {
        essentialDomains: this.config.essentialDomains,
        maxLoadedDomains: this.config.maxLoadedDomains,
      },
      '🔄 Dynamic tool loader initialized'
    );
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    if (this.unloadTimer) {
      clearInterval(this.unloadTimer);
      this.unloadTimer = null;
    }
    this.loadedDomains.clear();
    getLogger().info('🔄 Dynamic tool loader shut down');
  }

  // ==========================================================================
  // TOPIC DETECTION
  // ==========================================================================

  /**
   * Detect topics from user message and suggest domains
   */
  detectTopics(message: string): TopicDetectionResult {
    const lowerMessage = message.toLowerCase();
    const detectedTopics: string[] = [];
    const domainScores = new Map<ToolDomain, number>();

    // Check each topic keyword
    for (const [topic, domains] of Object.entries(TOPIC_TO_DOMAINS)) {
      if (lowerMessage.includes(topic)) {
        detectedTopics.push(topic);
        for (const domain of domains) {
          const currentScore = domainScores.get(domain) || 0;
          const priority = DOMAIN_PRIORITY[domain] || 10;
          domainScores.set(domain, currentScore + priority);
        }
      }
    }

    // Sort domains by score
    const suggestedDomains = Array.from(domainScores.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([domain]) => domain)
      .slice(0, 3); // Top 3 domains

    // Calculate confidence based on matches
    const confidence = Math.min(detectedTopics.length / 3, 1);

    return {
      detectedTopics,
      suggestedDomains,
      confidence,
    };
  }

  // ==========================================================================
  // DOMAIN LOADING
  // ==========================================================================

  /**
   * Load a domain's tools
   */
  async loadDomain(domain: ToolDomain, isEssential = false): Promise<boolean> {
    // Already loaded?
    if (this.loadedDomains.has(domain)) {
      // Update last used time
      const state = this.loadedDomains.get(domain)!;
      state.lastUsedAt = new Date();
      return true;
    }

    // Check max loaded domains
    if (!isEssential && this.loadedDomains.size >= this.config.maxLoadedDomains) {
      // Unload least recently used non-essential domain
      await this.unloadLeastUsed();
    }

    try {
      const toolCount = await loadToolDomain(domain);

      this.loadedDomains.set(domain, {
        domain,
        loadedAt: new Date(),
        lastUsedAt: new Date(),
        toolCount,
        isEssential,
      });

      getLogger().info({ domain, toolCount, isEssential }, '🔄 Domain loaded dynamically');
      return true;
    } catch (error) {
      getLogger().warn({ domain, error }, '🔄 Failed to load domain');
      return false;
    }
  }

  /**
   * Unload a domain's tools (if not essential)
   */
  async unloadDomain(domain: ToolDomain): Promise<boolean> {
    const state = this.loadedDomains.get(domain);
    if (!state) return false;
    if (state.isEssential) {
      getLogger().debug({ domain }, '🔄 Cannot unload essential domain');
      return false;
    }

    // Note: The registry doesn't support unloading yet, so we just track state
    // In a full implementation, we'd remove tools from the registry
    this.loadedDomains.delete(domain);
    getLogger().info({ domain }, '🔄 Domain marked for unload');
    return true;
  }

  /**
   * Unload the least recently used non-essential domain
   */
  private async unloadLeastUsed(): Promise<void> {
    let oldest: LoadedDomainState | null = null;

    for (const state of this.loadedDomains.values()) {
      if (state.isEssential) continue;
      if (!oldest || state.lastUsedAt < oldest.lastUsedAt) {
        oldest = state;
      }
    }

    if (oldest) {
      await this.unloadDomain(oldest.domain);
    }
  }

  // ==========================================================================
  // AUTO-LOADING FROM CONTEXT
  // ==========================================================================

  /**
   * Process a user message and load relevant domains
   */
  async processMessage(message: string): Promise<ToolDomain[]> {
    const detection = this.detectTopics(message);

    if (detection.confidence < 0.3 || detection.suggestedDomains.length === 0) {
      return [];
    }

    const loadedDomains: ToolDomain[] = [];

    for (const domain of detection.suggestedDomains) {
      if (!this.loadedDomains.has(domain)) {
        const success = await this.loadDomain(domain);
        if (success) {
          loadedDomains.push(domain);
        }
      } else {
        // Update last used
        const state = this.loadedDomains.get(domain)!;
        state.lastUsedAt = new Date();
      }
    }

    if (loadedDomains.length > 0) {
      getLogger().info(
        {
          message: message.slice(0, 50),
          topics: detection.detectedTopics,
          loadedDomains,
        },
        '🔄 Auto-loaded domains based on context'
      );
    }

    return loadedDomains;
  }

  /**
   * Get tools for the current context
   */
  getCurrentTools(): Record<string, Tool> {
    if (!this.toolContext) {
      throw new Error('DynamicToolLoader not initialized');
    }

    const tools: Record<string, Tool> = {};
    const loadedDomainList = Array.from(this.loadedDomains.keys());

    // Build tools from loaded domains
    const result = toolRegistry.buildToolSet(
      { domains: loadedDomainList },
      this.toolContext
    );

    return result.tools;
  }

  // ==========================================================================
  // AUTO-UNLOAD TIMER
  // ==========================================================================

  private startUnloadTimer(): void {
    this.unloadTimer = setInterval(() => {
      this.checkForUnload();
    }, 60000); // Check every minute
  }

  private checkForUnload(): void {
    const now = Date.now();

    for (const [domain, state] of this.loadedDomains) {
      if (state.isEssential) continue;

      const idleTime = now - state.lastUsedAt.getTime();
      if (idleTime > this.config.unloadAfterMs) {
        this.unloadDomain(domain);
      }
    }
  }

  // ==========================================================================
  // STATUS
  // ==========================================================================

  /**
   * Get current loader status
   */
  getStatus(): {
    loadedDomains: LoadedDomainState[];
    totalTools: number;
    config: DynamicLoaderConfig;
  } {
    return {
      loadedDomains: Array.from(this.loadedDomains.values()),
      totalTools: Array.from(this.loadedDomains.values()).reduce(
        (sum, s) => sum + s.toolCount,
        0
      ),
      config: this.config,
    };
  }

  /**
   * Check if a domain is currently loaded
   */
  isDomainLoaded(domain: ToolDomain): boolean {
    return this.loadedDomains.has(domain);
  }

  /**
   * Get list of loaded domains
   */
  getLoadedDomains(): ToolDomain[] {
    return Array.from(this.loadedDomains.keys());
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

export const dynamicToolLoader = new DynamicToolLoader();

export default dynamicToolLoader;

