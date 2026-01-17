---
title: "Building Your First MCP Integration"
excerpt: "A step-by-step guide to registering external MCP servers and making their tools available to voice agents."
author: "Ferni Dev Team"
authorInitials: "FD"
authorColor: "#4a6741"
date: 2026-01-11
category: "Tutorial"
image: "mcp-integration.png"
readTime: 12
---

The [Model Context Protocol](https://modelcontextprotocol.io) (MCP) is an open standard for connecting AI systems to external tools and data sources. With the Ferni Developer Platform, you can register your own MCP servers and make their tools available to voice agents.

This guide walks through the complete process: from setting up an MCP server to testing it with voice commands.

## What is MCP?

MCP defines a standard way for AI models to discover and use tools from external servers. An MCP server exposes:

- **Tools** - Functions the AI can call (e.g., `get_weather`, `create_ticket`)
- **Resources** - Data the AI can read (e.g., documents, database records)
- **Prompts** - Reusable prompt templates

When you register an MCP server with Ferni, the voice agent can discover its tools and use them during conversations.

## Prerequisites

Before you begin, you'll need:

1. A Ferni developer account with API credentials
2. An MCP server running and accessible via HTTP
3. Basic familiarity with REST APIs

## Step 1: Create an MCP Server

If you don't have an MCP server yet, here's a minimal example using Node.js:

```typescript
// server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'my-crm-tools',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
  }
});

// Register a tool
server.setRequestHandler('tools/list', async () => ({
  tools: [{
    name: 'lookup_customer',
    description: 'Look up a customer by name or ID',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Customer name or ID' }
      },
      required: ['query']
    }
  }]
}));

// Handle tool calls
server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'lookup_customer') {
    const query = request.params.arguments?.query;
    // Your CRM lookup logic here
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ name: 'Acme Corp', status: 'active' })
      }]
    };
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
```

For HTTP transport (recommended for production), wrap this in an Express server or use an MCP HTTP adapter.

## Step 2: Register with Ferni

Once your MCP server is running, register it with the Developer Platform:

{% raw %}
```bash
curl -X POST https://api.ferni.ai/api/v2/developers/mcp-servers \
  -H "Authorization: Bearer pk_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-crm-tools",
    "description": "CRM integration for customer lookups and management",
    "transport": "http",
    "endpoint": "https://mcp.yourcompany.com",
    "headers": {
      "X-API-Key": "{{secrets.CRM_API_KEY}}"
    },
    "secrets": {
      "CRM_API_KEY": "your-secret-key-here"
    },
    "autoConnect": true
  }'
```
{% endraw %}

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Unique identifier (kebab-case) |
| `description` | string | Yes | Human-readable description |
| `transport` | string | Yes | `http`, `websocket`, or `stdio` |
| `endpoint` | string | For http/ws | URL of your MCP server |
| `command` | string | For stdio | Command to execute |
| `args` | string[] | For stdio | Command arguments |
| `headers` | object | No | HTTP headers (supports {% raw %}`{{secrets.X}}`{% endraw %} syntax) |
| `secrets` | object | No | Secret values (encrypted at rest) |
| `autoConnect` | boolean | No | Connect on agent startup (default: true) |
| `timeout` | number | No | Connection timeout in ms (default: 30000) |

### Response

```json
{
  "success": true,
  "data": {
    "id": "mcp_lqx7abc_k3m9",
    "name": "my-crm-tools",
    "description": "CRM integration for customer lookups and management",
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

## Step 3: Test the Connection

Verify your server is reachable and discover its tools:

```bash
curl -X POST https://api.ferni.ai/api/v2/developers/mcp-servers/mcp_lqx7abc_k3m9/test \
  -H "Authorization: Bearer pk_live_xxx"
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

### Error Response

If the connection fails, you'll get diagnostic information:

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

## Step 4: View Discovered Tools

After a successful test, tools are cached. List them with:

```bash
curl https://api.ferni.ai/api/v2/developers/mcp-servers/mcp_lqx7abc_k3m9/tools \
  -H "Authorization: Bearer pk_live_xxx"
```

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
          "query": { "type": "string" }
        },
        "required": ["query"]
      }
    }
  ]
}
```

## Step 5: Use Tools with Voice

Once registered, your MCP tools are automatically available to voice agents. Users can trigger them naturally:

> **User:** "Look up customer Acme Corp"
>
> **Agent:** *Calls `lookup_customer` with query "Acme Corp"*
>
> **Agent:** "Acme Corp is an active customer. They joined in 2023 and have made 47 orders."

The agent automatically:
1. Recognizes the intent maps to your `lookup_customer` tool
2. Extracts parameters from the user's speech
3. Calls your MCP server
4. Formats the response naturally

## Security Best Practices

### 1. Use Secret References

Never hardcode API keys in headers. Use the secrets system:

{% raw %}
```json
{
  "headers": {
    "Authorization": "Bearer {{secrets.MY_API_KEY}}"
  },
  "secrets": {
    "MY_API_KEY": "actual-secret-value"
  }
}
```
{% endraw %}

Secrets are encrypted at rest using AES-256-GCM and only decrypted when connecting to your server.

### 2. Validate Requests

Your MCP server should validate that requests come from Ferni:

```typescript
// Add a shared secret validation
server.use((request, next) => {
  const signature = request.headers['x-ferni-signature'];
  if (!validateSignature(signature, request.body)) {
    throw new Error('Invalid signature');
  }
  return next();
});
```

### 3. Scope Tool Permissions

Design tools with least-privilege in mind. Instead of a generic "database_query" tool, create specific tools like "lookup_customer" that can only access customer data.

### 4. Log Tool Usage

Track which tools are called and by whom:

```typescript
server.setRequestHandler('tools/call', async (request) => {
  console.log(`Tool called: ${request.params.name}`, {
    arguments: request.params.arguments,
    timestamp: new Date().toISOString()
  });
  // ... handle the tool
});
```

## Updating Your Server

To update configuration:

```bash
curl -X PUT https://api.ferni.ai/api/v2/developers/mcp-servers/mcp_lqx7abc_k3m9 \
  -H "Authorization: Bearer pk_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated description",
    "timeout": 60000
  }'
