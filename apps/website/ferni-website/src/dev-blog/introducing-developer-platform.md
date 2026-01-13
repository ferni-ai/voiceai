---
title: "Introducing the Ferni Developer Platform"
excerpt: "Build voice-first AI experiences with MCP servers, custom tools, webhooks, and workflows. The complete developer toolkit for extending voice agents."
author: "Ferni Dev Team"
authorInitials: "FD"
authorColor: "#38bdf8"
date: 2026-01-11
category: "Announcements"
image: "developer-platform-launch.png"
readTime: 8
---

Today we're excited to announce the **Ferni Developer Platform** - a comprehensive suite of APIs that let you extend voice agents with custom capabilities, integrate external services, and build sophisticated automation workflows.

## What is the Developer Platform?

The Developer Platform transforms Ferni from a standalone voice AI into an extensible platform. You can now:

- **Register MCP Servers** - Connect external Model Context Protocol servers to give agents new tools
- **Create Custom Tools** - Build webhook, MCP, or prompt-based tools callable by voice
- **Subscribe to Webhooks** - Receive real-time events when users interact with your agents
- **Track Activities** - Log and query custom metrics and activities
- **Build Workflows** - Create multi-step automations with branching and parallel execution
- **Integrate OAuth** - Authenticate with external services using your own OAuth apps

## Core Concepts

### MCP Server Integration

