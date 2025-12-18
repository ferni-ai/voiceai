/**
 * Service Mode - Unified interface for local and cloud execution
 *
 * This module provides a seamless abstraction over local (in-process) and
 * remote (gRPC/HTTP) service execution. The same code runs in both environments:
 *
 * LOCAL MODE (development):
 * - All services run in-process
 * - No network calls, instant startup
 * - Hot reload friendly
 * - Single process, easy debugging
 *
 * REMOTE MODE (production):
 * - Services run as separate Cloud Run/K8s services
 * - gRPC communication
 * - Independent scaling
 * - Process isolation
 *
 * Usage:
 *   const runtime = await createRuntime();
 *   const result = await runtime.tools.execute('habitCoaching.createHabit', params, ctx);
 *   // Works the same locally and in cloud!
 */

import { randomUUID } from 'node:crypto';
import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'service-mode' });

// ============================================================================
// TYPES
// ============================================================================

export type ServiceMode = 'local' | 'remote' | 'hybrid';

export interface RuntimeConfig {
  /** Service mode: local, remote, or hybrid */
  mode: ServiceMode;

  /** Remote service URLs (used in remote/hybrid mode) */
  services?: {
    toolService?: string;
    personaService?: string;
    memoryService?: string;
  };

  /** Local overrides (used in hybrid mode) */
  localOverrides?: {
    /** Run these services locally even in hybrid mode */
    tools?: boolean;
    personas?: boolean;
    memory?: boolean;
  };
}

export interface ToolExecutionContext {
  userId: string;
  sessionId: string;
  agentId: string;
  agentDisplayName: string;
  subscriptionTier: 'free' | 'friend' | 'partner';
  recentTurns?: Array<{ role: string; content: string }>;
  tenantId?: string;
}

export interface ToolExecutionResult {
  status: 'success' | 'partial' | 'failed' | 'timeout' | 'rate_limited' | 'unauthorized';
  data?: Record<string, unknown>;
  summary?: string;
  error?: {
    code: string;
    message: string;
    userMessage: string;
    retryable: boolean;
  };
  metadata?: {
    executionTimeMs: number;
    cacheHit: boolean;
  };
}

// ============================================================================
// SERVICE INTERFACES (Same interface for local and remote)
// ============================================================================

export interface IToolService {
  execute: (
    toolId: string,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext
  ) => Promise<ToolExecutionResult>;

  listTools: (
    agentId: string,
    subscriptionTier: string
  ) => Promise<Array<{ id: string; name: string; description: string; domain: string }>>;

  health: () => Promise<{ healthy: boolean; latencyMs: number }>;
}

export interface IPersonaService {
  getSystemPrompt: (params: {
    personaId: string;
    userId: string;
    conversationHistory?: Array<{ role: string; content: string }>;
  }) => Promise<{
    systemPrompt: string;
    greeting: string;
    voiceConfig: { provider: string; voiceId: string };
  }>;

  getPersona: (personaId: string) => Promise<{
    id: string;
    name: string;
    description: string;
    capabilities: string[];
  } | null>;

  health: () => Promise<{ healthy: boolean; latencyMs: number }>;
}

export interface IMemoryService {
  recall: (
    userId: string,
    query: string,
    options?: { limit?: number; threshold?: number }
  ) => Promise<Array<{ content: string; relevance: number; timestamp: number }>>;

  store: (
    userId: string,
    content: string,
    metadata?: Record<string, unknown>
  ) => Promise<{ id: string }>;

  health: () => Promise<{ healthy: boolean; latencyMs: number }>;
}

// ============================================================================
// RUNTIME (Unified access to all services)
// ============================================================================

export interface IRuntime {
  readonly mode: ServiceMode;
  readonly tools: IToolService;
  readonly personas: IPersonaService;
  readonly memory: IMemoryService;

  /** Graceful shutdown */
  shutdown: () => Promise<void>;

  /** Health check all services */
  health: () => Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, { healthy: boolean; latencyMs: number }>;
  }>;
}

