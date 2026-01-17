---
layout: layouts/docs.njk
title: MCP Servers API
description: Register external MCP servers to extend voice agents with custom tools
order: 2
---

# MCP Servers API

Register external [Model Context Protocol](https://modelcontextprotocol.io) (MCP) servers to make their tools available to voice agents. When users speak naturally, the agent can call your tools automatically.

**Base URL:** `https://api.ferni.ai/api/v2/developers/mcp-servers`

---

## Create MCP Server

Register a new MCP server.

```http
POST /mcp-servers
```

### Request Body

{% raw %}
```json
{
  "name": "my-crm-tools",
  "description": "CRM integration for customer lookups",
  "transport": "http",
  "endpoint": "https://mcp.yourcompany.com",
  "headers": {
    "X-API-Key": "{{secrets.CRM_API_KEY}}"
  },
  "secrets": {
    "CRM_API_KEY": "your-secret-key-here"
  },
  "autoConnect": true,
  "timeout": 30000
}
```
{% endraw %}

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique identifier (kebab-case, e.g., `my-crm-tools`) |
| `description` | string | Yes | Human-readable description shown in logs |
| `transport` | string | Yes | Connection type: `http`, `websocket`, or `stdio` |
| `endpoint` | string | For http/ws | URL of your MCP server |
| `command` | string | For stdio | Command to execute |
| `args` | string[] | For stdio | Command arguments |
| `headers` | object | No | HTTP headers (supports {% raw %}`{{secrets.X}}`{% endraw %} interpolation) |
| `secrets` | object | No | Secret values (encrypted at rest with AES-256-GCM) |
| `autoConnect` | boolean | No | Connect on agent startup (default: `true`) |
| `timeout` | number | No | Connection timeout in ms (default: `30000`) |
| `personaId` | string | No | Limit to specific persona (omit for all) |

### Response

```json
{
  "success": true,
  "data": {
    "id": "mcp_lqx7abc_k3m9",
    "name": "my-crm-tools",
    "description": "CRM integration for customer lookups",
    "status": "active",
    "transport": "http",
    "endpoint": "https://mcp.yourcompany.com",
    "autoConnect": true,
    "enabled": true,
    "toolCount": 0,
    "createdAt": "2026-01-11T10:00:00Z",
    "updatedAt": "2026-01-11T10:00:00Z"
  }
}
```

### cURL Example

```bash
curl -X POST https://api.ferni.ai/api/v2/developers/mcp-servers \
  -H "Authorization: Bearer pk_live_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-crm-tools",
    "description": "CRM integration",
    "transport": "http",
    "endpoint": "https://mcp.yourcompany.com"
  }'
```

---

## List MCP Servers

Retrieve all registered MCP servers.

```http
GET /mcp-servers
```

### Query Parameters

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status: `active`, `error`, `disabled` |
| `limit` | number | Max results (default: 50, max: 100) |
| `offset` | number | Pagination offset |

### Response

```json
{
  "success": true,
  "data": [
    {
      "id": "mcp_lqx7abc_k3m9",
      "name": "my-crm-tools",
      "description": "CRM integration",
      "status": "active",
      "transport": "http",
      "endpoint": "https://mcp.yourcompany.com",
      "autoConnect": true,
      "enabled": true,
      "toolCount": 3,
      "lastConnected": "2026-01-11T10:05:00Z",
      "createdAt": "2026-01-11T10:00:00Z",
      "updatedAt": "2026-01-11T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 50,
    "offset": 0
  }
}
```

---

## Get MCP Server

Retrieve a specific MCP server by ID.

```http
GET /mcp-servers/:id
```

### Response

{% raw %}
```json
{
  "success": true,
  "data": {
    "id": "mcp_lqx7abc_k3m9",
    "name": "my-crm-tools",
    "description": "CRM integration",
    "status": "active",
    "transport": "http",
    "endpoint": "https://mcp.yourcompany.com",
    "headers": {
      "X-API-Key": "{{secrets.CRM_API_KEY}}"
    },
    "autoConnect": true,
    "enabled": true,
    "timeout": 30000,
    "toolCount": 3,
    "lastConnected": "2026-01-11T10:05:00Z",
    "lastError": null,
    "createdAt": "2026-01-11T10:00:00Z",
    "updatedAt": "2026-01-11T10:00:00Z"
  }
}
```
{% endraw %}

**Note:** Secret values are never returned in responses.

---

## Update MCP Server

Update an existing MCP server. Only include fields you want to change.

```http
PUT /mcp-servers/:id
```

### Request Body

```json
{
  "description": "Updated description",
  "timeout": 60000,
  "secrets": {
    "CRM_API_KEY": "new-secret-value"
  }
}
```

Secrets are **merged**, not replaced. To remove a secret, set it to `null`.

### Response

```json
{
  "success": true,
  "data": {
    "id": "mcp_lqx7abc_k3m9",
    "name": "my-crm-tools",
    "description": "Updated description",
    "timeout": 60000,
    "updatedAt": "2026-01-11T11:00:00Z"
  }
}
```

---

## Delete MCP Server

Permanently remove an MCP server.

```http
DELETE /mcp-servers/:id
```

### Response

```json
{
  "success": true,
  "data": {
    "deleted": true,
    "id": "mcp_lqx7abc_k3m9"
  }
}
```

---

## Test Connection

Test connectivity to your MCP server and discover available tools.

```http
POST /mcp-servers/:id/test
```

### Successful Response

```json
{
  "success": true,
  "data": {
    "connected": true,
    "latencyMs": 145,
    "serverInfo": {
      "name": "my-crm-tools",
      "version": "1.0.0"
    },
    "toolCount": 3,
    "tools": [
      {
        "name": "lookup_customer",
        "description": "Look up a customer by name or ID"
      },
      {
        "name": "create_ticket",
        "description": "Create a support ticket"
      },
      {
        "name": "list_orders",
        "description": "List recent orders for a customer"
      }
    ],
    "testedAt": "2026-01-11T10:05:00Z"
  }
}
```

### Failed Response

```json
{
  "success": true,
  "data": {
    "connected": false,
    "error": "Connection timeout after 30000ms",
    "testedAt": "2026-01-11T10:05:00Z"
  }
}
```

---

## List Discovered Tools

Get the cached list of tools from an MCP server. Tools are discovered during the `test` operation.

```http
GET /mcp-servers/:id/tools
```

### Response

```json
{
  "success": true,
  "data": [
    {
      "name": "lookup_customer",
      "description": "Look up a customer by name or ID",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "Customer name or ID"
          }
        },
        "required": ["query"]
      }
    },
    {
      "name": "create_ticket",
      "description": "Create a support ticket",
      "inputSchema": {
        "type": "object",
        "properties": {
          "subject": { "type": "string" },
          "description": { "type": "string" },
          "priority": { "type": "string", "enum": ["low", "medium", "high"] }
        },
        "required": ["subject", "description"]
      }
    }
  ]
}
```

---

## Transport Types

### HTTP Transport

Most common for production. Your server must expose MCP protocol over HTTP.

{% raw %}
```json
{
  "transport": "http",
  "endpoint": "https://mcp.yourcompany.com",
  "headers": {
    "Authorization": "Bearer {{secrets.API_TOKEN}}"
  }
}
```
{% endraw %}

### WebSocket Transport

For real-time bidirectional communication.

```json
{
  "transport": "websocket",
  "endpoint": "wss://mcp.yourcompany.com/ws"
}
```

### Stdio Transport

For local development or sidecar containers.

```json
{
  "transport": "stdio",
  "command": "node",
  "args": ["./mcp-server.js"]
}
```

---

## Secret Management

{% raw %}
Secrets are stored encrypted and referenced using `{{secrets.KEY}}` syntax.

### Storing Secrets

```json
{
  "headers": {
    "X-API-Key": "{{secrets.MY_API_KEY}}"
  },
  "secrets": {
    "MY_API_KEY": "actual-secret-value"
  }
}
```
{% endraw %}

### Security

- Encrypted at rest using AES-256-GCM
- Never returned in API responses
- Decrypted only when connecting to your server
- Rotatable without server restart

---

## Status Values

| Status | Description |
|--------|-------------|
| `active` | Server connected and healthy |
| `error` | Last connection attempt failed |
| `disabled` | Manually disabled by developer |

---

## Error Codes

| Code | Description |
|------|-------------|
| `MCP_NAME_EXISTS` | Server name already registered |
| `MCP_INVALID_ENDPOINT` | Endpoint URL is malformed |
| `MCP_CONNECTION_FAILED` | Could not connect to server |
| `MCP_TIMEOUT` | Connection timed out |
| `MCP_INVALID_RESPONSE` | Server didn't return valid MCP protocol |

---

## Best Practices

1. **Use meaningful names** — `acme-crm-tools` not `mcp-1`
2. **Store secrets properly** — Never hardcode in headers
3. **Test before enabling** — Run `/test` to verify connectivity
4. **Set appropriate timeouts** — Increase for slow servers
5. **Monitor tool count** — If 0, tools weren't discovered

---

## Related

- [MCP Integration Guide](/dev-blog/mcp-server-integration/) — Step-by-step tutorial
- [Model Context Protocol](https://modelcontextprotocol.io) — MCP specification
- [Custom Tools API](/developers/api/tools/) — Alternative to full MCP servers
