---
layout: layouts/docs.njk
title: Custom Tools API
description: Register individual tools without running a full MCP server
order: 3
---

# Custom Tools API

Register individual tools that voice agents can use. Unlike MCP servers, custom tools don't require you to run any infrastructure—Ferni handles execution by calling your webhook endpoint.

**Base URL:** `https://api.ferni.ai/api/v2/developers/tools`

---

## Create Tool

Register a new custom tool.

```http
POST /tools
```

### Request Body

{% raw %}
```json
{
  "name": "lookup-customer",
  "displayName": "Customer Lookup",
  "description": "Look up customer information by name or ID",
  "llmDescription": "Use this tool when the user asks about a customer, wants to find customer details, or needs to look up account information.",
  "type": "webhook",
  "config": {
    "url": "https://api.yourcompany.com/tools/lookup-customer",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer {{secrets.API_TOKEN}}"
    }
  },
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Customer name, email, or account ID"
      },
      "includeOrders": {
        "type": "boolean",
        "description": "Whether to include recent orders",
        "default": false
      }
    },
    "required": ["query"]
  },
  "secrets": {
    "API_TOKEN": "your-secret-token"
  },
  "enabled": true
}
```
{% endraw %}

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique identifier (kebab-case) |
| `displayName` | string | Yes | Human-readable name |
| `description` | string | Yes | Brief description for logs |
| `llmDescription` | string | Yes | Description the LLM sees (be detailed!) |
| `type` | string | Yes | `webhook`, `mcp`, or `prompt` |
| `config` | object | Yes | Type-specific configuration |
| `parameters` | object | Yes | JSON Schema for input parameters |
| `returns` | object | No | JSON Schema for return value |
| `secrets` | object | No | Secret values (encrypted at rest) |
| `enabled` | boolean | No | Active state (default: `true`) |
| `personaId` | string | No | Limit to specific persona |

### Response

```json
{
  "success": true,
  "data": {
    "id": "tool_abc123xyz",
    "name": "lookup-customer",
    "displayName": "Customer Lookup",
    "description": "Look up customer information",
    "type": "webhook",
    "enabled": true,
    "status": "active",
    "callCount": 0,
    "version": "1",
    "createdAt": "2026-01-11T10:00:00Z",
    "updatedAt": "2026-01-11T10:00:00Z"
  }
}
```

---

## List Tools

Retrieve all registered tools.

```http
GET /tools
```

### Query Parameters

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Filter by type: `webhook`, `mcp`, `prompt` |
| `status` | string | Filter: `active`, `error`, `disabled` |
| `limit` | number | Max results (default: 50) |
| `offset` | number | Pagination offset |

### Response

```json
{
  "success": true,
  "data": [
    {
      "id": "tool_abc123xyz",
      "name": "lookup-customer",
      "displayName": "Customer Lookup",
      "type": "webhook",
      "enabled": true,
      "status": "active",
      "callCount": 156,
      "lastCalledAt": "2026-01-11T10:15:00Z",
      "createdAt": "2026-01-11T10:00:00Z"
    }
  ]
}
```

---

## Get Tool

Retrieve a specific tool.

```http
GET /tools/:id
```

---

## Update Tool

Update an existing tool.

```http
PUT /tools/:id
```

Updates increment the version number. Only include fields you want to change.

---

## Delete Tool

Permanently remove a tool.

```http
DELETE /tools/:id
```

---

## Test Tool

Execute the tool with test parameters.

```http
POST /tools/:id/test
```

### Request Body

```json
{
  "arguments": {
    "query": "Acme Corp",
    "includeOrders": true
  }
}
```

### Response

```json
{
  "success": true,
  "data": {
    "executed": true,
    "duration": 245,
    "result": {
      "customer": {
        "name": "Acme Corp",
        "status": "active",
        "orders": [{ "id": "ord_123", "total": 599.99 }]
      }
    },
    "testedAt": "2026-01-11T10:20:00Z"
  }
}
```

---

## Tool Types

### Webhook Tools

Call an external HTTP endpoint when the tool is invoked.

{% raw %}
```json
{
  "type": "webhook",
  "config": {
    "url": "https://api.yourcompany.com/tools/my-tool",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer {{secrets.API_TOKEN}}",
      "Content-Type": "application/json"
    },
    "timeout": 30000
  }
}
```
{% endraw %}

**Request sent to your endpoint:**

```json
{
  "toolId": "tool_abc123xyz",
  "arguments": {
    "query": "Acme Corp"
  },
  "context": {
    "sessionId": "sess_123",
    "userId": "usr_456",
    "personaId": "ferni"
  }
}
```

**Expected response:**

```json
{
  "success": true,
  "result": {
    "customer": { "name": "Acme Corp", "status": "active" }
  }
}
```

### MCP Tools

Delegate to an existing MCP server tool.

```json
{
  "type": "mcp",
  "config": {
    "serverId": "mcp_crm",
    "toolName": "lookup_customer"
  }
}
```

This is useful for creating aliases or adding custom LLM descriptions to existing MCP tools.

### Prompt Tools

Generate a response using the LLM with a custom prompt template.

{% raw %}
```json
{
  "type": "prompt",
  "config": {
    "prompt": "Based on the following context, provide a brief summary:\\n\\nCustomer: {{arguments.customerName}}\\nTopic: {{arguments.topic}}\\n\\nResponse:",
    "model": "gemini-2.0-flash"
  }
}
```
{% endraw %}

---

## Parameter Schema

Tools use JSON Schema to define their parameters:

```json
{
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "What to search for",
        "minLength": 1,
        "maxLength": 200
      },
      "limit": {
        "type": "integer",
        "description": "Maximum results",
        "default": 10,
        "minimum": 1,
        "maximum": 100
      },
      "format": {
        "type": "string",
        "enum": ["brief", "detailed"],
        "default": "brief"
      },
      "tags": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Filter by tags"
      }
    },
    "required": ["query"]
  }
}
```

The LLM uses these schemas to understand how to call your tool correctly.

---

## Writing Good LLM Descriptions

The `llmDescription` field is critical—it tells the AI when to use your tool.

### Bad Example

```
"llmDescription": "Customer lookup tool"
```

### Good Example

```
"llmDescription": "Use this tool when the user asks about a customer, wants to look up account details, needs to find a customer by name or email, or asks 'who is [customer name]'. Returns customer profile including name, status, contact info, and optionally recent orders."
```

### Tips

- **Include trigger phrases** the user might say
- **Describe what it returns** so the AI knows what to expect
- **Mention related concepts** (synonyms, related queries)
- **Be specific** about when NOT to use it

---

## Error Handling

If your webhook returns an error:

```json
{
  "success": false,
  "error": {
    "code": "CUSTOMER_NOT_FOUND",
    "message": "No customer found with that name"
  }
}
```

The agent will handle the error gracefully and may retry or inform the user.

---

## Rate Limiting

Tools have per-tool rate limits:

| Plan | Calls/minute per tool |
|------|-----------------------|
| Free | 30 |
| Pro | 300 |
| Enterprise | 3000 |

---

## Related

- [MCP Servers API](/developers/api/mcp-servers/) — For multiple tools from one server
- [Workflows API](/developers/api/workflows/) — Use tools in automated workflows
