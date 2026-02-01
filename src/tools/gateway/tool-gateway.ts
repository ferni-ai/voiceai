/**
 * Tool Gateway - Centralized Interface for All Tool Access
 *
 * STATE OF THE ART 2026:
 * - Zero runtime JSON parsing (uses compiled TypeScript)
 * - Tiered loading: Instant → Preloaded → Predictive → On-Demand
 * - Pre-computed embeddings for microsecond-latency prediction
 * - Single source of truth
 *
 * @see docs/architecture/TOOL-GATEWAY-DESIGN.md
 */

import { getLogger } from '../../utils/safe-logger.js';
import { toolRegistry } from '../registry/index.js';
import { loadToolDomainsLazy, autoRegisterAllDomains } from '../registry/loader.js';
import type { ToolDomain, Tool } from '../registry/types.js';

// ============================================================================
// COMPILED CONFIGURATION (NO JSON PARSING!)
// ============================================================================
// These imports resolve at module load time - instant access
import {
  TIER_0_DOMAINS,
  TIER_0_DOMAIN_SET,
  TIER_0_CRITICAL_TOOLS,
  CRITICAL_TOOLS_SET,
  TIER_1_DOMAINS,
  TIER_1_DOMAIN_SET,
  TIER_1_CONDITIONAL,
  TIER_3_DOMAIN_SET,
  SESSION_START_DOMAINS,
  PREDICTIVE_RULES,
  TRIGGER_TO_RULES,
  ALL_TRIGGER_WORDS,
  LOAD_TIME_TARGETS,
  predictFromWords,
  predictSemantic,
  type PredictiveRule,
} from './tool-tiers.generated.js';

const log = getLogger().child({ module: 'ToolGateway' });

// Re-export for external use
export { TIER_0_DOMAINS, TIER_1_DOMAINS, SESSION_START_DOMAINS, LOAD_TIME_TARGETS };
export type { PredictiveRule };

// ============================================================================
// TYPES
// ============================================================================

interface ToolGatewayMetrics {
  tier0Count: number;
  tier1Count: number;
  tier2Count: number;
  totalTools: number;
  sessionId: string | null;
  userId: string | null;
  loadTimes: {
    tier0Ms: number;
    tier1Ms: number;
    tier2Ms: number;
  };
  predictions: {
    totalPredictions: number;
    successfulPredictions: number;
    missedPredictions: number;
  };
}

interface UserProfile {
  hasCalendarLinked?: boolean;
  hasSpotifyLinked?: boolean;
  recentTopics?: string[];
  mood?: string;
  isInCrisis?: boolean;
}

interface ToolUpdateResult {
  toolsReady: Record<string, Tool>;
  newlyLoaded: ToolDomain[];
  prefetching: ToolDomain[];
}

interface ToolPrediction {
  critical: ToolDomain[];
  optional: ToolDomain[];
  matchedRules: string[];
}

// ============================================================================
// TOOL GATEWAY SINGLETON
// ============================================================================

class ToolGateway {
  private static instance: ToolGateway | null = null;

  // Tool caches by tier
  private tier0Tools: Map<string, Tool> = new Map();
  private tier1Tools: Map<string, Tool> = new Map();
  private tier2Tools: Map<string, Tool> = new Map();

  // Loaded domains by tier
  private tier0Domains: Set<ToolDomain> = new Set();
  private tier1Domains: Set<ToolDomain> = new Set();
  private tier2Domains: Set<ToolDomain> = new Set();

  // Session state
  private sessionId: string | null = null;
  private userId: string | null = null;
  private userProfile: UserProfile | null = null;

  // Metrics
  private loadTimes = { tier0Ms: 0, tier1Ms: 0, tier2Ms: 0 };
  private predictions = { total: 0, successful: 0, missed: 0 };

  // Prefetch tracking
  private prefetchInProgress: Set<ToolDomain> = new Set();

  // Warmup state
  private isWarmedUp = false;
  private warmupPromise: Promise<void> | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  /** Get singleton instance */
  static getInstance(): ToolGateway {
    if (!ToolGateway.instance) {
      ToolGateway.instance = new ToolGateway();
    }
    return ToolGateway.instance;
  }

