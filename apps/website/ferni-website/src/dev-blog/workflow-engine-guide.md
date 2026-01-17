---
title: "Building Multi-Step Workflows"
excerpt: "Create sophisticated automations with the Ferni Workflow Engine. Supports branching, parallel execution, and voice-triggered workflows."
author: "Ferni Dev Team"
authorInitials: "FD"
authorColor: "#4a6741"
date: 2026-01-09
category: "Tutorial"
image: "workflow-engine.png"
readTime: 15
---

The Ferni Workflow Engine lets you build multi-step automations that voice agents can execute. From simple sequences to complex DAGs with parallel branches, workflows bring your integrations to life.

## What is a Workflow?

A workflow is a directed graph of **nodes** connected by **edges**. Each node performs an action:

- **MCP Call** - Execute a tool from an MCP server
- **Webhook** - Call an external HTTP endpoint
- **LLM Prompt** - Generate text with the language model
- **Condition** - Branch based on an expression
- **Parallel** - Execute multiple branches simultaneously
- **Wait** - Pause for time or an event

## Basic Workflow Structure

```json
{
  "name": "Customer Lookup",
  "trigger": {
    "type": "voice_command",
    "config": { "command": "look up customer" }
  },
  "nodes": [
    { "id": "start", "type": "start" },
    { "id": "lookup", "type": "mcp_call", "config": {...} },
    { "id": "respond", "type": "llm_prompt", "config": {...} },
    { "id": "end", "type": "end" }
  ],
  "edges": [
    { "sourceId": "start", "targetId": "lookup" },
    { "sourceId": "lookup", "targetId": "respond" },
    { "sourceId": "respond", "targetId": "end" }
  ],
  "entryNodeId": "start"
}
```

## Creating Your First Workflow

Let's build a "Daily Standup" workflow that:
1. Fetches today's calendar events
2. Checks if there are meetings
3. Summarizes them for the user

### Step 1: Define the Trigger

```json
{
  "trigger": {
    "type": "voice_command",
    "config": {
      "command": "start standup"
    }
  }
}
```

Trigger types include:
- `voice_command` - Triggered by speech
- `schedule` - Cron-based scheduling
- `event` - Triggered by webhook events
- `api` - Triggered via API call

### Step 2: Add Nodes

{% raw %}
```json
{
  "nodes": [
    {
      "id": "start",
      "type": "start",
      "name": "Start"
    },
    {
      "id": "fetch-calendar",
      "type": "mcp_call",
      "name": "Fetch Calendar",
      "config": {
        "serverId": "mcp_google_calendar",
        "toolName": "calendar.getEvents",
        "arguments": {
          "date": "{{today}}",
          "maxResults": 10
        }
      }
    },
    {
      "id": "check-meetings",
      "type": "condition",
      "name": "Has Meetings?",
      "config": {
        "expression": "fetch-calendar.result.events.length > 0"
      }
    },
    {
      "id": "summarize",
      "type": "llm_prompt",
      "name": "Summarize Meetings",
      "config": {
        "prompt": "Summarize these meetings for a quick standup briefing:\n\n{{fetch-calendar.result.events | json}}",
        "outputVariable": "summary"
      }
    },
    {
      "id": "no-meetings",
      "type": "set_variable",
      "name": "No Meetings Message",
      "config": {
        "variable": "summary",
        "value": "No meetings scheduled for today. Your calendar is clear!"
      }
    },
    {
      "id": "speak",
      "type": "speak",
      "name": "Tell User",
      "config": {
        "text": "{{summary}}"
      }
    },
    {
      "id": "end",
      "type": "end",
      "name": "End"
    }
  ]
}
```
{% endraw %}

### Step 3: Connect with Edges

```json
{
  "edges": [
    { "id": "e1", "sourceId": "start", "targetId": "fetch-calendar" },
    { "id": "e2", "sourceId": "fetch-calendar", "targetId": "check-meetings" },
    { "id": "e3", "sourceId": "check-meetings", "targetId": "summarize", "condition": "true" },
    { "id": "e4", "sourceId": "check-meetings", "targetId": "no-meetings", "condition": "false" },
    { "id": "e5", "sourceId": "summarize", "targetId": "speak" },
    { "id": "e6", "sourceId": "no-meetings", "targetId": "speak" },
    { "id": "e7", "sourceId": "speak", "targetId": "end" }
  ]
}
```

### Step 4: Create via API

