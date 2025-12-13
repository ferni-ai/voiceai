# Ferni Marketplace Runtime Architecture

> Specification for scaling voice agents as isolated marketplace services

## Overview

This document specifies the architecture for running 100+ marketplace agents with:
- **Tool Service**: Stateless gRPC service for tool execution
- **Agent Runtime**: Isolated bounded contexts for marketplace agents
- **Service Mesh**: Discovery, routing, and observability

---

## Part 1: Tool Service gRPC Interface

### 1.1 Proto Definitions

```protobuf
// proto/ferni/tools/v1/tool_service.proto

syntax = "proto3";

package ferni.tools.v1;

import "google/protobuf/struct.proto";
import "google/protobuf/timestamp.proto";
import "google/protobuf/duration.proto";

option go_package = "github.com/ferni/proto/tools/v1;toolsv1";

// ============================================================================
// TOOL SERVICE
// ============================================================================

service ToolService {
  // Execute a single tool
  rpc Execute(ExecuteRequest) returns (ExecuteResponse);

  // Execute a tool with streaming results (for long-running tools)
  rpc ExecuteStream(ExecuteRequest) returns (stream ExecuteStreamResponse);

  // Batch execute multiple tools in parallel
  rpc ExecuteBatch(ExecuteBatchRequest) returns (ExecuteBatchResponse);

  // List available tools (for agent tool building)
  rpc ListTools(ListToolsRequest) returns (ListToolsResponse);

  // Get tool definition (schema, description, examples)
  rpc GetTool(GetToolRequest) returns (GetToolResponse);

  // Health check
  rpc Health(HealthRequest) returns (HealthResponse);
}

// ============================================================================
// EXECUTION MESSAGES
// ============================================================================

message ExecuteRequest {
  // Tool identifier (e.g., "habitCoaching.createHabit")
  string tool_id = 1;

  // Tool parameters as structured data
  google.protobuf.Struct parameters = 2;

  // Execution context
  ToolContext context = 3;

  // Optional: Override timeout (default: 30s)
  google.protobuf.Duration timeout = 4;

  // Optional: Idempotency key for retry safety
  string idempotency_key = 5;
}

message ToolContext {
  // User making the request
  string user_id = 1;

  // Current session ID
  string session_id = 2;

  // Agent executing the tool
  string agent_id = 3;

  // Agent display name (for humanized outputs)
  string agent_display_name = 4;

  // Subscription tier (affects tool availability)
  SubscriptionTier subscription_tier = 5;

  // Conversation context (last N turns for tool relevance)
  repeated ConversationTurn recent_turns = 6;

  // Domain-specific configuration overrides
  map<string, google.protobuf.Struct> domain_config = 7;

  // Trace context for distributed tracing
  TraceContext trace = 8;
}

enum SubscriptionTier {
  SUBSCRIPTION_TIER_UNSPECIFIED = 0;
  SUBSCRIPTION_TIER_FREE = 1;
  SUBSCRIPTION_TIER_FRIEND = 2;
  SUBSCRIPTION_TIER_PARTNER = 3;
}

message ConversationTurn {
  string role = 1;  // "user" or "assistant"
  string content = 2;
  google.protobuf.Timestamp timestamp = 3;
}

message TraceContext {
  string trace_id = 1;
  string span_id = 2;
  string parent_span_id = 3;
}

message ExecuteResponse {
  // Execution status
  ExecutionStatus status = 1;

  // Tool result (success case)
  ToolResult result = 2;

  // Error details (failure case)
  ToolError error = 3;

  // Execution metadata
  ExecutionMetadata metadata = 4;
}

message ToolResult {
  // Structured result data
  google.protobuf.Struct data = 1;

  // Human-readable summary (for voice output)
  string summary = 2;

  // Suggested follow-up actions
  repeated SuggestedAction suggested_actions = 3;

  // Side effects that occurred
  repeated SideEffect side_effects = 4;
}

message SuggestedAction {
  string tool_id = 1;
  string description = 2;
  google.protobuf.Struct suggested_params = 3;
}

message SideEffect {
  string type = 1;  // "memory_created", "notification_sent", etc.
  string description = 2;
  google.protobuf.Struct details = 3;
}

enum ExecutionStatus {
  EXECUTION_STATUS_UNSPECIFIED = 0;
  EXECUTION_STATUS_SUCCESS = 1;
  EXECUTION_STATUS_PARTIAL = 2;  // Some data returned, but incomplete
  EXECUTION_STATUS_FAILED = 3;
  EXECUTION_STATUS_TIMEOUT = 4;
  EXECUTION_STATUS_RATE_LIMITED = 5;
  EXECUTION_STATUS_UNAUTHORIZED = 6;
}

message ToolError {
  // Error code (machine-readable)
  string code = 1;

  // Error message (developer-readable)
  string message = 2;

  // User-friendly error message (for voice output)
  string user_message = 3;

  // Is this error retryable?
  bool retryable = 4;

  // Suggested retry delay
  google.protobuf.Duration retry_after = 5;

  // Additional error context
  google.protobuf.Struct details = 6;
}

message ExecutionMetadata {
  // Time spent executing
  google.protobuf.Duration execution_time = 1;

  // Tool version used
  string tool_version = 2;

  // Cache status
  CacheStatus cache_status = 3;

  // Rate limit info
  RateLimitInfo rate_limit = 4;
}

enum CacheStatus {
  CACHE_STATUS_UNSPECIFIED = 0;
  CACHE_STATUS_MISS = 1;
  CACHE_STATUS_HIT = 2;
  CACHE_STATUS_STALE = 3;
}

message RateLimitInfo {
  int32 remaining = 1;
  int32 limit = 2;
  google.protobuf.Timestamp reset_at = 3;
}

// ============================================================================
// STREAMING EXECUTION
// ============================================================================

message ExecuteStreamResponse {
  oneof response {
    // Progress updates during execution
    ExecutionProgress progress = 1;

    // Partial results (streaming)
    PartialResult partial = 2;

    // Final result
    ExecuteResponse final = 3;
  }
}

message ExecutionProgress {
  // Progress percentage (0-100)
  int32 percent = 1;

  // Current step description
  string step = 2;

  // Estimated time remaining
  google.protobuf.Duration eta = 3;
}

message PartialResult {
  // Chunk of streaming data
  google.protobuf.Struct chunk = 1;

  // Sequence number for ordering
  int32 sequence = 2;
}

// ============================================================================
// BATCH EXECUTION
// ============================================================================

message ExecuteBatchRequest {
  // Multiple tool executions
  repeated ExecuteRequest requests = 1;

  // Execution strategy
  BatchStrategy strategy = 2;

  // Overall timeout for entire batch
  google.protobuf.Duration timeout = 3;
}

enum BatchStrategy {
  BATCH_STRATEGY_UNSPECIFIED = 0;
  BATCH_STRATEGY_PARALLEL = 1;      // Execute all in parallel
  BATCH_STRATEGY_SEQUENTIAL = 2;    // Execute in order
  BATCH_STRATEGY_PIPELINE = 3;      // Chain outputs to inputs
}

message ExecuteBatchResponse {
  // Results in same order as requests
  repeated ExecuteResponse responses = 1;

  // Overall batch status
  BatchStatus status = 2;

  // Total execution time
  google.protobuf.Duration total_time = 3;
}

enum BatchStatus {
  BATCH_STATUS_UNSPECIFIED = 0;
  BATCH_STATUS_ALL_SUCCESS = 1;
  BATCH_STATUS_PARTIAL_SUCCESS = 2;
  BATCH_STATUS_ALL_FAILED = 3;
}

// ============================================================================
// TOOL DISCOVERY
// ============================================================================

message ListToolsRequest {
  // Filter by domain
  repeated string domains = 1;

  // Filter by tags
  repeated string tags = 2;

  // Filter by agent (tools available to this agent)
  string agent_id = 3;

  // Filter by subscription tier
  SubscriptionTier subscription_tier = 4;

  // Pagination
  int32 page_size = 5;
  string page_token = 6;
}

message ListToolsResponse {
  repeated ToolSummary tools = 1;
  string next_page_token = 2;
  int32 total_count = 3;
}

message ToolSummary {
  string id = 1;
  string name = 2;
  string description = 3;
  string domain = 4;
  repeated string tags = 5;
  SubscriptionTier required_tier = 6;
}

message GetToolRequest {
  string tool_id = 1;
}

message GetToolResponse {
  ToolDefinition tool = 1;
}

message ToolDefinition {
  string id = 1;
  string name = 2;
  string description = 3;
  string domain = 4;
  repeated string additional_domains = 5;
  repeated string tags = 6;

  // JSON Schema for parameters
  google.protobuf.Struct parameter_schema = 7;

  // JSON Schema for result
  google.protobuf.Struct result_schema = 8;

  // Example usages
  repeated ToolExample examples = 9;

  // Rate limits
  ToolRateLimits rate_limits = 10;

  // Required subscription tier
  SubscriptionTier required_tier = 11;
}

message ToolExample {
  string description = 1;
  google.protobuf.Struct parameters = 2;
  google.protobuf.Struct expected_result = 3;
}

message ToolRateLimits {
  int32 requests_per_minute = 1;
  int32 requests_per_hour = 2;
  int32 requests_per_day = 3;
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

message HealthRequest {}

message HealthResponse {
  ServiceHealth status = 1;
  map<string, ComponentHealth> components = 2;
  google.protobuf.Timestamp timestamp = 3;
}

enum ServiceHealth {
  SERVICE_HEALTH_UNSPECIFIED = 0;
  SERVICE_HEALTH_HEALTHY = 1;
  SERVICE_HEALTH_DEGRADED = 2;
  SERVICE_HEALTH_UNHEALTHY = 3;
}

message ComponentHealth {
  ServiceHealth status = 1;
  string message = 2;
  google.protobuf.Duration latency = 3;
}
```

