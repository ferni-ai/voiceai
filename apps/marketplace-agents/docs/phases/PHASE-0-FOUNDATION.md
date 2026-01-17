# Phase 0: Foundation & Schema Design

> **Timeline:** 1 week  
> **Risk Level:** Low  
> **Dependencies:** None

## Goals

1. Define the JSON schemas for custom tools
2. Extend existing TypeScript types
3. Design the database schema for permissions/credentials
4. Establish security model documentation
5. Create validation utilities

---

## Deliverables

### 1. Custom Tool Schema (`tool-manifest.schema.json`)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://ferni.ai/schemas/tool-manifest.v1.json",
  "title": "Custom Tool Manifest",
  "type": "object",
  "required": ["version", "tools"],
  "properties": {
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$"
    },
    "tools": {
      "type": "array",
      "items": { "$ref": "#/definitions/ToolDefinition" }
    }
  },
  "definitions": {
    "ToolDefinition": {
      "type": "object",
      "required": ["id", "name", "description", "category", "parameters"],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9-]*$",
          "description": "Unique tool identifier (kebab-case)"
        },
        "name": {
          "type": "string",
          "maxLength": 50,
          "description": "Human-readable tool name"
        },
        "description": {
          "type": "string",
          "maxLength": 500,
          "description": "What the tool does (shown to LLM)"
        },
        "category": {
          "type": "string",
          "enum": ["trading", "banking", "calendar", "communication", "smart-home", "custom"]
        },
        "risk_level": {
          "type": "string",
          "enum": ["none", "low", "medium", "high", "critical"],
          "default": "low"
        },
        "requires": { "$ref": "#/definitions/ToolRequirements" },
        "parameters": { "$ref": "#/definitions/ParameterSchema" },
        "confirmation": { "$ref": "#/definitions/ConfirmationConfig" },
        "implementation": { "$ref": "#/definitions/ImplementationConfig" },
        "response": { "$ref": "#/definitions/ResponseSchema" },
        "rate_limits": { "$ref": "#/definitions/RateLimitConfig" }
      }
    },
    "ToolRequirements": {
      "type": "object",
      "properties": {
        "integration": {
          "type": "string",
          "description": "Required integration (e.g., 'broker', 'calendar')"
        },
        "permissions": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Required permission scopes"
        },
        "user_confirmation": {
          "type": "boolean",
          "default": false
        }
      }
    },
    "ParameterSchema": {
      "type": "object",
      "description": "JSON Schema for tool parameters",
      "properties": {
        "type": { "const": "object" },
        "properties": { "type": "object" },
        "required": { "type": "array", "items": { "type": "string" } }
      }
    },
    "ConfirmationConfig": {
      "type": "object",
      "properties": {
        "required": { "type": "boolean", "default": false },
        "prompt": {
          "type": "string",
          "description": "Confirmation prompt with {param} placeholders"
        },
        "timeout_seconds": { "type": "integer", "default": 30 },
        "method": {
          "type": "string",
          "enum": ["voice", "ui", "both"],
          "default": "voice"
        }
      }
    },
    "ImplementationConfig": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": {
          "type": "string",
          "enum": ["webhook", "rest_api", "graphql", "platform_handler"]
        },
        "url": { "type": "string", "format": "uri" },
        "method": { "type": "string", "enum": ["GET", "POST", "PUT", "DELETE"] },
        "headers": { "type": "object" },
        "timeout_ms": { "type": "integer", "default": 30000 }
      }
    },
    "ResponseSchema": {
      "type": "object",
      "description": "JSON Schema for expected response"
    },
    "RateLimitConfig": {
      "type": "object",
      "properties": {
        "per_minute": { "type": "integer" },
        "per_hour": { "type": "integer" },
        "per_day": { "type": "integer" }
      }
    }
  }
}
```

---

### 2. TypeScript Types

**File:** `src/tools/custom/types.ts`

```typescript
/**
 * Custom Tool Types
 * 
 * Types for agent-defined custom tools loaded from bundles.
 */