```bash
curl -X POST https://api.ferni.ai/api/v2/developers/workflows \
  -H "Authorization: Bearer pk_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily Standup",
    "description": "Summarizes today calendar for morning standup",
    "trigger": {
      "type": "voice_command",
      "config": { "command": "start standup" }
    },
    "nodes": [...],
    "edges": [...],
    "entryNodeId": "start",
    "enabled": true
  }'
```

## Node Types Reference

### MCP Call

Execute a tool from a registered MCP server:

{% raw %}
```json
{
  "id": "lookup",
  "type": "mcp_call",
  "config": {
    "serverId": "mcp_crm",
    "toolName": "lookup_customer",
    "arguments": {
      "query": "{{input.customerName}}"
    }
  }
}
```
{% endraw %}

Results are available as `{nodeId}.result`.

### Webhook

Call an external HTTP endpoint:

{% raw %}
```json
{
  "id": "notify-slack",
  "type": "webhook",
  "config": {
    "url": "https://hooks.slack.com/services/xxx",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    },
    "body": {
      "text": "Workflow completed: {{workflowName}}"
    }
  }
}
```
{% endraw %}

### LLM Prompt

Generate text using the language model:

{% raw %}
```json
{
  "id": "summarize",
  "type": "llm_prompt",
  "config": {
    "prompt": "Summarize this customer interaction:\n\n{{transcript}}",
    "model": "gemini-2.0-flash",
    "outputVariable": "summary"
  }
}
```
{% endraw %}

### Condition

Branch based on an expression:

```json
{
  "id": "check-priority",
  "type": "condition",
  "config": {
    "expression": "ticket.priority === 'high'"
  }
}
```

Connect with conditional edges:
```json
{ "sourceId": "check-priority", "targetId": "urgent-flow", "condition": "true" },
{ "sourceId": "check-priority", "targetId": "normal-flow", "condition": "false" }
```

### Parallel

Execute multiple branches simultaneously:

```json
{
  "id": "parallel-fetch",
  "type": "parallel",
  "config": {
    "branches": [
      { "entryNodeId": "fetch-calendar" },
      { "entryNodeId": "fetch-tasks" },
      { "entryNodeId": "fetch-emails" }
    ]
  }
}
```

All branches must complete before continuing.

### Wait

Pause execution:

```json
{
  "id": "wait-approval",
  "type": "wait",
  "config": {
    "duration": 60000,          // Wait 60 seconds
    "event": "approval.received" // Or wait for event
  }
}
```

### Set Variable

Store a value for later use:

```json
{
  "id": "set-status",
  "type": "set_variable",
  "config": {
    "variable": "ticketStatus",
    "value": "resolved"
  }
}
```

### Activity

Log a custom activity:

{% raw %}
```json
{
  "id": "log-completion",
  "type": "activity",
  "config": {
    "type": "workflow_completed",
    "name": "Daily Standup",
    "data": {
      "meetingCount": "{{fetch-calendar.result.events.length}}"
    }
  }
}
```
{% endraw %}

## Variable Interpolation

{% raw %}
Use `{{expression}}` syntax to reference:

- **Input variables**: `{{input.customerName}}`
- **Node results**: `{{nodeId.result}}`
- **Workflow variables**: `{{variableName}}`
- **Built-ins**: `{{today}}`, `{{now}}`, `{{userId}}`

### Filters

Apply transformations with pipe syntax:

```
{{data | json}}           // JSON stringify
{{text | uppercase}}      // Uppercase
{{list | first}}          // First item
{{number | round}}        // Round number
{{date | format('MMM d')}} // Format date
```
{% endraw %}

## Error Handling

### Per-Node Error Handling

```json
{
  "id": "risky-operation",
  "type": "webhook",
  "config": {...},
  "onError": {
    "type": "goto",
    "targetNodeId": "error-handler"
  }
}
```

### Retry Policy

```json
{
  "id": "flaky-api",
  "type": "webhook",
  "config": {...},
  "retry": {
    "maxAttempts": 3,
    "backoffMs": 1000,
    "backoffMultiplier": 2
  }
}
```

### Global Error Handler

```json
{
  "errorHandler": {
    "nodeId": "global-error-handler"
  }
}
```

## Testing Workflows

### Test via API

```bash
curl -X POST https://api.ferni.ai/api/v2/developers/workflows/wf_xxx/test \
  -H "Authorization: Bearer pk_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "customerName": "Acme Corp"
    }
  }'
```