### 1.2 TypeScript Client

```typescript
// src/services/tool-service/client.ts

import { createClient } from '@connectrpc/connect';
import { createGrpcTransport } from '@connectrpc/connect-node';
import { ToolService } from './gen/ferni/tools/v1/tool_service_connect';
import type { ExecuteRequest, ExecuteResponse, ToolContext } from './gen/ferni/tools/v1/tool_service_pb';

export interface ToolServiceClientOptions {
  /** Service URL (e.g., 'http://localhost:50051' or 'unix:///tmp/tools.sock') */
  url: string;
  /** Request timeout in ms */
  timeout?: number;
  /** Retry configuration */
  retry?: {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
  };
}

export class ToolServiceClient {
  private client: ReturnType<typeof createClient<typeof ToolService>>;
  private opts: Required<ToolServiceClientOptions>;

  constructor(opts: ToolServiceClientOptions) {
    this.opts = {
      timeout: 30_000,
      retry: { maxAttempts: 3, baseDelay: 100, maxDelay: 2000 },
      ...opts,
    };

    const transport = createGrpcTransport({
      baseUrl: opts.url,
      httpVersion: '2',
    });

    this.client = createClient(ToolService, transport);
  }

  /**
   * Execute a tool with automatic retry and tracing
   */
  async execute(
    toolId: string,
    parameters: Record<string, unknown>,
    context: Omit<ToolContext, 'trace'>
  ): Promise<ExecuteResponse> {
    const request: ExecuteRequest = {
      toolId,
      parameters: { fields: this.toProtoStruct(parameters) },
      context: {
        ...context,
        trace: this.createTraceContext(),
      },
    };

    return this.withRetry(() =>
      this.client.execute(request, {
        timeoutMs: this.opts.timeout,
      })
    );
  }

  /**
   * Execute with streaming results
   */
  async *executeStream(
    toolId: string,
    parameters: Record<string, unknown>,
    context: Omit<ToolContext, 'trace'>
  ): AsyncGenerator<ExecuteStreamResponse> {
    const request: ExecuteRequest = {
      toolId,
      parameters: { fields: this.toProtoStruct(parameters) },
      context: {
        ...context,
        trace: this.createTraceContext(),
      },
    };

    for await (const response of this.client.executeStream(request)) {
      yield response;
    }
  }

  /**
   * List available tools for an agent
   */
  async listTools(agentId: string, subscriptionTier: SubscriptionTier): Promise<ToolSummary[]> {
    const response = await this.client.listTools({
      agentId,
      subscriptionTier,
    });
    return response.tools;
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.opts.retry.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (!this.isRetryable(error)) {
          throw error;
        }

        const delay = Math.min(
          this.opts.retry.baseDelay * Math.pow(2, attempt),
          this.opts.retry.maxDelay
        );
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private isRetryable(error: unknown): boolean {
    // Retry on network errors, rate limits, and server errors
    if (error instanceof Error) {
      return (
        error.message.includes('UNAVAILABLE') ||
        error.message.includes('DEADLINE_EXCEEDED') ||
        error.message.includes('RESOURCE_EXHAUSTED')
      );
    }
    return false;
  }

  private createTraceContext(): TraceContext {
    return {
      traceId: crypto.randomUUID(),
      spanId: crypto.randomUUID().slice(0, 16),
      parentSpanId: '',
    };
  }

  private toProtoStruct(obj: Record<string, unknown>): Record<string, Value> {
    // Convert JS object to protobuf Struct
    // Implementation details...
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton factory
let _client: ToolServiceClient | null = null;

export function getToolServiceClient(): ToolServiceClient {
  if (!_client) {
    _client = new ToolServiceClient({
      url: process.env.TOOL_SERVICE_URL || 'http://localhost:50051',
      timeout: 30_000,
    });
  }
  return _client;
}
```