// ============================================================================
// LOCAL IMPLEMENTATIONS (In-process)
// ============================================================================

class LocalToolService implements IToolService {
  private initialized = false;
  private toolRegistry: typeof import('../tools/registry/index.js').toolRegistry | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const [registryModule, loaderModule] = await Promise.all([
      import('../tools/registry/index.js'),
      import('../tools/registry/loader.js'),
    ]);

    // Initialize all tool domains
    await loaderModule.initializeToolRegistry({ lazyLoading: false });
    this.toolRegistry = registryModule.toolRegistry;
    this.initialized = true;
    log.info('Local tool service initialized');
  }

  async execute(
    toolId: string,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      if (!this.initialized) {
        await this.initialize();
      }

      // Get tool from registry
      const toolDef = this.toolRegistry!.get(toolId);
      if (!toolDef) {
        return {
          status: 'failed',
          error: {
            code: 'TOOL_NOT_FOUND',
            message: `Tool '${toolId}' not found`,
            userMessage: "I don't have that capability right now.",
            retryable: false,
          },
        };
      }

      // Create tool instance
      const tool = toolDef.create({
        userId: context.userId,
        agentId: context.agentId,
        agentDisplayName: context.agentDisplayName,
        services: {
          has: () => false,
          get: () => {
            throw new Error('Service not available');
          },
          getOptional: () => undefined,
        },
      });

      // Execute
      const result = await tool.execute(parameters);

      return {
        status: 'success',
        data: typeof result === 'object' ? result : { value: result },
        summary: typeof result === 'string' ? result : JSON.stringify(result).slice(0, 200),
        metadata: {
          executionTimeMs: Date.now() - startTime,
          cacheHit: false,
        },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        status: 'failed',
        error: {
          code: 'EXECUTION_ERROR',
          message: err.message,
          userMessage: 'Something went wrong. Let me try a different approach.',
          retryable: true,
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          cacheHit: false,
        },
      };
    }
  }

  async listTools(
    agentId: string,
    subscriptionTier: string
  ): Promise<Array<{ id: string; name: string; description: string; domain: string }>> {
    if (!this.initialized) {
      await this.initialize();
    }

    const tools = this.toolRegistry!.getAll();
    return tools.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description || '',
      domain: t.domain,
    }));
  }

  async health(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }
}

class LocalPersonaService implements IPersonaService {
  private initialized = false;
  private AgentRegistry:
    | typeof import('../personas/registry/unified-registry.js').AgentRegistry
    | null = null;
  private bundleLoader: typeof import('../personas/bundles/loader.js') | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const [registryModule, loaderModule] = await Promise.all([
      import('../personas/registry/unified-registry.js'),
      import('../personas/bundles/loader.js'),
    ]);
    this.AgentRegistry = registryModule.AgentRegistry;
    this.bundleLoader = loaderModule;
    this.initialized = true;
    log.info('Local persona service initialized');
  }

  async getSystemPrompt(params: {
    personaId: string;
    userId: string;
    conversationHistory?: Array<{ role: string; content: string }>;
  }): Promise<{
    systemPrompt: string;
    greeting: string;
    voiceConfig: { provider: string; voiceId: string };
  }> {
    if (!this.initialized) {
      await this.initialize();
    }

    const agent = await this.AgentRegistry!.getAgentOrNull(params.personaId);
    if (!agent) {
      throw new Error(`Persona '${params.personaId}' not found`);
    }

    const bundle = await this.bundleLoader!.loadBundle(params.personaId);
    let systemPrompt = agent.description || '';
    let greeting = `Hello! I'm ${agent.name}.`;

    // Get richer content from bundle if available
    if (bundle?.manifest?.identity?.description) {
      systemPrompt = bundle.manifest.identity.description;
    }
    const behaviors = await bundle?.getBehaviors?.();
    if (behaviors?.greetings?.returning_user?.[0]) {
      greeting = behaviors.greetings.returning_user[0];
    } else if (behaviors?.greetings?.new_user?.[0]) {
      greeting = behaviors.greetings.new_user[0];
    }

    return {
      systemPrompt,
      greeting,
      voiceConfig: {
        provider: agent.voiceProvider || 'cartesia',
        voiceId: agent.voiceId || '',
      },
    };
  }

  async getPersona(personaId: string): Promise<{
    id: string;
    name: string;
    description: string;
    capabilities: string[];
  } | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    const agent = await this.AgentRegistry!.getAgentOrNull(personaId);
    if (!agent) return null;

    return {
      id: agent.id,
      name: agent.name,
      description: agent.description || '',
      capabilities: [],
    };
  }

  async health(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }
}