### Dry Run

Execute without side effects:

```bash
curl -X POST https://api.ferni.ai/api/v2/developers/workflows/wf_xxx/test \
  -H "Authorization: Bearer pk_live_xxx" \
  -d '{
    "dryRun": true,
    "input": {...}
  }'
```

## Execution History

### List Executions

```bash
curl https://api.ferni.ai/api/v2/developers/workflows/wf_xxx/executions \
  -H "Authorization: Bearer pk_live_xxx"
```

### Execution Details

```bash
curl https://api.ferni.ai/api/v2/developers/workflows/wf_xxx/executions/exec_yyy \
  -H "Authorization: Bearer pk_live_xxx"
```

```json
{
  "success": true,
  "data": {
    "id": "exec_yyy",
    "workflowId": "wf_xxx",
    "status": "completed",
    "triggeredBy": "voice",
    "startedAt": "2026-01-11T10:00:00Z",
    "completedAt": "2026-01-11T10:00:05Z",
    "duration": 5000,
    "nodeResults": {
      "fetch-calendar": {
        "status": "completed",
        "duration": 1200,
        "result": {...}
      },
      "summarize": {
        "status": "completed",
        "duration": 2100,
        "result": {...}
      }
    }
  }
}
```

## Real-World Examples

### Customer Onboarding Flow

{% raw %}
```json
{
  "name": "Customer Onboarding",
  "trigger": { "type": "voice_command", "config": { "command": "onboard new customer" } },
  "nodes": [
    { "id": "start", "type": "start" },
    { "id": "get-info", "type": "llm_prompt", "config": {
      "prompt": "Extract customer name, email, and company from: {{input.transcript}}"
    }},
    { "id": "create-crm", "type": "mcp_call", "config": {
      "serverId": "mcp_crm",
      "toolName": "create_customer",
      "arguments": { "data": "{{get-info.result}}" }
    }},
    { "id": "send-welcome", "type": "webhook", "config": {
      "url": "https://api.sendgrid.com/v3/mail/send",
      "method": "POST",
      "body": { "to": "{{get-info.result.email}}", "template": "welcome" }
    }},
    { "id": "confirm", "type": "speak", "config": {
      "text": "I've added {{get-info.result.name}} to your CRM and sent them a welcome email."
    }},
    { "id": "end", "type": "end" }
  ],
  "edges": [
    { "sourceId": "start", "targetId": "get-info" },
    { "sourceId": "get-info", "targetId": "create-crm" },
    { "sourceId": "create-crm", "targetId": "send-welcome" },
    { "sourceId": "send-welcome", "targetId": "confirm" },
    { "sourceId": "confirm", "targetId": "end" }
  ]
}
```
{% endraw %}

### Scheduled Report

{% raw %}
```json
{
  "name": "Daily Sales Report",
  "trigger": {
    "type": "schedule",
    "config": { "cron": "0 9 * * 1-5" }
  },
  "nodes": [
    { "id": "start", "type": "start" },
    { "id": "fetch-sales", "type": "mcp_call", "config": {
      "serverId": "mcp_analytics",
      "toolName": "get_sales_summary",
      "arguments": { "period": "yesterday" }
    }},
    { "id": "generate-report", "type": "llm_prompt", "config": {
      "prompt": "Generate a brief sales report from: {{fetch-sales.result}}"
    }},
    { "id": "send-slack", "type": "webhook", "config": {
      "url": "{{secrets.SLACK_WEBHOOK}}",
      "body": { "text": "📊 *Daily Sales Report*\n{{generate-report.result}}" }
    }},
    { "id": "end", "type": "end" }
  ]
}
```
{% endraw %}

## Best Practices

1. **Keep workflows focused** - One workflow, one purpose
2. **Use meaningful node names** - Makes debugging easier
3. **Handle errors gracefully** - Add error handlers for critical paths
4. **Test with dry runs** - Validate before production
5. **Monitor executions** - Check logs for failures
6. **Version your workflows** - Track changes over time

## Next Steps

- [MCP Integration Guide](/developers/blog/mcp-server-integration/) - Connect external tools
- [Webhook Events](/developers/blog/webhook-security/) - Trigger workflows from events
- [API Reference](/developers/api/workflows/) - Full endpoint documentation

---

Need help building workflows? Join our [Discord](https://discord.gg/ferni) community!
