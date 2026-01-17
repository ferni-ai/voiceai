# Phase 1: Read-Only Custom Tools

> **Timeline:** 2-3 weeks  
> **Risk Level:** Low  
> **Dependencies:** Phase 0 complete

## Goals

1. Enable agents to define read-only custom tools
2. Load and validate tool definitions from bundles
3. Execute simple API calls (no credentials yet)
4. Establish tool execution pipeline
5. Add basic audit logging

---

## Scope Limitations

**In Scope:**
- Read-only tools (GET requests, no side effects)
- Public APIs (no authentication required)
- Market data, quotes, public information
- Basic rate limiting

**Out of Scope:**
- OAuth/credential management (Phase 3)
- Write operations (Phase 2)
- Confirmation flows (Phase 2)
- User permission UI (Phase 3)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Agent Runtime                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  LLM calls tool: get_stock_quote({ symbol })    │   │
│  └─────────────────────────────────────────────────┘   │
│                          │                              │
│                          ▼                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Tool Registry                       │   │
│  │  - Finds tool definition from bundle            │   │
│  │  - Returns wrapped tool function                │   │
│  └─────────────────────────────────────────────────┘   │
│                          │                              │
│                          ▼                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │           Custom Tool Executor                   │   │
│  │  1. Validate parameters                         │   │
│  │  2. Check rate limits                           │   │
│  │  3. Execute HTTP request                        │   │
│  │  4. Parse response                              │   │
│  │  5. Log execution                               │   │
│  └─────────────────────────────────────────────────┘   │
│                          │                              │
│                          ▼                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │              External API                        │   │
│  │  (e.g., Alpha Vantage, Yahoo Finance)           │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation

### 1. Bundle Loader Extension

**File:** `src/personas/bundles/loader.ts`

```typescript
// Add to existing loadBundle function

import { loadCustomTools } from '../../tools/custom/loader.js';
import type { CustomToolManifest } from '../../tools/custom/types.js';

// Inside loadBundle():
async function loadBundle(bundlePath: string, options: BundleLoadOptions): Promise<LoadedPersonaBundle> {
  // ... existing code ...
  
  // NEW: Load custom tools if present
  let customTools: CustomToolManifest | null = null;
  const toolsManifestPath = join(bundlePath, 'tools', '_manifest.json');
  
  if (await fileExists(toolsManifestPath)) {
    try {
      customTools = await loadCustomTools(bundlePath);
      getLogger().debug({ bundlePath, toolCount: customTools.tools.length }, 'Loaded custom tools');
    } catch (err) {
      getLogger().warn({ bundlePath, error: err }, 'Failed to load custom tools');
    }
  }
  
  // Add to bundle
  const bundle: LoadedPersonaBundle = {
    // ... existing fields ...
    customTools,
  };
  
  return bundle;
}
```

### 2. Custom Tool Loader

**File:** `src/tools/custom/loader.ts`

```typescript
/**
 * Custom Tool Loader
 * 
 * Loads and validates custom tool definitions from agent bundles.
 */

import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { getLogger } from '../../utils/safe-logger.js';
import { validateToolManifest } from './validation.js';
import type { CustomToolManifest, CustomToolDefinition } from './types.js';

/**
 * Load custom tools from an agent bundle
 */
export async function loadCustomTools(bundlePath: string): Promise<CustomToolManifest> {
  const toolsPath = join(bundlePath, 'tools');
  const manifestPath = join(toolsPath, '_manifest.json');
  
  // Load manifest
  const manifestContent = await readFile(manifestPath, 'utf-8');
  const manifest = JSON.parse(manifestContent) as CustomToolManifest;
  
  // Validate
  const validation = validateToolManifest(manifest);
  if (!validation.valid) {
    throw new Error(
      `Invalid tool manifest at ${manifestPath}: ${validation.errors.map(e => e.message).join(', ')}`
    );
  }
  
  // Load individual tool schemas if they exist in separate files
  const tools: CustomToolDefinition[] = [];
  
  for (const toolDef of manifest.tools) {
    // Check if there's a separate schema file
    const schemaPath = join(toolsPath, 'schemas', `${toolDef.id}.json`);
    try {
      const schemaContent = await readFile(schemaPath, 'utf-8');
      const schema = JSON.parse(schemaContent);
      tools.push({ ...toolDef, ...schema });
    } catch {
      // No separate file, use inline definition
      tools.push(toolDef);
    }
  }
  
  // Load prompts (guidance for LLM on how to use tools)
  for (const tool of tools) {
    const promptPath = join(toolsPath, 'prompts', `${tool.id}.md`);
    try {
      const promptContent = await readFile(promptPath, 'utf-8');
      (tool as any)._prompt = promptContent;
    } catch {
      // No prompt file
    }
  }
  
  getLogger().info(
    { bundlePath, toolCount: tools.length, toolIds: tools.map(t => t.id) },
    'Loaded custom tools from bundle'
  );
  
  return { version: manifest.version, tools };
}

/**
 * Discover all bundles with custom tools
 */
export async function discoverBundlesWithTools(): Promise<string[]> {
  const bundleIds: string[] = [];
  // ... implementation similar to discoverBundles but filtering for tools/
  return bundleIds;
}
```