// =============================================================================
// TOOL DEFINITION
// =============================================================================

export type ToolCategory = 
  | 'trading' 
  | 'banking' 
  | 'calendar' 
  | 'communication' 
  | 'smart-home' 
  | 'custom';

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type ImplementationType = 'webhook' | 'rest_api' | 'graphql' | 'platform_handler';

export type ConfirmationMethod = 'voice' | 'ui' | 'both';

export interface ToolRequirements {
  /** Required integration (e.g., 'broker', 'calendar') */
  integration?: string;
  /** Required permission scopes */
  permissions?: string[];
  /** Whether user confirmation is required before execution */
  user_confirmation?: boolean;
}

export interface ConfirmationConfig {
  /** Whether confirmation is required */
  required: boolean;
  /** Prompt template with {param} placeholders */
  prompt?: string;
  /** Timeout in seconds (default: 30) */
  timeout_seconds?: number;
  /** Confirmation method */
  method?: ConfirmationMethod;
}

export interface ImplementationConfig {
  /** Implementation type */
  type: ImplementationType;
  /** URL for webhook/API implementations */
  url?: string;
  /** HTTP method */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Additional headers */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds */
  timeout_ms?: number;
  /** Platform handler name (for type: 'platform_handler') */
  handler?: string;
}

export interface RateLimitConfig {
  per_minute?: number;
  per_hour?: number;
  per_day?: number;
}

export interface CustomToolDefinition {
  /** Unique tool identifier (kebab-case) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description for LLM */
  description: string;
  /** Tool category */
  category: ToolCategory;
  /** Risk level */
  risk_level: RiskLevel;
  /** Requirements */
  requires?: ToolRequirements;
  /** Parameter JSON Schema */
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** Confirmation configuration */
  confirmation?: ConfirmationConfig;
  /** Implementation details */
  implementation: ImplementationConfig;
  /** Response JSON Schema */
  response?: {
    type: 'object';
    properties: Record<string, unknown>;
  };
  /** Rate limits */
  rate_limits?: RateLimitConfig;
}

export interface CustomToolManifest {
  version: string;
  tools: CustomToolDefinition[];
}

// =============================================================================
// INTEGRATION DEFINITION
// =============================================================================

export type AuthType = 'oauth2' | 'api_key' | 'basic' | 'custom';

export interface OAuthConfig {
  authorization_url: string;
  token_url: string;
  scopes: string[];
  client_id_env?: string;
  client_secret_env?: string;
}

export interface ApiKeyField {
  key: string;
  label: string;
  type: 'string' | 'secret' | 'boolean' | 'number';
  required?: boolean;
  default?: unknown;
}

export interface IntegrationProvider {
  id: string;
  name: string;
  auth_type: AuthType;
  oauth_config?: OAuthConfig;
  fields?: ApiKeyField[];
  status?: 'available' | 'coming_soon' | 'beta';
}

export interface IntegrationDefinition {
  id: string;
  display_name: string;
  description: string;
  providers: IntegrationProvider[];
}

// =============================================================================
// EXECUTION CONTEXT
// =============================================================================

export interface ToolExecutionContext {
  /** User ID */
  userId: string;
  /** Agent ID */
  agentId: string;
  /** Session ID */
  sessionId: string;
  /** Conversation ID (for audit trail) */
  conversationId?: string;
  /** Request ID (for tracing) */
  requestId: string;
  /** Timestamp */
  timestamp: Date;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  execution_time_ms: number;
  confirmation_used?: boolean;
}

// =============================================================================
// PERMISSIONS
// =============================================================================

export interface PermissionGrant {
  id: string;
  user_id: string;
  agent_id: string;
  integration_id: string;
  tool_id?: string; // null = all tools for integration
  scopes: string[];
  granted_at: Date;
  expires_at?: Date;
  revoked_at?: Date;
}