### 1.3 Tool Service Implementation

```typescript
// src/services/tool-service/server.ts

import { createServer } from '@connectrpc/connect-node';
import { ToolService } from './gen/ferni/tools/v1/tool_service_connect';
import { ToolRegistry } from '../../tools/registry';
import { createLogger } from '../../utils/logger';

const log = createLogger('tool-service');

export function createToolServiceHandlers(registry: ToolRegistry) {
  return {
    async execute(request: ExecuteRequest): Promise<ExecuteResponse> {
      const startTime = Date.now();
      const { toolId, parameters, context } = request;

      log.info({ toolId, userId: context.userId }, 'Executing tool');

      try {
        // Get tool from registry
        const toolDef = await registry.getTool(toolId);
        if (!toolDef) {
          return {
            status: ExecutionStatus.FAILED,
            error: {
              code: 'TOOL_NOT_FOUND',
              message: `Tool '${toolId}' not found`,
              userMessage: "I don't have that capability right now.",
              retryable: false,
            },
          };
        }

        // Check subscription tier
        if (!this.checkTierAccess(toolDef.requiredTier, context.subscriptionTier)) {
          return {
            status: ExecutionStatus.UNAUTHORIZED,
            error: {
              code: 'INSUFFICIENT_TIER',
              message: `Tool requires ${toolDef.requiredTier} tier`,
              userMessage: 'This feature requires an upgraded subscription.',
              retryable: false,
            },
          };
        }

        // Create tool instance with context
        const tool = toolDef.create({
          userId: context.userId,
          agentId: context.agentId,
          agentDisplayName: context.agentDisplayName,
          services: this.serviceRegistry,
          domainConfig: context.domainConfig,
        });

        // Execute
        const result = await tool.execute(this.fromProtoStruct(parameters));

        return {
          status: ExecutionStatus.SUCCESS,
          result: {
            data: this.toProtoStruct(result.data),
            summary: result.summary,
            suggestedActions: result.suggestedActions || [],
            sideEffects: result.sideEffects || [],
          },
          metadata: {
            executionTime: { seconds: 0, nanos: (Date.now() - startTime) * 1e6 },
            toolVersion: toolDef.version || '1.0.0',
            cacheStatus: CacheStatus.MISS,
          },
        };
      } catch (error) {
        log.error({ toolId, error }, 'Tool execution failed');

        return {
          status: ExecutionStatus.FAILED,
          error: {
            code: 'EXECUTION_ERROR',
            message: error.message,
            userMessage: 'Something went wrong. Let me try a different approach.',
            retryable: this.isRetryableError(error),
          },
        };
      }
    },

    async *executeStream(request: ExecuteRequest): AsyncGenerator<ExecuteStreamResponse> {
      // For tools that stream results (e.g., research, long computations)
      const { toolId, parameters, context } = request;

      const toolDef = await registry.getTool(toolId);
      if (!toolDef.supportsStreaming) {
        // Fall back to single response
        const response = await this.execute(request);
        yield { final: response };
        return;
      }

      const tool = toolDef.create(/* ... */);

      let sequence = 0;
      for await (const chunk of tool.executeStream(parameters)) {
        yield {
          partial: {
            chunk: this.toProtoStruct(chunk),
            sequence: sequence++,
          },
        };
      }

      yield {
        final: {
          status: ExecutionStatus.SUCCESS,
          // ... final result
        },
      };
    },

    async listTools(request: ListToolsRequest): Promise<ListToolsResponse> {
      const tools = await registry.getToolsForAgent(
        request.agentId,
        request.subscriptionTier,
        {
          domains: request.domains,
          tags: request.tags,
        }
      );

      return {
        tools: tools.map(t => ({
          id: t.id,
          name: t.name,
          description: t.description,
          domain: t.domain,
          tags: t.tags,
          requiredTier: t.requiredTier,
        })),
        totalCount: tools.length,
      };
    },
  };
}

// Start server
export async function startToolService(port: number = 50051) {
  const registry = await initializeToolRegistry();
  const handlers = createToolServiceHandlers(registry);

  const server = createServer({
    routes: (router) => {
      router.service(ToolService, handlers);
    },
  });

  await server.listen(`0.0.0.0:${port}`);
  log.info({ port }, 'Tool service started');
}
```

---

## Part 2: Marketplace Agent Runtime

### 2.1 Bounded Context Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FERNI MARKETPLACE RUNTIME                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        GATEWAY LAYER                                 │   │
│  │  - LiveKit connection management                                     │   │
│  │  - Job routing by agent_name                                         │   │
│  │  - Rate limiting per tenant                                          │   │
│  │  - Authentication/Authorization                                      │   │
│  └───────────────────────────┬─────────────────────────────────────────┘   │
│                              │                                              │
│  ┌───────────────────────────▼─────────────────────────────────────────┐   │
│  │                     AGENT ROUTER                                     │   │
│  │  - Routes to correct bounded context                                 │   │
│  │  - Handles handoffs between contexts                                 │   │
│  │  - Maintains session affinity                                        │   │
│  └───────────────────────────┬─────────────────────────────────────────┘   │
│                              │                                              │
│  ┌───────────┬───────────────┼───────────────┬───────────────┐             │
│  ▼           ▼               ▼               ▼               ▼             │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐               │
│ │ CONTEXT │ │ CONTEXT │ │ CONTEXT │ │ CONTEXT │ │ CONTEXT │               │
│ │  ferni  │ │  maya   │ │  alex   │ │ partner │ │ partner │               │
│ │ (core)  │ │ (core)  │ │ (core)  │ │   #1    │ │   #2    │               │
│ ├─────────┤ ├─────────┤ ├─────────┤ ├─────────┤ ├─────────┤               │
│ │Workers:2│ │Workers:1│ │Workers:1│ │Workers:1│ │Workers:1│               │
│ │Tools:15 │ │Tools:10 │ │Tools:12 │ │Tools:5  │ │Tools:8  │               │
│ │Memory:2G│ │Memory:1G│ │Memory:1G│ │Memory:512M│Memory:512M              │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘               │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     SHARED SERVICES                                  │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐               │   │
│  │  │  Tool    │ │  Memory  │ │  LLM     │ │  TTS     │               │   │
│  │  │ Service  │ │ Service  │ │ Gateway  │ │ Gateway  │               │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Bounded Context Definition