class LocalMemoryService implements IMemoryService {
  private initialized = false;
  private vectorStore: import('../memory/vector-store.js').VectorStore | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const memoryModule = await import('../memory/index.js');
    const result = await memoryModule.initializeMemorySystem({
      skipFirestoreInit: true, // Lazy initialization for faster startup
      indexPersona: false, // Skip persona indexing in service mode
      rehydrateConversations: false, // Skip rehydration in service mode
    });
    this.vectorStore = result.vectorStore as import('../memory/vector-store.js').VectorStore;
    this.initialized = true;
    log.info('Local memory service initialized');
  }

  async recall(
    userId: string,
    query: string,
    options?: { limit?: number; threshold?: number }
  ): Promise<Array<{ content: string; relevance: number; timestamp: number }>> {
    if (!this.initialized) {
      await this.initialize();
    }

    const results = await this.vectorStore!.search(query, {
      topK: options?.limit || 5,
      filter: { userId },
      minScore: options?.threshold || 0.5,
    });

    return results.map((r) => ({
      content: r.document.text,
      relevance: r.score,
      timestamp:
        r.document.metadata?.timestamp instanceof Date
          ? r.document.metadata.timestamp.getTime()
          : Date.now(),
    }));
  }

  async store(
    userId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<{ id: string }> {
    if (!this.initialized) {
      await this.initialize();
    }

    const { embed } = await import('../memory/embeddings.js');
    const embedding = await embed(content);
    const id = randomUUID();

    await this.vectorStore!.addDocument({
      id,
      text: content,
      embedding,
      metadata: {
        source: 'runtime',
        userId,
        timestamp: new Date(),
        ...metadata,
      },
    });

    return { id };
  }

  async health(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }
}

// ============================================================================
// REMOTE IMPLEMENTATIONS (gRPC/HTTP)
// ============================================================================