export interface PermissionCheck {
  user_id: string;
  agent_id: string;
  tool_id: string;
  scope: string;
}

// =============================================================================
// AUDIT LOG
// =============================================================================

export interface ToolAuditLog {
  id: string;
  timestamp: Date;
  user_id: string;
  agent_id: string;
  tool_id: string;
  integration_id?: string;
  
  request: {
    parameters: Record<string, unknown>;
    context: ToolExecutionContext;
  };
  
  confirmation?: {
    required: boolean;
    prompted_at?: Date;
    confirmed_at?: Date;
    method?: ConfirmationMethod;
    timed_out?: boolean;
  };
  
  response: {
    success: boolean;
    data?: unknown;
    error?: {
      code: string;
      message: string;
    };
    execution_time_ms: number;
  };
  
  metadata?: Record<string, unknown>;
}
```

---

### 3. Database Schema

**Firestore Collections:**

```typescript
// Collection: user_integrations
// Document ID: {userId}_{integrationId}
interface UserIntegration {
  user_id: string;
  integration_id: string;           // e.g., 'schwab', 'alpaca'
  provider_id: string;              // e.g., 'broker'
  
  status: 'connected' | 'expired' | 'revoked' | 'error';
  connected_at: Timestamp;
  last_used_at?: Timestamp;
  expires_at?: Timestamp;
  
  // OAuth tokens (encrypted)
  credentials: {
    access_token_encrypted: string;
    refresh_token_encrypted?: string;
    token_type?: string;
    scope?: string;
  };
  
  // Metadata
  account_info?: {
    account_id?: string;
    display_name?: string;
  };
}

// Collection: tool_permissions
// Document ID: {userId}_{agentId}_{toolId}
interface ToolPermission {
  user_id: string;
  agent_id: string;
  tool_id: string;
  
  scopes: string[];
  
  granted_at: Timestamp;
  granted_by: 'user' | 'system';
  expires_at?: Timestamp;
  revoked_at?: Timestamp;
  
  // Limits
  rate_limit_override?: {
    per_minute?: number;
    per_hour?: number;
    per_day?: number;
  };
  
  // Risk controls
  risk_controls?: {
    max_value?: number;
    require_confirmation_above?: number;
    allowed_symbols?: string[];
    blocked_symbols?: string[];
  };
}

// Collection: tool_audit_logs
// Document ID: auto-generated
interface ToolAuditLogDoc {
  user_id: string;
  agent_id: string;
  tool_id: string;
  integration_id?: string;
  
  timestamp: Timestamp;
  
  request: {
    parameters: Record<string, unknown>;
    session_id: string;
    conversation_id?: string;
  };
  
  confirmation?: {
    required: boolean;
    method?: 'voice' | 'ui';
    prompted_at?: Timestamp;
    confirmed_at?: Timestamp;
    timed_out?: boolean;
    cancelled?: boolean;
  };
  
  response: {
    success: boolean;
    data?: Record<string, unknown>;
    error_code?: string;
    error_message?: string;
    execution_time_ms: number;
  };
}

// Collection: rate_limit_counters
// Document ID: {userId}_{toolId}_{window}
interface RateLimitCounter {
  user_id: string;
  tool_id: string;
  window: 'minute' | 'hour' | 'day';
  
  count: number;
  window_start: Timestamp;
  window_end: Timestamp;
}
```

---

### 4. Validation Utilities

**File:** `src/tools/custom/validation.ts`

```typescript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { CustomToolManifest, CustomToolDefinition } from './types.js';
import toolManifestSchema from './schemas/tool-manifest.schema.json';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const validateManifest = ajv.compile(toolManifestSchema);

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
  keyword: string;
}

/**
 * Validate a custom tool manifest
 */