```typescript
// src/runtime/context/bounded-context.ts

import { EventEmitter } from 'node:events';
import type { Logger } from 'pino';

/**
 * A Bounded Context isolates a marketplace agent with:
 * - Its own worker pool
 * - Resource quotas (memory, CPU, connections)
 * - Tool access restrictions
 * - Isolated state
 */
export interface BoundedContextConfig {
  /** Unique context identifier */
  id: string;

  /** Agent IDs this context handles */
  agentIds: string[];

  /** Resource limits */
  resources: ResourceQuota;

  /** Tool domains this context can access */
  allowedToolDomains: string[];

  /** Forbidden tool IDs (blacklist) */
  forbiddenTools: string[];

  /** Service endpoints */
  services: ServiceEndpoints;

  /** Tenant information (for multi-tenancy) */
  tenant?: TenantConfig;

  /** Scaling configuration */
  scaling: ScalingConfig;
}

export interface ResourceQuota {
  /** Max memory in bytes */
  maxMemoryBytes: number;

  /** Max CPU cores (can be fractional) */
  maxCpuCores: number;

  /** Max concurrent sessions */
  maxConcurrentSessions: number;

  /** Max requests per minute */
  maxRequestsPerMinute: number;

  /** Max tool executions per minute */
  maxToolExecutionsPerMinute: number;
}

export interface ServiceEndpoints {
  toolService: string;
  memoryService: string;
  llmGateway: string;
  ttsGateway: string;
}

export interface TenantConfig {
  tenantId: string;
  tenantName: string;
  subscriptionTier: 'free' | 'pro' | 'enterprise';
  customBranding?: {
    voiceId?: string;
    systemPromptAdditions?: string;
  };
}

export interface ScalingConfig {
  /** Minimum workers to keep warm */
  minWorkers: number;

  /** Maximum workers to scale to */
  maxWorkers: number;

  /** Target sessions per worker */
  targetSessionsPerWorker: number;

  /** Scale up threshold (0-1) */
  scaleUpThreshold: number;

  /** Scale down threshold (0-1) */
  scaleDownThreshold: number;

  /** Cooldown between scaling actions */
  scalingCooldownMs: number;
}

export class BoundedContext extends EventEmitter {
  private config: BoundedContextConfig;
  private workers: Map<string, ContextWorker> = new Map();
  private activeSessions: Map<string, SessionInfo> = new Map();
  private metrics: ContextMetrics;
  private log: Logger;

  constructor(config: BoundedContextConfig, log: Logger) {
    super();
    this.config = config;
    this.log = log.child({ contextId: config.id });
    this.metrics = new ContextMetrics(config.id);
  }

  /**
   * Initialize the bounded context
   */
  async initialize(): Promise<void> {
    this.log.info({ agentIds: this.config.agentIds }, 'Initializing bounded context');

    // Create minimum workers
    for (let i = 0; i < this.config.scaling.minWorkers; i++) {
      await this.spawnWorker();
    }

    // Start metrics collection
    this.startMetricsCollection();

    // Start autoscaler
    this.startAutoscaler();

    this.log.info('Bounded context initialized');
  }

  /**
   * Check if this context handles the given agent
   */
  handlesAgent(agentId: string): boolean {
    return this.config.agentIds.includes(agentId);
  }

  /**
   * Acquire a worker for a new session
   */
  async acquireWorker(sessionId: string, agentId: string): Promise<ContextWorker> {
    // Check quota
    if (this.activeSessions.size >= this.config.resources.maxConcurrentSessions) {
      throw new QuotaExceededError('maxConcurrentSessions', this.config.resources.maxConcurrentSessions);
    }

    // Find available worker or spawn new one
    let worker = this.findAvailableWorker();

    if (!worker && this.workers.size < this.config.scaling.maxWorkers) {
      worker = await this.spawnWorker();
    }

    if (!worker) {
      throw new NoWorkersAvailableError(this.config.id);
    }

    // Track session
    this.activeSessions.set(sessionId, {
      sessionId,
      agentId,
      workerId: worker.id,
      startedAt: Date.now(),
    });

    worker.sessionCount++;
    this.metrics.sessionStarted(agentId);

    return worker;
  }

  /**
   * Release a worker after session ends
   */
  releaseWorker(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const worker = this.workers.get(session.workerId);
    if (worker) {
      worker.sessionCount--;
    }

    this.activeSessions.delete(sessionId);
    this.metrics.sessionEnded(session.agentId, Date.now() - session.startedAt);
  }

  /**
   * Execute a tool within this context's restrictions
   */
  async executeTool(
    toolId: string,
    parameters: Record<string, unknown>,
    context: ToolContext
  ): Promise<ExecuteResponse> {
    // Check tool domain is allowed
    const domain = this.extractDomain(toolId);
    if (!this.config.allowedToolDomains.includes(domain) &&
        !this.config.allowedToolDomains.includes('*')) {
      throw new ToolAccessDeniedError(toolId, domain, this.config.id);
    }

    // Check tool is not forbidden
    if (this.config.forbiddenTools.includes(toolId)) {
      throw new ToolAccessDeniedError(toolId, 'forbidden', this.config.id);
    }

    // Check rate limit
    if (!this.metrics.checkToolRateLimit()) {
      throw new RateLimitExceededError('toolExecutions');
    }

    // Execute via tool service
    const client = this.getToolServiceClient();
    const response = await client.execute(toolId, parameters, {
      ...context,
      // Inject tenant context if multi-tenant
      ...(this.config.tenant && {
        tenantId: this.config.tenant.tenantId,
      }),
    });

    this.metrics.toolExecuted(toolId, response.status);
    return response;
  }

  /**
   * Get context status for monitoring
   */
  getStatus(): ContextStatus {
    return {
      id: this.config.id,
      agentIds: this.config.agentIds,
      workerCount: this.workers.size,
      activeSessionCount: this.activeSessions.size,
      resourceUsage: this.metrics.getResourceUsage(),
      health: this.calculateHealth(),
    };
  }

  private async spawnWorker(): Promise<ContextWorker> {
    const workerId = `${this.config.id}-worker-${crypto.randomUUID().slice(0, 8)}`;

    const worker = new ContextWorker({
      id: workerId,
      contextId: this.config.id,
      services: this.config.services,
      resourceLimits: {
        maxMemoryBytes: this.config.resources.maxMemoryBytes / this.config.scaling.maxWorkers,
        maxCpuCores: this.config.resources.maxCpuCores / this.config.scaling.maxWorkers,
      },
    });

    await worker.initialize();
    this.workers.set(workerId, worker);

    this.log.info({ workerId }, 'Worker spawned');
    return worker;
  }

  private findAvailableWorker(): ContextWorker | undefined {
    const target = this.config.scaling.targetSessionsPerWorker;

    for (const worker of this.workers.values()) {
      if (worker.sessionCount < target && worker.isHealthy) {
        return worker;
      }
    }

    return undefined;
  }

  private startAutoscaler(): void {
    setInterval(() => {
      const usage = this.calculateUsage();

      if (usage > this.config.scaling.scaleUpThreshold) {
        this.scaleUp();
      } else if (usage < this.config.scaling.scaleDownThreshold) {
        this.scaleDown();
      }
    }, this.config.scaling.scalingCooldownMs);
  }

  private calculateUsage(): number {
    if (this.workers.size === 0) return 1;

    const totalCapacity = this.workers.size * this.config.scaling.targetSessionsPerWorker;
    return this.activeSessions.size / totalCapacity;
  }

  private async scaleUp(): Promise<void> {
    if (this.workers.size >= this.config.scaling.maxWorkers) return;

    this.log.info({ currentWorkers: this.workers.size }, 'Scaling up');
    await this.spawnWorker();
  }

  private async scaleDown(): Promise<void> {
    if (this.workers.size <= this.config.scaling.minWorkers) return;

    // Find worker with no sessions
    for (const [id, worker] of this.workers) {
      if (worker.sessionCount === 0) {
        this.log.info({ workerId: id }, 'Scaling down');
        await worker.shutdown();
        this.workers.delete(id);
        break;
      }
    }
  }

  private calculateHealth(): 'healthy' | 'degraded' | 'unhealthy' {
    const usage = this.calculateUsage();
    const healthyWorkers = Array.from(this.workers.values()).filter(w => w.isHealthy).length;

    if (healthyWorkers === 0) return 'unhealthy';
    if (usage > 0.9 || healthyWorkers < this.workers.size * 0.5) return 'degraded';
    return 'healthy';
  }
}
```