  /** Reset singleton (for testing) */
  static resetInstance(): void {
    ToolGateway.instance = null;
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Warmup - Load Tier 0 (Instant) tools at process start.
   * Call this ONCE at application startup.
   *
   * Uses compiled configuration - NO JSON parsing!
   */
  async warmup(): Promise<void> {
    if (this.isWarmedUp) {
      log.debug('Tool Gateway already warmed up');
      return;
    }

    // Prevent concurrent warmups
    if (this.warmupPromise) {
      return this.warmupPromise;
    }

    this.warmupPromise = this._doWarmup();
    return this.warmupPromise;
  }

  private async _doWarmup(): Promise<void> {
    const startTime = Date.now();
    log.info('🚀 Tool Gateway warming up (Tier 0)...');

    try {
      // CRITICAL: Register all domain loaders FIRST
      // This must happen before any loadToolDomainsLazy calls
      await autoRegisterAllDomains();

      // Load Tier 0 domains into registry
      // TIER_0_DOMAINS is compiled TypeScript - instant access!
      await loadToolDomainsLazy([...TIER_0_DOMAINS]);

      // Build tools from loaded domains
      for (const domain of TIER_0_DOMAINS) {
        const domainTools = toolRegistry.getByDomain(domain);
        for (const toolDef of domainTools) {
          try {
            const tool = toolDef.create({
              userId: 'gateway',
              agentId: 'gateway',
              agentDisplayName: 'Tool Gateway',
              services: {
                has: () => false,
                get: () => {
                  throw new Error('No services in warmup');
                },
                getOptional: () => undefined,
              },
            });
            this.tier0Tools.set(toolDef.id, tool);
          } catch (err) {
            log.warn({ toolId: toolDef.id, error: String(err) }, 'Failed to create Tier 0 tool');
          }
        }
        this.tier0Domains.add(domain);
      }

      this.loadTimes.tier0Ms = Date.now() - startTime;
      this.isWarmedUp = true;

      // Verify critical tools are loaded
      let missingCritical = TIER_0_CRITICAL_TOOLS.filter(
        (toolId) => !this.tier0Tools.has(toolId)
      );

      // FIX (Jan 2026): If critical tools are missing, try to recover them!
      // This handles the case where entertainment domain loaded but tools weren't created
      if (missingCritical.length > 0) {
        log.warn(
          { missingCritical },
          '⚠️ Critical tools missing after warmup - attempting recovery...'
        );
        await this._recoverCriticalTools(missingCritical);

        // Re-check after recovery
        missingCritical = TIER_0_CRITICAL_TOOLS.filter(
          (toolId) => !this.tier0Tools.has(toolId)
        );

        if (missingCritical.length > 0) {
          // CRITICAL: Log as error so it's highly visible
          log.error(
            { missingCritical },
            '🚨 CRITICAL: Some critical tools could NOT be recovered! Native function calling will be degraded.'
          );
          process.stderr.write(
            `\n🚨🚨🚨 CRITICAL TOOL FAILURE 🚨🚨🚨\n` +
              `Missing tools: ${missingCritical.join(', ')}\n` +
              `These tools will NOT be available for native function calling!\n` +
              `🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨\n\n`
          );
        } else {
          log.info('✅ All critical tools recovered successfully');
        }
      }

      log.info(
        {
          tier0Domains: TIER_0_DOMAINS.length,
          tier0Tools: this.tier0Tools.size,
          loadTimeMs: this.loadTimes.tier0Ms,
          targetMs: LOAD_TIME_TARGETS.tier0,
          criticalToolsLoaded: TIER_0_CRITICAL_TOOLS.length - missingCritical.length,
        },
        this.loadTimes.tier0Ms <= LOAD_TIME_TARGETS.tier0
          ? '✅ Tool Gateway warmed up (Tier 0 ready, ON TARGET)'
          : '⚠️ Tool Gateway warmed up (Tier 0 ready, OVER TARGET)'
      );
    } catch (error) {
      log.error({ error }, '❌ Tool Gateway warmup failed');
      throw error;
    }
  }

  /**
   * Attempt to recover missing critical tools.
   * This handles the case where the entertainment domain loaded but specific tools weren't created.
   *
   * Recovery strategy:
   * 1. Re-check the registry for the tool (maybe it was registered late)
   * 2. If not found, try to import entertainment domain directly and create tools
   * 3. Log success/failure for debugging
   */
  private async _recoverCriticalTools(missingTools: readonly string[]): Promise<void> {
    log.info({ missingTools }, '🔧 Attempting to recover critical tools...');

    // Map of critical tool ID to domain
    const toolDomainMap: Record<string, ToolDomain> = {
      playMusic: 'entertainment',
      musicControl: 'entertainment',
      musicInfo: 'entertainment',
      musicProvider: 'entertainment',
      transferAgent: 'handoff',
      rememberFact: 'memory',
      recallMemory: 'memory',
    };

    for (const toolId of missingTools) {
      try {
        // Step 1: Check if tool is now in registry (race condition fix)
        const registryTools = toolRegistry.getByDomain(
          toolDomainMap[toolId] || 'entertainment'
        );
        const toolDef = registryTools.find((t) => t.id === toolId);

        if (toolDef) {
          log.debug({ toolId }, 'Found tool in registry during recovery');
          const tool = toolDef.create({
            userId: 'gateway-recovery',
            agentId: 'gateway',
            agentDisplayName: 'Tool Gateway',
            services: {
              has: () => false,
              get: () => {
                throw new Error('No services in recovery');
              },
              getOptional: () => undefined,
            },
          });
          this.tier0Tools.set(toolId, tool);
          log.info({ toolId }, '✅ Recovered tool from registry');
          continue;
        }

        // Step 2: Try to directly import and create the tool
        const musicTools = ['playMusic', 'musicControl', 'musicInfo', 'musicProvider'];
        const memoryTools = ['rememberAboutUser', 'recallFromMemory', 'rememberImportantFact'];
        const handoffTools = ['handoffToMaya', 'handoffToPeter', 'handoffToJordan', 'handoffToAlex', 'handoffToNayan', 'handoffToFerni'];

        let domainModule: string | null = null;
        if (musicTools.includes(toolId)) {
          domainModule = '../domains/entertainment/index.js';
        } else if (memoryTools.includes(toolId)) {
          domainModule = '../domains/memory/index.js';
        } else if (handoffTools.includes(toolId)) {
          domainModule = '../domains/handoff/index.js';
        }

        if (domainModule) {
          log.debug({ toolId, domainModule }, 'Attempting direct import of domain module');

          try {
            const { getToolDefinitions } = await import(domainModule);
            const definitions = await getToolDefinitions();

            const toolDef = definitions.find(
              (d: { id: string }) => d.id === toolId
            );

            if (toolDef) {
              const tool = toolDef.create({
                userId: 'gateway-recovery',
                agentId: 'gateway',
                agentDisplayName: 'Tool Gateway',
                services: {
                  has: () => false,
                  get: () => {
                    throw new Error('No services in recovery');
                  },
                  getOptional: () => undefined,
                },
              });
              this.tier0Tools.set(toolId, tool);
              log.info({ toolId }, '✅ Recovered tool via direct import');
              // NOTE: Don't re-register in toolRegistry - the domain loader already did that.
              // We're only recovering the tool instance for the gateway's tier0Tools map.
            } else {
              log.warn(
                { toolId, availableTools: definitions.map((d: { id: string }) => d.id) },
                '⚠️ Tool not found in domain definitions'
              );
            }
          } catch (importError) {
            log.error(
              { toolId, error: String(importError) },
              '❌ Failed to directly import domain module'
            );
          }
        }
      } catch (err) {
        log.error({ toolId, error: String(err) }, '❌ Failed to recover critical tool');
      }
    }

    // Log final recovery status
    const stillMissing = missingTools.filter((t) => !this.tier0Tools.has(t));
    if (stillMissing.length > 0) {
      log.warn({ stillMissing }, '⚠️ Some tools could not be recovered');
    } else {
      log.info({ recoveredTools: [...missingTools] }, '✅ All critical tools recovered!');
    }
  }

  // ==========================================================================
  // SESSION MANAGEMENT
  // ==========================================================================

  /**
   * Start a session - Load Tier 1 (Preloaded) tools.
   * Call this when a user connects.
   */
  async startSession(
    userId: string,
    sessionId: string,
    userProfile?: UserProfile
  ): Promise<void> {
    const startTime = Date.now();
    log.info({ userId, sessionId }, '🎯 Tool Gateway starting session (Tier 1)...');

    this.sessionId = sessionId;
    this.userId = userId;
    this.userProfile = userProfile || {};

    // Ensure warmup completed
    if (!this.isWarmedUp) {
      await this.warmup();
    }

    try {
      // Build Tier 1 domains list
      const tier1Domains: ToolDomain[] = [...TIER_1_DOMAINS];

      // Add conditional domains based on user profile
      if (userProfile?.hasCalendarLinked && TIER_1_CONDITIONAL.userHasCalendarLinked) {
        tier1Domains.push(...TIER_1_CONDITIONAL.userHasCalendarLinked);
      }
      if (userProfile?.hasSpotifyLinked && TIER_1_CONDITIONAL.userHasSpotifyLinked) {
        tier1Domains.push(...TIER_1_CONDITIONAL.userHasSpotifyLinked);
      }
      if (userProfile?.isInCrisis && TIER_1_CONDITIONAL.userInCrisis) {
        tier1Domains.push(...TIER_1_CONDITIONAL.userInCrisis);
      }

      // Load domains not already loaded
      const domainsToLoad = tier1Domains.filter(
        (d) => !this.tier0Domains.has(d) && !this.tier1Domains.has(d)
      );

      if (domainsToLoad.length > 0) {
        await loadToolDomainsLazy(domainsToLoad);
      }

      // Build tools from loaded domains
      for (const domain of tier1Domains) {
        if (this.tier0Domains.has(domain)) continue; // Already in Tier 0

        const domainTools = toolRegistry.getByDomain(domain);
        for (const toolDef of domainTools) {
          if (this.tier0Tools.has(toolDef.id)) continue; // Already in Tier 0

          try {
            const tool = toolDef.create({
              userId,
              agentId: 'gateway',
              agentDisplayName: 'Tool Gateway',
              services: {
                has: () => false,
                get: () => {
                  throw new Error('No services');
                },
                getOptional: () => undefined,
              },
            });
            this.tier1Tools.set(toolDef.id, tool);
          } catch (err) {
            log.warn({ toolId: toolDef.id, error: String(err) }, 'Failed to create Tier 1 tool');
          }
        }
        this.tier1Domains.add(domain);
      }

      this.loadTimes.tier1Ms = Date.now() - startTime;

      log.info(
        {
          userId,
          sessionId,
          tier1Domains: this.tier1Domains.size,
          tier1Tools: this.tier1Tools.size,
          loadTimeMs: this.loadTimes.tier1Ms,
          targetMs: LOAD_TIME_TARGETS.tier1,
          totalTools: this.tier0Tools.size + this.tier1Tools.size,
        },
        this.loadTimes.tier1Ms <= LOAD_TIME_TARGETS.tier1
          ? '✅ Tool Gateway session started (ON TARGET)'
          : '⚠️ Tool Gateway session started (OVER TARGET)'
      );

      // Start predictive prefetching in background (non-blocking)
      this.startPredictivePrefetch().catch((err) => {
        log.warn({ error: String(err) }, 'Predictive prefetch failed');
      });
    } catch (error) {
      log.error({ error, userId, sessionId }, '❌ Tool Gateway session start failed');
      throw error;
    }
  }

  /**
   * End a session - Clear session-specific state
   */
  endSession(): void {
    log.info({ sessionId: this.sessionId }, '🏁 Tool Gateway session ended');

    // Clear Tier 1 and Tier 2 tools (keep Tier 0)
    this.tier1Tools.clear();
    this.tier2Tools.clear();
    this.tier1Domains.clear();
    this.tier2Domains.clear();

    this.sessionId = null;
    this.userId = null;
    this.userProfile = null;
  }

  // ==========================================================================
  // PREDICTIVE LOADING (MICROSECOND LATENCY)
  // ==========================================================================

  /**
   * Start background predictive prefetching based on user profile
   */
  private async startPredictivePrefetch(): Promise<void> {
    // Check time-based rules
    const currentHour = new Date().getHours();
    for (const rule of PREDICTIVE_RULES) {
      if (rule.timeCondition?.hours.includes(currentHour)) {
        await this.prefetchDomains([...rule.domains], `time-rule:${rule.id}`);
      }
    }

    // Check profile-based rules using semantic matching
    if (this.userProfile?.recentTopics) {
      for (const topic of this.userProfile.recentTopics) {
        const semanticMatches = predictSemantic(topic, 0.4);
        for (const { rule } of semanticMatches) {
          await this.prefetchDomains([...rule.domains], `profile:${topic}`);
        }
      }
    }
  }

  /**
   * Predict tools needed based on transcript.
   * Uses COMPILED prediction functions - microsecond latency!
   */
  predictToolsNeeded(transcript: string): ToolPrediction {
    this.predictions.total++;

    const prediction: ToolPrediction = {
      critical: [],
      optional: [],
      matchedRules: [],
    };

    // Fast path: keyword-based prediction (O(n) where n = words in transcript)
    const words = transcript.toLowerCase().split(/\s+/);
    const keywordMatches = predictFromWords(words);

    for (const rule of keywordMatches) {
      prediction.matchedRules.push(rule.id);

      const domainsToAdd = rule.domains.filter(
        (d) =>
          !this.tier0Domains.has(d as ToolDomain) &&
          !this.tier1Domains.has(d as ToolDomain) &&
          !this.tier2Domains.has(d as ToolDomain)
      ) as ToolDomain[];

      if (rule.priority === 'high') {
        prediction.critical.push(...domainsToAdd);
      } else {
        prediction.optional.push(...domainsToAdd);
      }
    }

    // Semantic matching for cases keyword matching misses
    if (prediction.critical.length === 0 && prediction.optional.length === 0) {
      const semanticMatches = predictSemantic(transcript, 0.5);
      for (const { rule } of semanticMatches.slice(0, 3)) {
        prediction.matchedRules.push(`semantic:${rule.id}`);

        const domainsToAdd = rule.domains.filter(
          (d) =>
            !this.tier0Domains.has(d as ToolDomain) &&
            !this.tier1Domains.has(d as ToolDomain) &&
            !this.tier2Domains.has(d as ToolDomain)
        ) as ToolDomain[];

        if (rule.priority === 'high') {
          prediction.critical.push(...domainsToAdd);
        } else {
          prediction.optional.push(...domainsToAdd);
        }
      }
    }

    // Dedupe
    prediction.critical = [...new Set(prediction.critical)];
    prediction.optional = [...new Set(prediction.optional)];

    return prediction;
  }

  /**
   * Prefetch domains in background
   */
  private async prefetchDomains(domains: ToolDomain[], reason: string): Promise<void> {
    const toLoad = domains.filter(
      (d) =>
        !this.tier0Domains.has(d) &&
        !this.tier1Domains.has(d) &&
        !this.tier2Domains.has(d) &&
        !this.prefetchInProgress.has(d)
    );

    if (toLoad.length === 0) return;

    log.debug({ domains: toLoad, reason }, '🔮 Predictive prefetch starting');

    for (const domain of toLoad) {
      this.prefetchInProgress.add(domain);
    }

    try {
      await loadToolDomainsLazy(toLoad);

      for (const domain of toLoad) {
        const domainTools = toolRegistry.getByDomain(domain);
        for (const toolDef of domainTools) {
          if (this.tier0Tools.has(toolDef.id) || this.tier1Tools.has(toolDef.id)) continue;

          try {
            const tool = toolDef.create({
              userId: this.userId || 'gateway',
              agentId: 'gateway',
              agentDisplayName: 'Tool Gateway',
              services: {
                has: () => false,
                get: () => {
                  throw new Error('No services');
                },
                getOptional: () => undefined,
              },
            });
            this.tier2Tools.set(toolDef.id, tool);
          } catch (err) {
            log.warn({ toolId: toolDef.id }, 'Failed to create predictive tool');
          }
        }
        this.tier2Domains.add(domain);
        this.prefetchInProgress.delete(domain);
      }

      log.debug(
        { domains: toLoad, newTools: this.tier2Tools.size, reason },
        '✅ Predictive prefetch complete'
      );
    } catch (error) {
      for (const domain of toLoad) {
        this.prefetchInProgress.delete(domain);
      }
      log.warn({ error: String(error), domains: toLoad }, 'Predictive prefetch failed');
    }
  }

  // ==========================================================================
  // TURN-LEVEL UPDATES
  // ==========================================================================

  /**
   * Called at start of each turn - predict and load needed tools BEFORE LLM responds
   */
  async onTurnStart(transcript: string): Promise<ToolUpdateResult> {
    const prediction = this.predictToolsNeeded(transcript);

    const newlyLoaded: ToolDomain[] = [];

    // Load critical domains SYNCHRONOUSLY (blocks turn processing briefly)
    if (prediction.critical.length > 0) {
      const startTime = Date.now();
      log.info(
        { domains: prediction.critical, rules: prediction.matchedRules },
        '⚡ Loading critical tools for turn'
      );

      await loadToolDomainsLazy(prediction.critical);

      for (const domain of prediction.critical) {
        const domainTools = toolRegistry.getByDomain(domain);
        for (const toolDef of domainTools) {
          if (
            this.tier0Tools.has(toolDef.id) ||
            this.tier1Tools.has(toolDef.id) ||
            this.tier2Tools.has(toolDef.id)
          ) {
            continue;
          }

          try {
            const tool = toolDef.create({
              userId: this.userId || 'gateway',
              agentId: 'gateway',
              agentDisplayName: 'Tool Gateway',
              services: {
                has: () => false,
                get: () => {
                  throw new Error('No services');
                },
                getOptional: () => undefined,
              },
            });
            this.tier2Tools.set(toolDef.id, tool);
          } catch (err) {
            log.warn({ toolId: toolDef.id }, 'Failed to create critical tool');
          }
        }
        this.tier2Domains.add(domain);
        newlyLoaded.push(domain);
      }

      this.loadTimes.tier2Ms = Date.now() - startTime;
      this.predictions.successful++;

      log.info(
        { domains: newlyLoaded, loadTimeMs: this.loadTimes.tier2Ms },
        '✅ Critical tools loaded for turn'
      );
    }

    // Prefetch optional domains ASYNCHRONOUSLY (non-blocking)
    if (prediction.optional.length > 0) {
      this.prefetchDomains(prediction.optional, `turn:${transcript.slice(0, 30)}`).catch(() => {
        // Ignore errors from background prefetch
      });
    }

    return {
      toolsReady: this.getSessionTools(),
      newlyLoaded,
      prefetching: prediction.optional,
    };
  }

  // ==========================================================================
  // TOOL ACCESS
  // ==========================================================================

  /**
   * Get all tools available for current session
   */
  getSessionTools(): Record<string, Tool> {
    return {
      ...Object.fromEntries(this.tier0Tools),
      ...Object.fromEntries(this.tier1Tools),
      ...Object.fromEntries(this.tier2Tools),
    };
  }

  /**
   * Get a specific tool by ID
   */
  getTool(toolId: string): Tool | undefined {
    return (
      this.tier0Tools.get(toolId) ||
      this.tier1Tools.get(toolId) ||
      this.tier2Tools.get(toolId)
    );
  }

  /**
   * Check if a tool is ready NOW (not loading)
   */
  isToolReady(toolId: string): boolean {
    return this.getTool(toolId) !== undefined;
  }

  /**
   * Check if a tool is critical (should always be available)
   */
  isCriticalTool(toolId: string): boolean {
    return CRITICAL_TOOLS_SET.has(toolId);
  }

  /**
   * Get list of all available tool IDs
   */
  getAvailableToolIds(): string[] {
    return [
      ...this.tier0Tools.keys(),
      ...this.tier1Tools.keys(),
      ...this.tier2Tools.keys(),
    ];
  }

  // ==========================================================================
  // OBSERVABILITY
  // ==========================================================================

  /**
   * Get metrics for observability dashboards
   */
  getMetrics(): ToolGatewayMetrics {
    return {
      tier0Count: this.tier0Tools.size,
      tier1Count: this.tier1Tools.size,
      tier2Count: this.tier2Tools.size,
      totalTools: this.tier0Tools.size + this.tier1Tools.size + this.tier2Tools.size,
      sessionId: this.sessionId,
      userId: this.userId,
      loadTimes: { ...this.loadTimes },
      predictions: {
        totalPredictions: this.predictions.total,
        successfulPredictions: this.predictions.successful,
        missedPredictions: this.predictions.missed,
      },
    };
  }

  /**
   * Check if warmup is complete
   */
  isReady(): boolean {
    return this.isWarmedUp;
  }

  /**
   * Get loaded domains for a tier
   */
  getLoadedDomains(tier: 0 | 1 | 2): ToolDomain[] {
    switch (tier) {
      case 0:
        return [...this.tier0Domains];
      case 1:
        return [...this.tier1Domains];
      case 2:
        return [...this.tier2Domains];
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

/** Get the singleton Tool Gateway instance */
export function getToolGateway(): ToolGateway {
  return ToolGateway.getInstance();
}

/** Reset Tool Gateway (for testing) */
export function resetToolGateway(): void {
  ToolGateway.resetInstance();
}

export { ToolGateway };
export type {
  ToolGatewayMetrics,
  ToolUpdateResult,
  UserProfile,
  ToolPrediction,
};