### 3. Custom Tool Executor

**File:** `src/tools/custom/executor.ts`

```typescript
/**
 * Custom Tool Executor
 * 
 * Executes custom tool definitions against external APIs.
 * Phase 1: Read-only tools, no authentication.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { validateParameters } from './validation.js';
import { checkRateLimit, incrementRateLimit } from './rate-limiter.js';
import { logToolExecution } from './audit-logger.js';
import type {
  CustomToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from './types.js';

/**
 * Execute a custom tool
 */
export async function executeCustomTool(
  tool: CustomToolDefinition,
  parameters: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  const logger = getLogger();
  
  logger.debug({ toolId: tool.id, parameters }, 'Executing custom tool');
  
  try {
    // 1. Validate parameters against schema
    const paramValidation = validateParameters(tool.parameters, parameters);
    if (!paramValidation.valid) {
      return {
        success: false,
        error: {
          code: 'INVALID_PARAMETERS',
          message: paramValidation.errors.map(e => e.message).join(', '),
          details: paramValidation.errors,
        },
        execution_time_ms: Date.now() - startTime,
      };
    }
    
    // 2. Check rate limits
    const rateLimitCheck = await checkRateLimit(context.userId, tool.id, tool.rate_limits);
    if (!rateLimitCheck.allowed) {
      return {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: `Rate limit exceeded. Try again in ${rateLimitCheck.retry_after_seconds}s`,
        },
        execution_time_ms: Date.now() - startTime,
      };
    }
    
    // 3. Execute based on implementation type
    let result: unknown;
    
    switch (tool.implementation.type) {
      case 'webhook':
      case 'rest_api':
        result = await executeHttpRequest(tool, parameters);
        break;
        
      case 'platform_handler':
        result = await executePlatformHandler(tool, parameters, context);
        break;
        
      default:
        throw new Error(`Unsupported implementation type: ${tool.implementation.type}`);
    }
    
    // 4. Increment rate limit counter
    await incrementRateLimit(context.userId, tool.id);
    
    // 5. Log execution
    const executionTimeMs = Date.now() - startTime;
    await logToolExecution({
      userId: context.userId,
      agentId: context.agentId,
      toolId: tool.id,
      parameters,
      result: { success: true, data: result },
      executionTimeMs,
      context,
    });
    
    return {
      success: true,
      data: result,
      execution_time_ms: executionTimeMs,
    };
    
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logger.error({ toolId: tool.id, error, executionTimeMs }, 'Custom tool execution failed');
    
    // Log failure
    await logToolExecution({
      userId: context.userId,
      agentId: context.agentId,
      toolId: tool.id,
      parameters,
      result: {
        success: false,
        error: { code: 'EXECUTION_ERROR', message: errorMessage },
      },
      executionTimeMs,
      context,
    });
    
    return {
      success: false,
      error: {
        code: 'EXECUTION_ERROR',
        message: errorMessage,
      },
      execution_time_ms: executionTimeMs,
    };
  }
}

/**
 * Execute HTTP request for webhook/REST API tools
 */
async function executeHttpRequest(
  tool: CustomToolDefinition,
  parameters: Record<string, unknown>
): Promise<unknown> {
  const { url, method = 'GET', headers = {}, timeout_ms = 30000 } = tool.implementation;
  
  if (!url) {
    throw new Error('Tool implementation missing URL');
  }
  
  // Build request URL (substitute parameters)
  const finalUrl = substituteUrlParams(url, parameters);
  
  // Build request body for POST/PUT
  const body = method !== 'GET' ? JSON.stringify(parameters) : undefined;
  
  // Execute request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout_ms);
  
  try {
    const response = await fetch(finalUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body,
      signal: controller.signal,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
    
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Execute platform handler (built-in handlers)
 */
async function executePlatformHandler(
  tool: CustomToolDefinition,
  parameters: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<unknown> {
  const handlerName = tool.implementation.handler;
  
  if (!handlerName) {
    throw new Error('Platform handler not specified');
  }
  
  // Get handler from registry
  const handler = platformHandlers.get(handlerName);
  if (!handler) {
    throw new Error(`Unknown platform handler: ${handlerName}`);
  }
  
  return handler(parameters, context);
}

/**
 * Substitute URL parameters (e.g., /quote/{symbol} -> /quote/AAPL)
 */
function substituteUrlParams(url: string, params: Record<string, unknown>): string {
  let result = url;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`{${key}}`, encodeURIComponent(String(value)));
  }
  return result;
}

// Platform handlers registry
const platformHandlers = new Map<string, Function>();

export function registerPlatformHandler(name: string, handler: Function): void {
  platformHandlers.set(name, handler);
}
```