### 2.3 Context Worker

```typescript
// src/runtime/context/context-worker.ts

import { Room, RoomEvent } from '@livekit/rtc-node';
import { JobContext, runWithJobContextAsync } from '@livekit/agents';
import type { ToolServiceClient } from '../../services/tool-service/client';
import type { PersonaServiceClient } from '../../services/persona-service/client';

export interface ContextWorkerConfig {
  id: string;
  contextId: string;
  services: ServiceEndpoints;
  resourceLimits: {
    maxMemoryBytes: number;
    maxCpuCores: number;
  };
}

export class ContextWorker {
  readonly id: string;
  private config: ContextWorkerConfig;
  private toolClient: ToolServiceClient;
  private personaClient: PersonaServiceClient;

  sessionCount: number = 0;
  isHealthy: boolean = true;

  private activeJobs: Map<string, JobInfo> = new Map();

  constructor(config: ContextWorkerConfig) {
    this.id = config.id;
    this.config = config;
  }

  async initialize(): Promise<void> {
    // Connect to shared services
    this.toolClient = new ToolServiceClient({ url: this.config.services.toolService });
    this.personaClient = new PersonaServiceClient({ url: this.config.services.personaService });

    // Prewarm connections
    await Promise.all([
      this.toolClient.health(),
      this.personaClient.health(),
    ]);
  }

  /**
   * Run a voice session in this worker
   */
  async runSession(jobInfo: RunningJobInfo, options: SessionOptions): Promise<void> {
    const jobId = jobInfo.job.id;
    const room = new Room();

    try {
      this.activeJobs.set(jobId, { jobInfo, room, startedAt: Date.now() });

      // Create JobContext compatible with LiveKit SDK
      const ctx = this.createJobContext(jobInfo, room);

      // Run the session
      await runWithJobContextAsync(ctx, async () => {
        await this.executeSession(ctx, options);
      });

    } finally {
      this.activeJobs.delete(jobId);
      await room.disconnect().catch(() => {});
    }
  }

  /**
   * Execute the actual voice session
   */
  private async executeSession(ctx: JobContext, options: SessionOptions): Promise<void> {
    // Connect to room
    await ctx.connect();

    // Get persona context from persona service
    const personaContext = await this.personaClient.getSystemPrompt({
      personaId: options.agentId,
      userId: options.userId,
      conversationHistory: options.conversationHistory,
    });

    // Create agent session with injected services
    const session = new AgentSession({
      llm: this.createLLMProxy(options),
      tts: this.createTTSProxy(options),
      stt: this.createSTTProxy(options),
      vad: this.createVAD(),
      turnDetection: AgentSession.LiveKitTurnDetection(),

      // Tools come from tool service, not local registry
      tools: this.createToolProxy(options),
    });

    // Set up event handlers
    this.setupSessionEvents(session, ctx, options);

    // Start session
    await session.start(ctx.room, ctx.room.remoteParticipants.values().next().value);

    // Initial greeting
    await session.generateReply({ instructions: personaContext.greeting });

    // Wait for session to end
    await this.waitForSessionEnd(ctx, session);
  }

  /**
   * Create a tool proxy that calls the tool service
   */
  private createToolProxy(options: SessionOptions): ToolProxy {
    return {
      execute: async (toolId: string, params: unknown) => {
        const response = await this.toolClient.execute(toolId, params as Record<string, unknown>, {
          userId: options.userId,
          sessionId: options.sessionId,
          agentId: options.agentId,
          agentDisplayName: options.agentDisplayName,
          subscriptionTier: options.subscriptionTier,
        });

        if (response.status === ExecutionStatus.FAILED) {
          throw new ToolExecutionError(toolId, response.error);
        }

        return response.result;
      },

      getToolDefinitions: async () => {
        const tools = await this.toolClient.listTools(
          options.agentId,
          options.subscriptionTier
        );

        // Convert to LLM tool format
        return tools.map(t => ({
          type: 'function',
          function: {
            name: t.id,
            description: t.description,
            parameters: t.parameterSchema,
          },
        }));
      },
    };
  }

  async shutdown(): Promise<void> {
    // Drain active jobs
    const drainPromises = Array.from(this.activeJobs.values()).map(async (job) => {
      try {
        await job.room.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    });

    await Promise.allSettled(drainPromises);
    this.activeJobs.clear();
    this.isHealthy = false;
  }
}
```

### 2.4 Agent Router