The [Model Context Protocol](https://modelcontextprotocol.io) (MCP) is an open standard for connecting AI systems to external tools and data sources. With the Developer Platform, you can register your own MCP servers:

```bash
curl -X POST https://api.ferni.ai/api/v2/developers/mcp-servers \
  -H "Authorization: Bearer pk_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-crm-tools",
    "description": "CRM integration for customer lookups",
    "transport": "http",
    "endpoint": "https://my-mcp-server.example.com",
    "autoConnect": true
  }'
```

Once registered, tools from your MCP server become available to voice agents. Users can say things like "Look up customer Acme Corp" and the agent will use your MCP tools to fulfill the request.

### Custom Tools

Not every tool needs a full MCP server. For simpler integrations, you can create custom tools with three execution types:

**Webhook Tools** - Call your HTTP endpoint when triggered:

{% raw %}
```json
{
  "name": "create-ticket",
  "displayName": "Create Support Ticket",
  "type": "webhook",
  "config": {
    "url": "https://api.yourservice.com/tickets",
    "method": "POST",
    "headers": { "Authorization": "Bearer {{secrets.API_KEY}}" }
  },
  "parameters": {
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "priority": { "type": "string", "enum": ["low", "medium", "high"] }
    }
  }
}
```
{% endraw %}

**MCP Tools** - Delegate to a registered MCP server:

```json
{
  "name": "weather-lookup",
  "type": "mcp",
  "config": {
    "serverId": "mcp_abc123",
    "toolName": "get_weather"
  }
}
```

**Prompt Tools** - Use LLM prompting for the response:

{% raw %}
```json
{
  "name": "summarize-meeting",
  "type": "prompt",
  "config": {
    "prompt": "Summarize the following meeting notes in 3 bullet points: {{input}}"
  }
}
```
{% endraw %}

### Webhook Events

Stay informed about what's happening in your agents with webhook subscriptions:

```bash
curl -X POST https://api.ferni.ai/api/v2/developers/webhooks \
  -H "Authorization: Bearer pk_live_xxx" \
  -d '{
    "name": "Session Events",
    "url": "https://your-backend.com/ferni-webhooks",
    "events": [
      "session.started",
      "session.ended",
      "tool.called",
      "workflow.completed"
    ],
    "enabled": true
  }'
```

All webhooks are signed with HMAC-SHA256 for security. Verify signatures in your handler:

```typescript
import crypto from 'crypto';

function verifyWebhook(payload: string, signature: string, secret: string): boolean {
  const [timestamp, hash] = signature.split(',').map(s => s.split('=')[1]);
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return hash === expected;
}
```

### Workflow Engine

The workflow engine lets you build multi-step automations with conditions, parallel execution, and error handling:

{% raw %}
```json
{
  "name": "Daily Standup",
  "trigger": {
    "type": "voice_command",
    "config": { "command": "start standup" }
  },
  "nodes": [
    { "id": "start", "type": "start" },
    { "id": "fetch-calendar", "type": "mcp_call", "config": {
      "serverId": "mcp_google",
      "toolName": "calendar.getEvents",
      "arguments": { "date": "today" }
    }},
    { "id": "has-meetings", "type": "condition", "config": {
      "expression": "fetch-calendar.result.events.length > 0"
    }},
    { "id": "summarize", "type": "llm_prompt", "config": {
      "prompt": "Summarize today's meetings: {{fetch-calendar.result}}"
    }},
    { "id": "speak", "type": "speak", "config": {
      "text": "{{summarize.result}}"
    }},
    { "id": "end", "type": "end" }
  ],
  "edges": [
    { "sourceId": "start", "targetId": "fetch-calendar" },
    { "sourceId": "fetch-calendar", "targetId": "has-meetings" },
    { "sourceId": "has-meetings", "targetId": "summarize", "condition": "true" },
    { "sourceId": "has-meetings", "targetId": "end", "condition": "false" },
    { "sourceId": "summarize", "targetId": "speak" },
    { "sourceId": "speak", "targetId": "end" }
  ]
}
```
{% endraw %}

## Getting Started

### 1. Get API Credentials

Sign in to the [Developer Console](https://developers.ferni.ai/console) and create an API key. Keys starting with `pk_live_` are for production; `pk_test_` keys work in sandbox.

### 2. Make Your First API Call

```bash
# List your MCP servers
curl https://api.ferni.ai/api/v2/developers/mcp-servers \
  -H "Authorization: Bearer pk_live_xxx"
```

### 3. Register an MCP Server

```bash
curl -X POST https://api.ferni.ai/api/v2/developers/mcp-servers \
  -H "Authorization: Bearer pk_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-first-server",
    "transport": "http",
    "endpoint": "https://your-mcp-server.com"
  }'
```

### 4. Test the Connection

```bash
curl -X POST https://api.ferni.ai/api/v2/developers/mcp-servers/mcp_xxx/test \
  -H "Authorization: Bearer pk_live_xxx"
```

## API Reference

The Developer Platform includes six main API groups:

| API | Endpoints | Description |
|-----|-----------|-------------|
| **MCP Servers** | 7 endpoints | Register and manage external MCP servers |
| **Custom Tools** | 6 endpoints | Create webhook, MCP, or prompt-based tools |
| **Webhooks** | 7 endpoints | Subscribe to events with delivery logs |
| **Activities** | 6 endpoints | Track custom metrics and activities |
| **Workflows** | 8 endpoints | Build multi-step automations |
| **OAuth** | 9 endpoints | Manage external service authentication |

See the full [API Reference](/developers/api/) for complete documentation.

## Rate Limits

| Operation | Limit |
|-----------|-------|
| Standard operations | 100/min |
| Read operations | 200/min |
| Write operations | 50/min |
| Expensive operations (test, execute) | 10/min |

Rate limit headers are included in every response:
- `X-RateLimit-Limit` - Maximum requests in window
- `X-RateLimit-Remaining` - Requests remaining
- `X-RateLimit-Reset` - Unix timestamp when limit resets

## Security

- **All requests require authentication** via API key or Firebase token
- **Secrets are encrypted at rest** using AES-256-GCM
- **Webhooks are signed** with HMAC-SHA256
- **Resource ownership is enforced** - you can only access your own resources

## What's Next?

We're just getting started. Coming soon:

- **TypeScript SDK** - Type-safe client library for Node.js
- **Python SDK** - Native Python client
- **OpenAPI Spec** - Auto-generated documentation and client generation
- **Visual Workflow Editor** - Build workflows in the browser
- **API Explorer** - Interactive API testing in the console

## Resources

- [API Reference](/developers/api/) - Complete endpoint documentation
- [MCP Integration Guide](/developers/blog/mcp-server-integration/) - Deep dive on MCP
- [Webhook Security](/developers/blog/webhook-security/) - HMAC verification guide
- [GitHub Examples](https://github.com/ferni-ai/examples) - Sample code and templates

---

We can't wait to see what you build. If you have questions or feedback, reach out on [Discord](https://discord.gg/ferni) or [Twitter](https://twitter.com/ferni_ai).

Happy building! 🚀