```

Only include fields you want to change. Secrets are merged, not replaced.

## Disabling a Server

Temporarily disable without deleting:

```bash
curl -X PUT https://api.ferni.ai/api/v2/developers/mcp-servers/mcp_lqx7abc_k3m9 \
  -H "Authorization: Bearer pk_live_xxx" \
  -d '{ "enabled": false }'
```

## Deleting a Server

Permanently remove a server:

```bash
curl -X DELETE https://api.ferni.ai/api/v2/developers/mcp-servers/mcp_lqx7abc_k3m9 \
  -H "Authorization: Bearer pk_live_xxx"
```

## Troubleshooting

### Connection Timeout

- Ensure your server is publicly accessible
- Check firewall rules allow incoming connections
- Increase the `timeout` value if your server needs more startup time

### Tools Not Discovered

- Verify your server implements `tools/list` correctly
- Check the response format matches MCP spec
- Run the test endpoint to see raw discovery results

### Tool Calls Failing

- Check your server logs for errors
- Verify input schema validation isn't rejecting valid inputs
- Ensure your server handles the `tools/call` method

## Next Steps

- [Custom Tools API](/developers/api/tools/) - Create tools without a full MCP server
- [Webhook Events](/developers/blog/webhook-security/) - Get notified when tools are called
- [Workflow Integration](/developers/blog/workflow-engine-guide/) - Use MCP tools in automated workflows

---

Questions? Join our [Discord](https://discord.gg/ferni) or check out more [examples on GitHub](https://github.com/ferni-ai/examples).