```typescript
// src/runtime/router/agent-router.ts

import type { JobRequest, RunningJobInfo } from '@livekit/agents';
import type { BoundedContext } from '../context/bounded-context';
import { createLogger } from '../../utils/logger';

const log = createLogger('agent-router');

export interface AgentRouterConfig {
  /** Default context for unmatched agents */
  defaultContextId: string;

  /** Enable dynamic context creation for new marketplace agents */
  enableDynamicContexts: boolean;

  /** Handoff configuration */
  handoff: {
    /** Allow handoffs between contexts */
    crossContextHandoffs: boolean;
    /** Timeout for handoff completion */
    handoffTimeoutMs: number;
  };
}

export class AgentRouter {
  private contexts: Map<string, BoundedContext> = new Map();
  private agentToContext: Map<string, string> = new Map();
  private config: AgentRouterConfig;

  constructor(config: AgentRouterConfig) {
    this.config = config;
  }

  /**
   * Register a bounded context
   */
  registerContext(context: BoundedContext): void {
    this.contexts.set(context.id, context);

    // Index agents to context
    for (const agentId of context.config.agentIds) {
      this.agentToContext.set(agentId, context.id);
    }

    log.info({ contextId: context.id, agents: context.config.agentIds }, 'Context registered');
  }

  /**
   * Route a job request to the appropriate context
   */
  async routeJob(jobInfo: RunningJobInfo): Promise<BoundedContext> {
    const agentName = jobInfo.acceptArguments.name || '';
    const metadata = this.parseMetadata(jobInfo.job.metadata);

    // Determine target agent
    const targetAgentId = metadata.agentId || this.resolveAgentId(agentName);

    // Find context for agent
    let contextId = this.agentToContext.get(targetAgentId);

    if (!contextId) {
      if (this.config.enableDynamicContexts) {
        // Create dynamic context for marketplace agent
        contextId = await this.createDynamicContext(targetAgentId, metadata);
      } else {
        contextId = this.config.defaultContextId;
      }
    }

    const context = this.contexts.get(contextId);
    if (!context) {
      throw new ContextNotFoundError(contextId);
    }

    log.info({ agentId: targetAgentId, contextId }, 'Job routed');
    return context;
  }

  /**
   * Handle cross-context handoff
   */
  async handleHandoff(
    fromContext: BoundedContext,
    fromSessionId: string,
    toAgentId: string,
    handoffData: HandoffData
  ): Promise<{ toContext: BoundedContext; toSessionId: string }> {
    if (!this.config.handoff.crossContextHandoffs) {
      throw new HandoffNotAllowedError('Cross-context handoffs disabled');
    }

    const toContextId = this.agentToContext.get(toAgentId);
    if (!toContextId) {
      throw new AgentNotFoundError(toAgentId);
    }

    const toContext = this.contexts.get(toContextId);
    if (!toContext) {
      throw new ContextNotFoundError(toContextId);
    }

    // If same context, internal handoff
    if (fromContext.id === toContext.id) {
      return this.internalHandoff(fromContext, fromSessionId, toAgentId, handoffData);
    }

    // Cross-context handoff: serialize state and transfer
    const serializedState = await fromContext.serializeSession(fromSessionId);

    const toSessionId = await toContext.createSession({
      agentId: toAgentId,
      userId: handoffData.userId,
      resumeFrom: serializedState,
      handoffContext: handoffData,
    });

    // Release from source context
    fromContext.releaseWorker(fromSessionId);

    log.info({
      fromContext: fromContext.id,
      toContext: toContext.id,
      toAgent: toAgentId,
    }, 'Cross-context handoff completed');

    return { toContext, toSessionId };
  }

  /**
   * Dynamically create a context for a marketplace agent
   */
  private async createDynamicContext(agentId: string, metadata: JobMetadata): Promise<string> {
    const contextId = `dynamic-${agentId}`;

    // Load agent manifest from marketplace registry
    const manifest = await this.loadMarketplaceManifest(agentId);

    const config: BoundedContextConfig = {
      id: contextId,
      agentIds: [agentId],
      resources: this.getResourceQuotaForTier(manifest.tier),
      allowedToolDomains: manifest.tools?.domains || ['*'],
      forbiddenTools: manifest.tools?.forbidden || [],
      services: this.getDefaultServiceEndpoints(),
      tenant: metadata.tenant,
      scaling: {
        minWorkers: 0,  // Dynamic contexts scale to zero
        maxWorkers: manifest.maxWorkers || 3,
        targetSessionsPerWorker: 5,
        scaleUpThreshold: 0.7,
        scaleDownThreshold: 0.2,
        scalingCooldownMs: 30_000,
      },
    };

    const context = new BoundedContext(config, log);
    await context.initialize();

    this.registerContext(context);

    return contextId;
  }

  private getResourceQuotaForTier(tier: string): ResourceQuota {
    const quotas: Record<string, ResourceQuota> = {
      free: {
        maxMemoryBytes: 512 * 1024 * 1024,  // 512MB
        maxCpuCores: 0.5,
        maxConcurrentSessions: 2,
        maxRequestsPerMinute: 60,
        maxToolExecutionsPerMinute: 30,
      },
      pro: {
        maxMemoryBytes: 2 * 1024 * 1024 * 1024,  // 2GB
        maxCpuCores: 2,
        maxConcurrentSessions: 10,
        maxRequestsPerMinute: 300,
        maxToolExecutionsPerMinute: 150,
      },
      enterprise: {
        maxMemoryBytes: 8 * 1024 * 1024 * 1024,  // 8GB
        maxCpuCores: 4,
        maxConcurrentSessions: 50,
        maxRequestsPerMinute: 1000,
        maxToolExecutionsPerMinute: 500,
      },
    };

    return quotas[tier] || quotas.free;
  }
}
```

### 2.5 Marketplace Agent Registry