class RemoteToolService implements IToolService {
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  async execute(
    toolId: string,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      // Use Connect-ES client in production
      // For now, use HTTP/JSON as a simpler transport
      const response = await fetch(`${this.url}/ferni.tools.v1.ToolService/Execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          toolId,
          parameters,
          context: {
            userId: context.userId,
            sessionId: context.sessionId,
            agentId: context.agentId,
            agentDisplayName: context.agentDisplayName,
            subscriptionTier: this.tierToProto(context.subscriptionTier),
            recentTurns: context.recentTurns,
            tenantId: context.tenantId,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = (await response.json()) as {
        status?: string;
        result?: { data?: Record<string, unknown>; summary?: string };
        error?: { code: string; message: string; userMessage: string; retryable: boolean };
        metadata?: { cacheStatus?: string };
      };

      return {
        status: this.statusFromProto(result.status),
        data: result.result?.data,
        summary: result.result?.summary,
        error: result.error
          ? {
              code: result.error.code,
              message: result.error.message,
              userMessage: result.error.userMessage,
              retryable: result.error.retryable,
            }
          : undefined,
        metadata: {
          executionTimeMs: Date.now() - startTime,
          cacheHit: result.metadata?.cacheStatus === 'CACHE_STATUS_HIT',
        },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        status: 'failed',
        error: {
          code: 'NETWORK_ERROR',
          message: err.message,
          userMessage: `Connection's being flaky. Give me a sec to sort this out.`,
          retryable: true,
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          cacheHit: false,
        },
      };
    }
  }

  async listTools(
    agentId: string,
    subscriptionTier: string
  ): Promise<Array<{ id: string; name: string; description: string; domain: string }>> {
    const response = await fetch(`${this.url}/ferni.tools.v1.ToolService/ListTools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        subscriptionTier: this.tierToProto(subscriptionTier as 'free' | 'friend' | 'partner'),
      }),
    });

    const result = (await response.json()) as {
      tools?: Array<{ id: string; name: string; description: string; domain: string }>;
    };
    return result.tools || [];
  }

  async health(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.url}/ferni.tools.v1.ToolService/Health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const result = (await response.json()) as { status?: string };
      return {
        healthy: result.status === 'SERVICE_HEALTH_HEALTHY',
        latencyMs: Date.now() - start,
      };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }

  private tierToProto(tier: 'free' | 'friend' | 'partner'): string {
    const map = {
      free: 'SUBSCRIPTION_TIER_FREE',
      friend: 'SUBSCRIPTION_TIER_FRIEND',
      partner: 'SUBSCRIPTION_TIER_PARTNER',
    };
    return map[tier] || 'SUBSCRIPTION_TIER_FREE';
  }

  private statusFromProto(status: string | undefined): ToolExecutionResult['status'] {
    if (!status) return 'failed';
    const map: Record<string, ToolExecutionResult['status']> = {
      EXECUTION_STATUS_SUCCESS: 'success',
      EXECUTION_STATUS_PARTIAL: 'partial',
      EXECUTION_STATUS_FAILED: 'failed',
      EXECUTION_STATUS_TIMEOUT: 'timeout',
      EXECUTION_STATUS_RATE_LIMITED: 'rate_limited',
      EXECUTION_STATUS_UNAUTHORIZED: 'unauthorized',
    };
    return map[status] || 'failed';
  }
}

class RemotePersonaService implements IPersonaService {
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  async getSystemPrompt(params: {
    personaId: string;
    userId: string;
    conversationHistory?: Array<{ role: string; content: string }>;
  }): Promise<{
    systemPrompt: string;
    greeting: string;
    voiceConfig: { provider: string; voiceId: string };
  }> {
    const response = await fetch(`${this.url}/ferni.personas.v1.PersonaService/GetSystemPrompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return response.json() as Promise<{
      systemPrompt: string;
      greeting: string;
      voiceConfig: { provider: string; voiceId: string };
    }>;
  }

  async getPersona(personaId: string): Promise<{
    id: string;
    name: string;
    description: string;
    capabilities: string[];
  } | null> {
    const response = await fetch(`${this.url}/ferni.personas.v1.PersonaService/GetPersona`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personaId }),
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return response.json() as Promise<{
      id: string;
      name: string;
      description: string;
      capabilities: string[];
    }>;
  }

  async health(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.url}/health`, { method: 'GET' });
      return { healthy: response.ok, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }
}

class RemoteMemoryService implements IMemoryService {
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  async recall(
    userId: string,
    query: string,
    options?: { limit?: number; threshold?: number }
  ): Promise<Array<{ content: string; relevance: number; timestamp: number }>> {
    const response = await fetch(`${this.url}/ferni.memory.v1.MemoryService/Recall`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, query, ...options }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const result = (await response.json()) as {
      memories?: Array<{ content: string; relevance: number; timestamp: number }>;
    };
    return result.memories || [];
  }

  async store(
    userId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<{ id: string }> {
    const response = await fetch(`${this.url}/ferni.memory.v1.MemoryService/Store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, content, metadata }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return response.json() as Promise<{ id: string }>;
  }

  async health(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.url}/health`, { method: 'GET' });
      return { healthy: response.ok, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }
}

// ============================================================================
// RUNTIME FACTORY
// ============================================================================

class Runtime implements IRuntime {
  readonly mode: ServiceMode;
  readonly tools: IToolService;
  readonly personas: IPersonaService;
  readonly memory: IMemoryService;

  constructor(
    mode: ServiceMode,
    tools: IToolService,
    personas: IPersonaService,
    memory: IMemoryService
  ) {
    this.mode = mode;
    this.tools = tools;
    this.personas = personas;
    this.memory = memory;
  }

  async shutdown(): Promise<void> {
    log.info({ mode: this.mode }, 'Runtime shutting down');
    // Cleanup resources if needed
  }

  async health(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, { healthy: boolean; latencyMs: number }>;
  }> {
    const [tools, personas, memory] = await Promise.all([
      this.tools.health(),
      this.personas.health(),
      this.memory.health(),
    ]);

    const services = { tools, personas, memory };
    const healthyCount = Object.values(services).filter((s) => s.healthy).length;

    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyCount === 3) {
      overall = 'healthy';
    } else if (healthyCount > 0) {
      overall = 'degraded';
    } else {
      overall = 'unhealthy';
    }

    return { overall, services };
  }
}

/**
 * Detect the appropriate service mode based on environment
 */
export function detectServiceMode(): ServiceMode {
  // Explicit override
  const envMode = process.env.SERVICE_MODE as ServiceMode | undefined;
  if (envMode && ['local', 'remote', 'hybrid'].includes(envMode)) {
    return envMode;
  }

  // Cloud Run detection
  if (process.env.K_SERVICE || process.env.CLOUD_RUN_JOB) {
    return 'remote';
  }

  // Kubernetes detection
  if (process.env.KUBERNETES_SERVICE_HOST) {
    return 'remote';
  }

  // Default to local for development
  return 'local';
}

/**
 * Create a runtime instance based on configuration
 */
export async function createRuntime(config?: Partial<RuntimeConfig>): Promise<IRuntime> {
  const mode = config?.mode || detectServiceMode();

  log.info({ mode }, 'Creating runtime');

  let tools: IToolService;
  let personas: IPersonaService;
  let memory: IMemoryService;

  if (mode === 'local') {
    // All services run in-process
    tools = new LocalToolService();
    personas = new LocalPersonaService();
    memory = new LocalMemoryService();
  } else if (mode === 'remote') {
    // All services are remote
    const urls = config?.services || {};
    tools = new RemoteToolService(
      urls.toolService || process.env.TOOL_SERVICE_URL || 'http://localhost:50051'
    );
    personas = new RemotePersonaService(
      urls.personaService || process.env.PERSONA_SERVICE_URL || 'http://localhost:50052'
    );
    memory = new RemoteMemoryService(
      urls.memoryService || process.env.MEMORY_SERVICE_URL || 'http://localhost:50053'
    );
  } else {
    // Hybrid: mix of local and remote based on config
    const overrides = config?.localOverrides || {};
    const urls = config?.services || {};

    tools = overrides.tools
      ? new LocalToolService()
      : new RemoteToolService(
          urls.toolService || process.env.TOOL_SERVICE_URL || 'http://localhost:50051'
        );

    personas = overrides.personas
      ? new LocalPersonaService()
      : new RemotePersonaService(
          urls.personaService || process.env.PERSONA_SERVICE_URL || 'http://localhost:50052'
        );

    memory = overrides.memory
      ? new LocalMemoryService()
      : new RemoteMemoryService(
          urls.memoryService || process.env.MEMORY_SERVICE_URL || 'http://localhost:50053'
        );
  }

  const runtime = new Runtime(mode, tools, personas, memory);

  // Warm up services
  const health = await runtime.health();
  log.info({ mode, health: health.overall }, 'Runtime created');

  return runtime;
}

// ============================================================================
// SINGLETON (For easy access throughout the app)
// ============================================================================

let _runtime: IRuntime | null = null;

/**
 * Get or create the global runtime instance
 */
export async function getRuntime(config?: Partial<RuntimeConfig>): Promise<IRuntime> {
  if (!_runtime) {
    _runtime = await createRuntime(config);
  }
  return _runtime;
}

/**
 * Reset the global runtime (for testing)
 */
export function resetRuntime(): void {
  _runtime = null;
}