### 4. Rate Limiter

**File:** `src/tools/custom/rate-limiter.ts`

```typescript
/**
 * Rate Limiter for Custom Tools
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { RateLimitConfig } from './types.js';

interface RateLimitCheckResult {
  allowed: boolean;
  retry_after_seconds?: number;
}

const db = getFirestore();

export async function checkRateLimit(
  userId: string,
  toolId: string,
  limits?: RateLimitConfig
): Promise<RateLimitCheckResult> {
  if (!limits) {
    return { allowed: true };
  }
  
  const now = Date.now();
  
  // Check minute limit
  if (limits.per_minute) {
    const minuteKey = `${userId}_${toolId}_minute`;
    const minuteCount = await getWindowCount(minuteKey, 60 * 1000, now);
    if (minuteCount >= limits.per_minute) {
      return { allowed: false, retry_after_seconds: 60 };
    }
  }
  
  // Check hour limit
  if (limits.per_hour) {
    const hourKey = `${userId}_${toolId}_hour`;
    const hourCount = await getWindowCount(hourKey, 60 * 60 * 1000, now);
    if (hourCount >= limits.per_hour) {
      return { allowed: false, retry_after_seconds: 3600 };
    }
  }
  
  // Check day limit
  if (limits.per_day) {
    const dayKey = `${userId}_${toolId}_day`;
    const dayCount = await getWindowCount(dayKey, 24 * 60 * 60 * 1000, now);
    if (dayCount >= limits.per_day) {
      return { allowed: false, retry_after_seconds: 86400 };
    }
  }
  
  return { allowed: true };
}

export async function incrementRateLimit(userId: string, toolId: string): Promise<void> {
  const now = Date.now();
  
  // Increment all windows
  await Promise.all([
    incrementWindow(`${userId}_${toolId}_minute`, 60 * 1000, now),
    incrementWindow(`${userId}_${toolId}_hour`, 60 * 60 * 1000, now),
    incrementWindow(`${userId}_${toolId}_day`, 24 * 60 * 60 * 1000, now),
  ]);
}

async function getWindowCount(key: string, windowMs: number, now: number): Promise<number> {
  const doc = await db.collection('rate_limit_counters').doc(key).get();
  
  if (!doc.exists) {
    return 0;
  }
  
  const data = doc.data()!;
  const windowEnd = data.window_end?.toMillis() || 0;
  
  if (now > windowEnd) {
    return 0; // Window expired
  }
  
  return data.count || 0;
}

async function incrementWindow(key: string, windowMs: number, now: number): Promise<void> {
  const docRef = db.collection('rate_limit_counters').doc(key);
  
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(docRef);
    
    if (!doc.exists || now > (doc.data()?.window_end?.toMillis() || 0)) {
      // Start new window
      tx.set(docRef, {
        count: 1,
        window_start: Timestamp.fromMillis(now),
        window_end: Timestamp.fromMillis(now + windowMs),
      });
    } else {
      // Increment existing window
      tx.update(docRef, {
        count: (doc.data()?.count || 0) + 1,
      });
    }
  });
}
```

### 5. Audit Logger

**File:** `src/tools/custom/audit-logger.ts`