```typescript
// src/runtime/marketplace/agent-registry.ts

import type { BoundedContextConfig } from '../context/bounded-context';

export interface MarketplaceAgent {
  /** Unique agent ID */
  id: string;

  /** Display name */
  name: string;

  /** Publisher/creator */
  publisher: {
    id: string;
    name: string;
    verified: boolean;
  };

  /** Agent tier (affects resource quotas) */
  tier: 'free' | 'pro' | 'enterprise';

  /** Categories and tags */
  categories: string[];
  tags: string[];

  /** Capability manifest */
  capabilities: AgentCapabilities;

  /** Tool configuration */
  tools: {
    domains: string[];
    required: string[];
    forbidden: string[];
  };

  /** Voice configuration */
  voice: {
    provider: 'cartesia' | 'elevenlabs' | 'openai';
    voiceId: string;
    settings?: Record<string, unknown>;
  };

  /** Handoff configuration */
  handoff: {
    canHandoff: boolean;
    targets: string[];  // Agent IDs or '*' for any
    triggers: string[];
  };

  /** Pricing */
  pricing: {
    model: 'free' | 'per_minute' | 'subscription';
    pricePerMinute?: number;
    subscriptionTiers?: SubscriptionTier[];
  };

  /** Runtime requirements */
  runtime: {
    minWorkers: number;
    maxWorkers: number;
    maxConcurrentSessions: number;
    requiredMemoryMb: number;
  };
}

export interface AgentCapabilities {
  /** Core capabilities */
  core: string[];  // e.g., ['conversation', 'tool_use', 'memory']

  /** Domain expertise */
  domains: string[];  // e.g., ['finance', 'wellness', 'productivity']

  /** Languages supported */
  languages: string[];

  /** Accessibility features */
  accessibility: string[];
}

export class MarketplaceAgentRegistry {
  private agents: Map<string, MarketplaceAgent> = new Map();
  private indexByPublisher: Map<string, Set<string>> = new Map();
  private indexByCategory: Map<string, Set<string>> = new Map();

  /**
   * Register a marketplace agent
   */
  async register(agent: MarketplaceAgent): Promise<void> {
    // Validate agent manifest
    await this.validateAgent(agent);

    // Store agent
    this.agents.set(agent.id, agent);

    // Update indexes
    this.indexByPublisher.get(agent.publisher.id)?.add(agent.id) ||
      this.indexByPublisher.set(agent.publisher.id, new Set([agent.id]));

    for (const category of agent.categories) {
      this.indexByCategory.get(category)?.add(agent.id) ||
        this.indexByCategory.set(category, new Set([agent.id]));
    }
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId: string): Promise<MarketplaceAgent | null> {
    return this.agents.get(agentId) || null;
  }

  /**
   * Search agents
   */
  async searchAgents(query: AgentSearchQuery): Promise<MarketplaceAgent[]> {
    let results = Array.from(this.agents.values());

    if (query.category) {
      const categoryAgents = this.indexByCategory.get(query.category);
      if (categoryAgents) {
        results = results.filter(a => categoryAgents.has(a.id));
      }
    }

    if (query.publisher) {
      const publisherAgents = this.indexByPublisher.get(query.publisher);
      if (publisherAgents) {
        results = results.filter(a => publisherAgents.has(a.id));
      }
    }

    if (query.tier) {
      results = results.filter(a => a.tier === query.tier);
    }

    if (query.domain) {
      results = results.filter(a => a.capabilities.domains.includes(query.domain));
    }

    if (query.text) {
      const searchLower = query.text.toLowerCase();
      results = results.filter(a =>
        a.name.toLowerCase().includes(searchLower) ||
        a.tags.some(t => t.toLowerCase().includes(searchLower))
      );
    }

    return results;
  }

  /**
   * Convert agent to bounded context config
   */
  toBoundedContextConfig(agent: MarketplaceAgent): BoundedContextConfig {
    return {
      id: `marketplace-${agent.id}`,
      agentIds: [agent.id],
      resources: {
        maxMemoryBytes: agent.runtime.requiredMemoryMb * 1024 * 1024,
        maxCpuCores: this.getCpuForTier(agent.tier),
        maxConcurrentSessions: agent.runtime.maxConcurrentSessions,
        maxRequestsPerMinute: this.getRpmForTier(agent.tier),
        maxToolExecutionsPerMinute: this.getToolRpmForTier(agent.tier),
      },
      allowedToolDomains: agent.tools.domains,
      forbiddenTools: agent.tools.forbidden,
      services: this.getDefaultServices(),
      tenant: undefined,  // Set by caller if multi-tenant
      scaling: {
        minWorkers: agent.runtime.minWorkers,
        maxWorkers: agent.runtime.maxWorkers,
        targetSessionsPerWorker: 5,
        scaleUpThreshold: 0.7,
        scaleDownThreshold: 0.2,
        scalingCooldownMs: 30_000,
      },
    };
  }

  private async validateAgent(agent: MarketplaceAgent): Promise<void> {
    // Validate required fields
    if (!agent.id || !agent.name || !agent.publisher) {
      throw new InvalidAgentError('Missing required fields');
    }

    // Validate tool domains exist
    for (const domain of agent.tools.domains) {
      if (!await this.toolRegistry.domainExists(domain)) {
        throw new InvalidAgentError(`Unknown tool domain: ${domain}`);
      }
    }

    // Validate voice configuration
    if (!await this.voiceRegistry.voiceExists(agent.voice.provider, agent.voice.voiceId)) {
      throw new InvalidAgentError(`Unknown voice: ${agent.voice.provider}/${agent.voice.voiceId}`);
    }

    // Validate handoff targets
    for (const target of agent.handoff.targets) {
      if (target !== '*' && target !== '@coordinator' && !this.agents.has(target)) {
        throw new InvalidAgentError(`Unknown handoff target: ${target}`);
      }
    }
  }

  private getCpuForTier(tier: string): number {
    return { free: 0.5, pro: 2, enterprise: 4 }[tier] || 0.5;
  }

  private getRpmForTier(tier: string): number {
    return { free: 60, pro: 300, enterprise: 1000 }[tier] || 60;
  }

  private getToolRpmForTier(tier: string): number {
    return { free: 30, pro: 150, enterprise: 500 }[tier] || 30;
  }
}
```

### 2.6 Service Discovery

```typescript
// src/runtime/discovery/service-discovery.ts

export interface ServiceEndpoint {
  name: string;
  url: string;
  protocol: 'grpc' | 'http' | 'ws';
  health: ServiceHealth;
  metadata: Record<string, string>;
}

export interface ServiceDiscovery {
  /** Register a service */
  register(endpoint: ServiceEndpoint): Promise<void>;

  /** Deregister a service */
  deregister(name: string): Promise<void>;

  /** Discover services by name */
  discover(name: string): Promise<ServiceEndpoint[]>;

  /** Watch for service changes */
  watch(name: string, callback: (endpoints: ServiceEndpoint[]) => void): () => void;
}

/**
 * Simple in-memory service discovery for single-node deployments
 */
export class LocalServiceDiscovery implements ServiceDiscovery {
  private services: Map<string, ServiceEndpoint[]> = new Map();
  private watchers: Map<string, Set<(endpoints: ServiceEndpoint[]) => void>> = new Map();

  async register(endpoint: ServiceEndpoint): Promise<void> {
    const endpoints = this.services.get(endpoint.name) || [];
    endpoints.push(endpoint);
    this.services.set(endpoint.name, endpoints);
    this.notifyWatchers(endpoint.name);
  }

  async deregister(name: string): Promise<void> {
    this.services.delete(name);
    this.notifyWatchers(name);
  }

  async discover(name: string): Promise<ServiceEndpoint[]> {
    return this.services.get(name) || [];
  }

  watch(name: string, callback: (endpoints: ServiceEndpoint[]) => void): () => void {
    const watchers = this.watchers.get(name) || new Set();
    watchers.add(callback);
    this.watchers.set(name, watchers);

    return () => watchers.delete(callback);
  }

  private notifyWatchers(name: string): void {
    const endpoints = this.services.get(name) || [];
    const watchers = this.watchers.get(name);
    if (watchers) {
      for (const callback of watchers) {
        callback(endpoints);
      }
    }
  }
}

/**
 * Kubernetes-based service discovery using DNS
 */
export class KubernetesServiceDiscovery implements ServiceDiscovery {
  private namespace: string;
  private cache: Map<string, { endpoints: ServiceEndpoint[]; expiresAt: number }> = new Map();
  private ttlMs: number = 30_000;

  constructor(namespace: string = 'ferni') {
    this.namespace = namespace;
  }

  async discover(name: string): Promise<ServiceEndpoint[]> {
    // Check cache
    const cached = this.cache.get(name);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.endpoints;
    }

    // DNS lookup in Kubernetes
    const hostname = `${name}.${this.namespace}.svc.cluster.local`;

    try {
      const { Resolver } = await import('node:dns/promises');
      const resolver = new Resolver();
      const addresses = await resolver.resolve4(hostname);

      const endpoints: ServiceEndpoint[] = addresses.map(addr => ({
        name,
        url: `http://${addr}:50051`,
        protocol: 'grpc',
        health: 'healthy',
        metadata: { source: 'k8s-dns' },
      }));

      this.cache.set(name, { endpoints, expiresAt: Date.now() + this.ttlMs });
      return endpoints;
    } catch (error) {
      return [];
    }
  }

  // ... other methods
}

