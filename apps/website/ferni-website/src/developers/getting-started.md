---
layout: layouts/docs.njk
title: Getting Started
description: Get your API keys and make your first call in under 5 minutes
order: 1
---

## Welcome to Ferni Developer Platform

The Ferni Developer Platform lets you extend voice agents with custom integrations, workflows, and tools. No local setup required—everything runs in the cloud.

**What you can build:**
- Connect external services via **MCP Servers**
- Create **Custom Tools** for voice agents to use
- Receive real-time events via **Webhooks**
- Define multi-step **Workflows** triggered by voice
- Track custom **Activities** and metrics

## Step 1: Get Your API Credentials

### Create a Developer Account

1. Visit [console.ferni.ai](https://console.ferni.ai)
2. Sign up with your email or Google account
3. Accept the Developer Terms of Service

### Generate API Keys

Navigate to **Settings → API Keys** and click **Create API Key**.

```
pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Important:** Copy your key immediately—it won't be shown again.

| Key Type | Prefix | Usage |
|----------|--------|-------|
| Live | `pk_live_` | Production traffic |
| Test | `pk_test_` | Development & testing |

## Step 2: Make Your First API Call

Let's verify your credentials by listing your MCP servers (initially empty):

```bash
curl https://api.ferni.ai/api/v2/developers/mcp-servers \
  -H "Authorization: Bearer pk_live_xxxxx"
```

**Response:**
```json
{
  "success": true,
  "data": []
}
```

If you see this response, you're ready to build!

## Step 3: Choose Your Path

### Path A: Connect External Tools (MCP Servers)

Register an [MCP Server](/developers/api/mcp-servers/) to give voice agents access to your tools:

```bash
curl -X POST https://api.ferni.ai/api/v2/developers/mcp-servers \
  -H "Authorization: Bearer pk_live_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-crm",
    "description": "CRM integration for customer lookups",
    "transport": "http",
    "endpoint": "https://mcp.yourcompany.com",
    "autoConnect": true
  }'
```

Now users can say "Look up customer Acme Corp" and your tools execute automatically.

→ [Full MCP Integration Guide](/dev-blog/mcp-server-integration/)

### Path B: Receive Events (Webhooks)

Get notified when things happen in Ferni:

```bash
curl -X POST https://api.ferni.ai/api/v2/developers/webhooks \
  -H "Authorization: Bearer pk_live_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Session Events",
    "url": "https://api.yourcompany.com/ferni-webhooks",
    "events": ["session.started", "session.ended", "tool.called"],
    "enabled": true
  }'
```

→ [Webhook Security Best Practices](/dev-blog/webhook-security/)

### Path C: Build Workflows

Create multi-step automations triggered by voice:

{% raw %}
```bash
curl -X POST https://api.ferni.ai/api/v2/developers/workflows \
  -H "Authorization: Bearer pk_live_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily Standup",
    "trigger": { "type": "voice_command", "config": { "command": "start standup" } },
    "nodes": [
      { "id": "start", "type": "start" },
      { "id": "fetch", "type": "mcp_call", "config": { "serverId": "mcp_xxx", "toolName": "calendar.getEvents" } },
      { "id": "speak", "type": "speak", "config": { "text": "{{fetch.result | summarize}}" } },
      { "id": "end", "type": "end" }
    ],
    "edges": [
      { "sourceId": "start", "targetId": "fetch" },
      { "sourceId": "fetch", "targetId": "speak" },
      { "sourceId": "speak", "targetId": "end" }
    ]
  }'
```
{% endraw %}

→ [Workflow Engine Guide](/dev-blog/workflow-engine-guide/)

## Authentication

All API requests require a Bearer token:

```bash
curl https://api.ferni.ai/api/v2/developers/... \
  -H "Authorization: Bearer pk_live_xxxxx"
```

### Error Responses

| Status | Meaning |
|--------|---------|
| `401` | Missing or invalid API key |
| `403` | Key doesn't have required scope |
| `429` | Rate limit exceeded |

## Rate Limits

| Plan | Requests/minute | MCP Servers | Webhooks |
|------|-----------------|-------------|----------|
| Free | 60 | 3 | 5 |
| Pro | 600 | 25 | 50 |
| Enterprise | Unlimited | Unlimited | Unlimited |

Rate limit headers are included in every response:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
X-RateLimit-Reset: 1704985200
```

## Base URLs

| Environment | Base URL |
|-------------|----------|
| Production | `https://api.ferni.ai/api/v2` |
| Sandbox | `https://sandbox.ferni.ai/api/v2` |

## SDKs (Coming Soon)

Official SDKs are in development:

```typescript
// TypeScript SDK (coming Q1 2026)
import { Ferni } from '@ferni/sdk';

const ferni = new Ferni({ apiKey: 'pk_live_xxxxx' });

const server = await ferni.mcp.create({
  name: 'my-crm',
  endpoint: 'https://mcp.yourcompany.com'
});
```

```python
# Python SDK (coming Q1 2026)
from ferni import Ferni

ferni = Ferni(api_key="pk_live_xxxxx")

server = ferni.mcp.create(
    name="my-crm",
    endpoint="https://mcp.yourcompany.com"
)
```

Until then, use `curl` or any HTTP client.

## Quick Reference

| What you want | Endpoint | Guide |
|---------------|----------|-------|
| Register external tools | `POST /mcp-servers` | [MCP Guide](/dev-blog/mcp-server-integration/) |
| Create custom tools | `POST /tools` | [API Reference](/developers/api/#custom-tools) |
| Receive events | `POST /webhooks` | [Webhook Security](/dev-blog/webhook-security/) |
| Build automations | `POST /workflows` | [Workflow Guide](/dev-blog/workflow-engine-guide/) |
| Track metrics | `POST /activities` | [API Reference](/developers/api/#activities) |
| Connect OAuth | `POST /oauth/providers` | [API Reference](/developers/api/#oauth) |

## Next Steps

- **[API Reference](/developers/api/)** — Full endpoint documentation
- **[Dev Blog](/dev-blog/)** — Tutorials and best practices
- **[Examples](https://github.com/ferni-ai/examples)** — Working code samples

## Get Help

- **[Discord](https://discord.gg/ferni)** — Community support
- **[GitHub Issues](https://github.com/ferni-ai/platform/issues)** — Bug reports
- **[support@ferni.ai](mailto:support@ferni.ai)** — Enterprise support
