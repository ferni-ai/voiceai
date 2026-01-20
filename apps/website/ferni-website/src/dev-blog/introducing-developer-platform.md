---
title: "Announcing the Ferni Developer Platform: Voice AI You Can Actually Build On"
excerpt: "Today we're opening the platform that powers Ferni to every developer. Build voice-first experiences with the same tools we use."
author: "Seth Ford"
authorInitials: "SF"
authorColor: "#4a6741"
date: 2026-01-11
category: "Announcements"
image: "developer-platform-launch.png"
readTime: 10
---

# Announcing the Ferni Developer Platform: Voice AI You Can Actually Build On

**Three months ago, a developer emailed us asking if they could use Ferni to build a voice interface for their CRM.**

They'd tried everything else. Built with DialogFlow (too rigid). Experimented with custom LLM chains (too slow). Even attempted raw WebRTC with Whisper (got latency down to 2 seconds, then gave up).

"I just want to say 'Pull up the Johnson account' and have it work," they wrote. "Why is this so hard?"

We couldn't help them then. Ferni was a closed system - designed for personal use, not developer extension.

That changes today.

**Introducing the Ferni Developer Platform** - the complete infrastructure for building voice-first AI applications. The same stack that powers 50,000+ daily Ferni conversations, now available to every developer.

---

## Why We Built This

Let me be honest about our motivation: we built this because we needed it ourselves.

Ferni started as a single AI companion. Then users asked for different personas (Maya for coaching, Peter for planning, Alex for productivity). Then they wanted to connect their calendars. Then their email. Then Notion. Then custom tools for their specific workflows.

Each integration required changes to our core codebase. Every new tool meant coordinating between teams. Our velocity dropped. Feature requests piled up.

So we built an extension system. A way for anyone - including us - to add new capabilities without touching the core engine.

That system is what we're releasing today.

---

## The Core Primitives

The platform has five main components. Each solves a specific integration challenge we faced.

### MCP Server Registration

The [Model Context Protocol](https://modelcontextprotocol.io) (MCP) is the emerging standard for connecting AI to external tools. We adopted it early because it solved a real problem: how do you give an LLM access to arbitrary tools without retraining or fine-tuning?

Now you can register your own MCP servers:

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

Once registered, your tools become voice-callable. Users say "Look up customer Acme Corp" and the agent uses your MCP server to fulfill it.

**The insight that made this work:** We don't expose the tool interface to users. We expose natural language. The agent figures out which tool to call. This means your MCP server just needs to work - it doesn't need to understand conversation.

### Custom Tools

Not everything needs a full MCP server. For simpler integrations, we support three tool types:

**Webhook Tools** - Your HTTP endpoint gets called when triggered:

{% raw %}
```json
{
  "name": "create-ticket",
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

**MCP Tools** - Delegate to a registered MCP server (useful for composing tools):

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

**Prompt Tools** - Use LLM prompting for the response (surprisingly powerful for summarization and formatting):

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

### Webhooks

Our earliest internal feedback was "I need to know when things happen." Users would ask Ferni to set reminders, track habits, or log activities - and we had no way to push that data to external systems.

Webhooks solved this:

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
    ]
  }'
```

Every webhook is signed with HMAC-SHA256. We learned this the hard way - someone found one of our internal webhook endpoints and started spoofing events. Always verify:

```typescript
import crypto from 'crypto';

function verifyWebhook(payload: string, signature: string, secret: string) {
  const [timestamp, hash] = signature.split(',').map(s => s.split('=')[1]);
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return hash === expected;
}
```

### Workflows

This was the hardest to get right. Users wanted complex automations: "Every morning at 8am, check my calendar, summarize what's coming up, and read it to me."

That's not one tool call. It's a sequence of tools with conditions and error handling.

{% raw %}
```json
{
  "name": "Daily Standup",
  "trigger": { "type": "voice_command", "config": { "command": "start standup" } },
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
    { "id": "speak", "type": "speak", "config": { "text": "{{summarize.result}}" }},
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

Yes, it's JSON. Yes, we're building a visual editor. But the JSON-first approach means you can version control your workflows, generate them programmatically, and test them in CI.

### Activities

The final primitive is activities - a way to log custom events and metrics. We use this internally for everything from tracking habit completion to measuring conversation quality.

```typescript
await ferniApi.activities.log({
  type: 'habit_completed',
  payload: {
    habitId: 'morning-meditation',
    duration: 600,
    streak: 5,
  },
});
```

Activities feed into the agent's context. If you log a "meeting_finished" activity, the agent knows about it and can reference it in conversation.

---

## Getting Started

The platform is live today. Here's how to start:

### 1. Get API Credentials

Visit [developers.ferni.ai/console](https://developers.ferni.ai/console) and create an API key. Keys starting with `pk_live_` are for production; `pk_test_` keys work in sandbox.

### 2. Make Your First Call

```bash
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

### 4. Test It

```bash
curl -X POST https://api.ferni.ai/api/v2/developers/mcp-servers/mcp_xxx/test \
  -H "Authorization: Bearer pk_live_xxx"
```

---

## API Reference

Six API groups, 43 endpoints total:

| API | Endpoints | What It Does |
|-----|-----------|--------------|
| **MCP Servers** | 7 | Register external MCP servers |
| **Custom Tools** | 6 | Create webhook, MCP, or prompt tools |
| **Webhooks** | 7 | Subscribe to events |
| **Activities** | 6 | Log custom metrics |
| **Workflows** | 8 | Build multi-step automations |
| **OAuth** | 9 | Manage external auth |

Full documentation: [developers.ferni.ai/api](/developers/api/)

---

## Rate Limits

| Operation | Limit |
|-----------|-------|
| Standard operations | 100/min |
| Read operations | 200/min |
| Write operations | 50/min |
| Expensive operations (test, execute) | 10/min |

Rate limit headers on every response tell you where you stand.

---

## Security

- All requests require authentication (API key or Firebase token)
- Secrets are encrypted at rest with AES-256-GCM
- Webhooks are signed with HMAC-SHA256
- Resource ownership is strictly enforced

We take security seriously because we've seen what happens when you don't. Every webhook we've ever received without signature verification has been either a bug or an attack.

---

## What's Coming

We're just getting started. On the roadmap:

- **TypeScript SDK** - Type-safe client for Node.js (Q1)
- **Python SDK** - Native Python support (Q1)
- **Visual Workflow Editor** - Build workflows in the browser (Q2)
- **OpenAPI Spec** - Auto-generate clients in any language (Q1)
- **API Explorer** - Interactive testing in the console (Q1)

---

## One More Thing

Remember that CRM developer who emailed us three months ago?

He was our first beta tester. His MCP server now handles "pull up the Johnson account" exactly like he imagined.

But he built something we didn't expect: voice-activated lead scoring. His agents say things like "Johnson hasn't responded in two weeks - should I flag them as cold?" He didn't ask us for that feature. He built it himself, in an afternoon, with tools we gave him.

That's why we built a platform instead of just a product.

We can't wait to see what you build.

---

**Resources:**
- [API Reference](/developers/api/)
- [MCP Integration Guide](/developers/blog/mcp-server-integration/)
- [Webhook Security](/developers/blog/webhook-security/)
- [Discord Community](https://discord.gg/ferni)
- [GitHub Examples](https://github.com/ferni-ai/examples)

Questions? Reach out on [Discord](https://discord.gg/ferni) or [Twitter](https://twitter.com/ferni_ai).