```typescript
/**
 * Audit Logger for Custom Tools
 */

import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getLogger } from '../../utils/safe-logger.js';
import type { ToolExecutionContext } from './types.js';

interface AuditLogEntry {
  userId: string;
  agentId: string;
  toolId: string;
  integrationId?: string;
  parameters: Record<string, unknown>;
  result: {
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  };
  executionTimeMs: number;
  context: ToolExecutionContext;
  confirmation?: {
    required: boolean;
    method?: string;
    promptedAt?: Date;
    confirmedAt?: Date;
  };
}

const db = getFirestore();

export async function logToolExecution(entry: AuditLogEntry): Promise<string> {
  const logger = getLogger();
  
  try {
    const doc = await db.collection('tool_audit_logs').add({
      user_id: entry.userId,
      agent_id: entry.agentId,
      tool_id: entry.toolId,
      integration_id: entry.integrationId || null,
      
      timestamp: FieldValue.serverTimestamp(),
      
      request: {
        parameters: sanitizeForLogging(entry.parameters),
        session_id: entry.context.sessionId,
        conversation_id: entry.context.conversationId || null,
        request_id: entry.context.requestId,
      },
      
      confirmation: entry.confirmation ? {
        required: entry.confirmation.required,
        method: entry.confirmation.method || null,
        prompted_at: entry.confirmation.promptedAt ? Timestamp.fromDate(entry.confirmation.promptedAt) : null,
        confirmed_at: entry.confirmation.confirmedAt ? Timestamp.fromDate(entry.confirmation.confirmedAt) : null,
      } : null,
      
      response: {
        success: entry.result.success,
        data: entry.result.success ? sanitizeForLogging(entry.result.data) : null,
        error_code: entry.result.error?.code || null,
        error_message: entry.result.error?.message || null,
        execution_time_ms: entry.executionTimeMs,
      },
    });
    
    logger.debug({ docId: doc.id, toolId: entry.toolId }, 'Tool execution logged');
    return doc.id;
    
  } catch (err) {
    logger.error({ error: err, toolId: entry.toolId }, 'Failed to log tool execution');
    throw err;
  }
}

/**
 * Sanitize data for logging (remove sensitive fields)
 */
function sanitizeForLogging(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }
  
  if (typeof data !== 'object') {
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(sanitizeForLogging);
  }
  
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    // Redact sensitive fields
    if (isSensitiveField(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitizeForLogging(value);
    }
  }
  return result;
}

const SENSITIVE_FIELDS = new Set([
  'password',
  'secret',
  'token',
  'api_key',
  'apiKey',
  'access_token',
  'refresh_token',
  'ssn',
  'social_security',
  'credit_card',
  'card_number',
]);

function isSensitiveField(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_FIELDS.has(lowerKey) || 
         lowerKey.includes('password') ||
         lowerKey.includes('secret') ||
         lowerKey.includes('token');
}
```

### 6. Tool Registry Integration

**File:** `src/tools/builder.ts` (modifications)

```typescript
// Add imports
import { executeCustomTool } from './custom/executor.js';
import type { CustomToolDefinition, ToolExecutionContext } from './custom/types.js';

// Add to buildAgentTools function:

export async function buildAgentTools(
  agentId: string,
  options: BuildToolsOptions = {}
): Promise<Record<string, Tool>> {
  // ... existing code ...
  
  // NEW: Load custom tools from bundle
  const bundle = await loadBundleById(agentId);
  
  if (bundle?.customTools?.tools) {
    for (const customTool of bundle.customTools.tools) {
      // Only load read-only tools in Phase 1
      if (isReadOnlyTool(customTool)) {
        const wrappedTool = wrapCustomTool(customTool, ctx);
        tools[customTool.id] = wrappedTool;
        getLogger().debug({ toolId: customTool.id, agentId }, 'Added custom tool');
      }
    }
  }
  
  return tools;
}

/**
 * Check if a tool is read-only (Phase 1 only)
 */
function isReadOnlyTool(tool: CustomToolDefinition): boolean {
  // Read-only if:
  // 1. No risk or low risk
  // 2. No confirmation required
  // 3. HTTP GET method (or no side effects)
  
  if (tool.risk_level === 'high' || tool.risk_level === 'critical') {
    return false;
  }
  
  if (tool.confirmation?.required) {
    return false;
  }
  
  if (tool.implementation.type === 'webhook' || tool.implementation.type === 'rest_api') {
    return tool.implementation.method === 'GET' || !tool.implementation.method;
  }
  
  return true;
}

/**
 * Wrap a custom tool definition as an LLM-callable tool
 */
function wrapCustomTool(
  customTool: CustomToolDefinition,
  ctx: ToolContext
): Tool {
  return {
    name: customTool.id,
    description: customTool.description,
    parameters: z.object(
      convertJsonSchemaToZod(customTool.parameters)
    ),
    execute: async (params) => {
      const executionContext: ToolExecutionContext = {
        userId: ctx.userId,
        agentId: ctx.agentId,
        sessionId: ctx.sessionId || 'unknown',
        requestId: generateRequestId(),
        timestamp: new Date(),
      };
      
      const result = await executeCustomTool(customTool, params, executionContext);
      
      if (!result.success) {
        return `Error: ${result.error?.message || 'Unknown error'}`;
      }
      
      return formatToolResponse(result.data);
    },
  };
}
```

---

## Example: Stock Quote Tool