export function validateToolManifest(manifest: unknown): ValidationResult {
  const valid = validateManifest(manifest);
  
  if (valid) {
    // Additional semantic validation
    const semanticErrors = validateSemantics(manifest as CustomToolManifest);
    if (semanticErrors.length > 0) {
      return { valid: false, errors: semanticErrors };
    }
    return { valid: true, errors: [] };
  }
  
  return {
    valid: false,
    errors: (validateManifest.errors || []).map(err => ({
      path: err.instancePath || '/',
      message: err.message || 'Unknown error',
      keyword: err.keyword,
    })),
  };
}

/**
 * Semantic validation beyond JSON Schema
 */
function validateSemantics(manifest: CustomToolManifest): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Check for duplicate tool IDs
  const toolIds = new Set<string>();
  for (const tool of manifest.tools) {
    if (toolIds.has(tool.id)) {
      errors.push({
        path: `/tools/${tool.id}`,
        message: `Duplicate tool ID: ${tool.id}`,
        keyword: 'uniqueItems',
      });
    }
    toolIds.add(tool.id);
  }
  
  // Validate tool-specific rules
  for (const tool of manifest.tools) {
    // High-risk tools MUST have confirmation
    if (tool.risk_level === 'high' || tool.risk_level === 'critical') {
      if (!tool.confirmation?.required) {
        errors.push({
          path: `/tools/${tool.id}/confirmation`,
          message: 'High-risk tools must require confirmation',
          keyword: 'required',
        });
      }
    }
    
    // Webhook implementations must have URL
    if (tool.implementation.type === 'webhook' && !tool.implementation.url) {
      errors.push({
        path: `/tools/${tool.id}/implementation/url`,
        message: 'Webhook implementation requires URL',
        keyword: 'required',
      });
    }
    
    // Trading tools must have integration requirement
    if (tool.category === 'trading' && !tool.requires?.integration) {
      errors.push({
        path: `/tools/${tool.id}/requires/integration`,
        message: 'Trading tools must specify required integration',
        keyword: 'required',
      });
    }
  }
  
  return errors;
}

/**
 * Validate a single tool definition
 */
export function validateToolDefinition(tool: unknown): ValidationResult {
  // Wrap in manifest for schema validation
  const manifest = { version: '1.0.0', tools: [tool] };
  const result = validateToolManifest(manifest);
  
  // Adjust paths to remove /tools/0 prefix
  return {
    valid: result.valid,
    errors: result.errors.map(err => ({
      ...err,
      path: err.path.replace(/^\/tools\/0/, ''),
    })),
  };
}
```

---

### 5. Security Model Documentation

**File:** `marketplace-agents/docs/SECURITY-MODEL.md`

Create documentation covering:
- Credential encryption at rest
- Permission model (user → agent → tool → scope)
- Rate limiting strategy
- Audit logging requirements
- Data retention policies
- Incident response procedures

---

## File Structure After Phase 0

```
src/tools/custom/
├── types.ts                    # TypeScript types
├── validation.ts               # Validation utilities
├── schemas/
│   ├── tool-manifest.schema.json
│   └── integration.schema.json
└── index.ts                    # Exports

marketplace-agents/docs/
├── CUSTOM-TOOLS-ARCHITECTURE.md
├── SECURITY-MODEL.md
└── phases/
    └── PHASE-0-FOUNDATION.md
```

---

## Acceptance Criteria

- [ ] JSON Schema validates all existing manifests
- [ ] TypeScript types compile without errors
- [ ] Validation utility catches all test cases:
  - [ ] Missing required fields
  - [ ] Invalid enum values
  - [ ] Duplicate tool IDs
  - [ ] High-risk tools without confirmation
- [ ] Database schema documented in Firestore rules
- [ ] Security model reviewed by team

---

## Estimated Effort

| Task | Hours |
|------|-------|
| JSON Schema design | 4 |
| TypeScript types | 4 |
| Validation utilities | 6 |
| Database schema | 4 |
| Security documentation | 4 |
| Testing & review | 8 |
| **Total** | **30 hours** |