/**
 * Consul-based service discovery
 */
export class ConsulServiceDiscovery implements ServiceDiscovery {
  private consulUrl: string;

  constructor(consulUrl: string = 'http://localhost:8500') {
    this.consulUrl = consulUrl;
  }

  async register(endpoint: ServiceEndpoint): Promise<void> {
    await fetch(`${this.consulUrl}/v1/agent/service/register`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ID: `${endpoint.name}-${crypto.randomUUID().slice(0, 8)}`,
        Name: endpoint.name,
        Address: new URL(endpoint.url).hostname,
        Port: parseInt(new URL(endpoint.url).port),
        Tags: Object.entries(endpoint.metadata).map(([k, v]) => `${k}=${v}`),
        Check: {
          GRPC: endpoint.url,
          Interval: '10s',
        },
      }),
    });
  }

  async discover(name: string): Promise<ServiceEndpoint[]> {
    const response = await fetch(
      `${this.consulUrl}/v1/health/service/${name}?passing=true`
    );
    const services = await response.json();

    return services.map((s: any) => ({
      name,
      url: `http://${s.Service.Address}:${s.Service.Port}`,
      protocol: 'grpc',
      health: 'healthy',
      metadata: Object.fromEntries(
        s.Service.Tags.map((t: string) => t.split('='))
      ),
    }));
  }

  // ... other methods
}
```

---

## Part 3: Deployment Architecture

### 3.1 Kubernetes Deployment

```yaml
# k8s/ferni-runtime/base/tool-service.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tool-service
  namespace: ferni
spec:
  replicas: 3
  selector:
    matchLabels:
      app: tool-service
  template:
    metadata:
      labels:
        app: tool-service
    spec:
      containers:
        - name: tool-service
          image: gcr.io/ferni/tool-service:latest
          ports:
            - containerPort: 50051
              protocol: TCP
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "2Gi"
              cpu: "2000m"
          livenessProbe:
            grpc:
              port: 50051
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            grpc:
              port: 50051
            initialDelaySeconds: 5
            periodSeconds: 5
          env:
            - name: FIRESTORE_PROJECT
              valueFrom:
                secretKeyRef:
                  name: gcp-credentials
                  key: project_id
---
apiVersion: v1
kind: Service
metadata:
  name: tool-service
  namespace: ferni
spec:
  selector:
    app: tool-service
  ports:
    - port: 50051
      targetPort: 50051
      protocol: TCP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: tool-service-hpa
  namespace: ferni
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: tool-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

```yaml
# k8s/ferni-runtime/base/agent-runtime.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-runtime
  namespace: ferni
spec:
  replicas: 2
  selector:
    matchLabels:
      app: agent-runtime
  template:
    metadata:
      labels:
        app: agent-runtime
    spec:
      containers:
        - name: agent-runtime
          image: gcr.io/ferni/agent-runtime:latest
          ports:
            - containerPort: 8080  # Health
              protocol: TCP
          resources:
            requests:
              memory: "4Gi"
              cpu: "2000m"
            limits:
              memory: "8Gi"
              cpu: "4000m"
          env:
            - name: TOOL_SERVICE_URL
              value: "tool-service.ferni.svc.cluster.local:50051"
            - name: MEMORY_SERVICE_URL
              value: "memory-service.ferni.svc.cluster.local:50052"
            - name: LIVEKIT_URL
              valueFrom:
                secretKeyRef:
                  name: livekit-credentials
                  key: url
          volumeMounts:
            - name: agent-bundles
              mountPath: /app/bundles
              readOnly: true
      volumes:
        - name: agent-bundles
          configMap:
            name: agent-bundles
```

### 3.2 Cloud Run Deployment (Current)

```yaml
# cloudbuild-runtime.yaml
steps:
  # Build tool service
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/tool-service:$COMMIT_SHA', '-f', 'Dockerfile.tool-service', '.']

  # Build agent runtime
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/agent-runtime:$COMMIT_SHA', '-f', 'Dockerfile.agent-runtime', '.']

  # Push images
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/tool-service:$COMMIT_SHA']

  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/agent-runtime:$COMMIT_SHA']

  # Deploy tool service
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: 'gcloud'
    args:
      - 'run'
      - 'deploy'
      - 'tool-service'
      - '--image=gcr.io/$PROJECT_ID/tool-service:$COMMIT_SHA'
      - '--region=us-central1'
      - '--min-instances=1'
      - '--max-instances=10'
      - '--memory=2Gi'
      - '--cpu=2'
      - '--use-http2'

  # Deploy agent runtime
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: 'gcloud'
    args:
      - 'run'
      - 'deploy'
      - 'agent-runtime'
      - '--image=gcr.io/$PROJECT_ID/agent-runtime:$COMMIT_SHA'
      - '--region=us-central1'
      - '--min-instances=1'
      - '--max-instances=50'
      - '--memory=8Gi'
      - '--cpu=4'
      - '--timeout=3600'
      - '--set-env-vars=TOOL_SERVICE_URL=https://tool-service-xxx.run.app'
```

---

## Summary

| Component | Purpose | Scale Strategy |
|-----------|---------|----------------|
| **Tool Service** | Stateless tool execution | Horizontal (replicas) |
| **Memory Service** | User memory/embeddings | Horizontal + sharding |
| **Persona Service** | Agent context/prompts | Horizontal + caching |
| **Agent Runtime** | Voice session orchestration | Horizontal (per-agent contexts) |
| **Bounded Contexts** | Agent isolation | 1 context per agent/tenant |
| **Agent Router** | Job routing + handoffs | Stateless, co-located with runtime |

This architecture allows you to:
1. **Scale tools independently** - Add 100 tools without affecting voice workers
2. **Scale agents independently** - Add 100 agents with isolated resource quotas
3. **Multi-tenancy** - Each tenant gets isolated bounded contexts
4. **Graceful handoffs** - Cross-context handoffs with state serialization
5. **Marketplace** - Dynamic context creation for new agents