**Agent bundle structure:**

```
peter-lynch-picker/
├── persona.manifest.json
├── tools/
│   ├── _manifest.json
│   ├── schemas/
│   │   └── get-stock-quote.json
│   └── prompts/
│       └── get-stock-quote.md
```

**`tools/_manifest.json`:**

```json
{
  "version": "1.0.0",
  "tools": [
    {
      "id": "get-stock-quote",
      "name": "Get Stock Quote",
      "description": "Get the current price and basic info for a stock symbol",
      "category": "trading",
      "risk_level": "none",
      "parameters": {
        "type": "object",
        "properties": {
          "symbol": {
            "type": "string",
            "description": "Stock ticker symbol (e.g., AAPL, GOOGL, MSFT)"
          }
        },
        "required": ["symbol"]
      },
      "implementation": {
        "type": "rest_api",
        "url": "https://api.example.com/v1/quote/{symbol}",
        "method": "GET",
        "timeout_ms": 5000
      },
      "rate_limits": {
        "per_minute": 30,
        "per_hour": 500
      }
    }
  ]
}
```

**`tools/prompts/get-stock-quote.md`:**

```markdown
# How to Use get-stock-quote

Use this tool when the user asks about:
- Current stock price
- What a stock is trading at
- Stock quotes or ticker prices

Always use uppercase for symbols (AAPL not aapl).

After getting the quote, provide context:
- Compare to recent high/low if available
- Mention if market is open/closed
- Note any significant price movement
```

---

## Testing Plan

### Unit Tests

```typescript
// src/tools/custom/__tests__/loader.test.ts
describe('loadCustomTools', () => {
  it('loads valid tool manifest', async () => {
    const tools = await loadCustomTools('./test-fixtures/valid-bundle');
    expect(tools.tools).toHaveLength(1);
    expect(tools.tools[0].id).toBe('get-stock-quote');
  });
  
  it('throws on invalid manifest', async () => {
    await expect(loadCustomTools('./test-fixtures/invalid-bundle'))
      .rejects.toThrow('Invalid tool manifest');
  });
});

// src/tools/custom/__tests__/executor.test.ts
describe('executeCustomTool', () => {
  it('executes GET request successfully', async () => {
    // Mock fetch
    const result = await executeCustomTool(mockTool, { symbol: 'AAPL' }, mockContext);
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('price');
  });
  
  it('respects rate limits', async () => {
    // Exhaust rate limit
    for (let i = 0; i < 30; i++) {
      await executeCustomTool(mockTool, { symbol: 'AAPL' }, mockContext);
    }
    
    const result = await executeCustomTool(mockTool, { symbol: 'AAPL' }, mockContext);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('RATE_LIMITED');
  });
});
```

### Integration Tests

```typescript
// e2e/custom-tools.spec.ts
describe('Custom Tools E2E', () => {
  it('agent can use custom tool in conversation', async () => {
    // Start session with test agent
    const session = await startSession('test-trading-agent');
    
    // Ask about stock
    const response = await session.sendMessage('What is Apple trading at?');
    
    // Verify tool was called and response includes price
    expect(response.toolCalls).toContainEqual(
      expect.objectContaining({ toolId: 'get-stock-quote' })
    );
    expect(response.text).toMatch(/\$\d+\.\d{2}/);
  });
});
```

---

## Acceptance Criteria

- [ ] Tool manifest loads from bundle without errors
- [ ] Invalid manifests are rejected with clear errors
- [ ] Read-only tools execute successfully
- [ ] Rate limiting works correctly
- [ ] Audit logs are created for all executions
- [ ] High-risk tools are NOT loaded (Phase 2)
- [ ] Agent can use custom tools in conversation
- [ ] Error responses are user-friendly

---

## File Structure After Phase 1

```
src/tools/custom/
├── index.ts
├── types.ts
├── loader.ts           # NEW: Load tools from bundles
├── executor.ts         # NEW: Execute custom tools
├── rate-limiter.ts     # NEW: Rate limiting
├── audit-logger.ts     # NEW: Audit logging
├── validation.ts
├── schemas/
│   └── tool-manifest.schema.json
└── __tests__/
    ├── loader.test.ts
    ├── executor.test.ts
    └── rate-limiter.test.ts
```

---

## Estimated Effort

| Task | Hours |
|------|-------|
| Bundle loader extension | 8 |
| Custom tool loader | 12 |
| Executor implementation | 16 |
| Rate limiter | 8 |
| Audit logger | 6 |
| Tool registry integration | 8 |
| Testing | 16 |
| Documentation | 4 |
| **Total** | **78 hours (~2 weeks)** |

