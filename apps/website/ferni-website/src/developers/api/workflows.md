---
layout: layouts/docs.njk
title: Workflows API
description: Create multi-step automations triggered by voice commands
order: 5
---

# Workflows API

Define multi-step workflows that voice agents can execute. Workflows support branching, parallel execution, and integration with MCP servers and webhooks.

**Base URL:** `https://api.ferni.ai/api/v2/developers/workflows`

---

## Create Workflow

Create a new workflow definition.

```http
POST /workflows
```

### Request Body

{% raw %}
```json
{
  "name": "Daily Standup",
  "description": "Summarizes today's calendar for morning standup",
  "trigger": {
    "type": "voice_command",
    "config": { "command": "start standup" }
  },
  "nodes": [
    { "id": "start", "type": "start", "name": "Start" },
    { "id": "fetch-calendar", "type": "mcp_call", "name": "Fetch Calendar", "config": {
      "serverId": "mcp_google_calendar",
      "toolName": "calendar.getEvents",
      "arguments": { "date": "{{today}}", "maxResults": 10 }
    }},
    { "id": "summarize", "type": "llm_prompt", "name": "Summarize", "config": {
      "prompt": "Summarize these meetings: {{fetch-calendar.result | json}}",
      "outputVariable": "summary"
    }},
    { "id": "speak", "type": "speak", "name": "Tell User", "config": {
      "text": "{{summary}}"
    }},
    { "id": "end", "type": "end", "name": "End" }
  ],
  "edges": [
    { "id": "e1", "sourceId": "start", "targetId": "fetch-calendar" },
    { "id": "e2", "sourceId": "fetch-calendar", "targetId": "summarize" },
    { "id": "e3", "sourceId": "summarize", "targetId": "speak" },
    { "id": "e4", "sourceId": "speak", "targetId": "end" }
  ],
  "entryNodeId": "start",
  "enabled": true
}
```
{% endraw %}

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Workflow name |
| `description` | string | No | Human-readable description |
| `trigger` | object | Yes | How the workflow is triggered |
| `nodes` | array | Yes | Workflow nodes (steps) |
| `edges` | array | Yes | Connections between nodes |
| `entryNodeId` | string | Yes | Starting node ID |
| `enabled` | boolean | No | Active state (default: `true`) |
| `personaId` | string | No | Limit to specific persona |
| `timeout` | number | No | Max execution time in ms |

### Response

```json
{
  "success": true,
  "data": {
    "id": "wf_abc123xyz",
    "name": "Daily Standup",
    "description": "Summarizes today's calendar for morning standup",
    "status": "active",
    "trigger": { "type": "voice_command", "config": { "command": "start standup" } },
    "nodeCount": 5,
    "enabled": true,
    "version": "1",
    "createdAt": "2026-01-11T10:00:00Z",
    "updatedAt": "2026-01-11T10:00:00Z"
  }
}
```

---

## List Workflows

Retrieve all workflows.

```http
GET /workflows
```

### Query Parameters

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Filter: `active`, `error`, `disabled` |
| `trigger` | string | Filter by trigger type |
| `limit` | number | Max results (default: 50) |
| `offset` | number | Pagination offset |

### Response

```json
{
  "success": true,
  "data": [
    {
      "id": "wf_abc123xyz",
      "name": "Daily Standup",
      "description": "Summarizes today's calendar",
      "status": "active",
      "trigger": { "type": "voice_command" },
      "nodeCount": 5,
      "enabled": true,
      "lastExecutedAt": "2026-01-11T09:00:00Z",
      "executionCount": 47,
      "createdAt": "2026-01-11T10:00:00Z"
    }
  ]
}
```

---

## Get Workflow

Retrieve full workflow definition.

```http
GET /workflows/:id
```

### Response

Returns complete workflow including all nodes and edges.

---

## Update Workflow

Update an existing workflow.

```http
PUT /workflows/:id
```

Updates create a new version. Previous versions are retained for rollback.

---

## Delete Workflow

Permanently remove a workflow.

```http
DELETE /workflows/:id
```

---

## Execute Workflow

Manually trigger a workflow execution.

```http
POST /workflows/:id/execute
```

### Request Body

```json
{
  "input": {
    "customVariable": "value"
  }
}
```

### Response

```json
{
  "success": true,
  "data": {
    "executionId": "exec_xyz789",
    "workflowId": "wf_abc123xyz",
    "status": "running",
    "startedAt": "2026-01-11T10:30:00Z"
  }
}
```

---

## Test Workflow (Dry Run)

Execute without side effects.

```http
POST /workflows/:id/test
```

### Request Body

```json
{
  "dryRun": true,
  "input": {
    "customerName": "Acme Corp"
  }
}
```

### Response

```json
{
  "success": true,
  "data": {
    "executionId": "exec_test_123",
    "status": "completed",
    "dryRun": true,
    "nodeResults": {
      "fetch-calendar": { "status": "skipped", "reason": "dry_run" },
      "summarize": { "status": "skipped", "reason": "dry_run" }
    },
    "duration": 50
  }
}
```

---

## List Executions

Get execution history for a workflow.

```http
GET /workflows/:id/executions
```

### Query Parameters

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Filter: `running`, `completed`, `failed`, `cancelled` |
| `limit` | number | Max results (default: 50) |

### Response

```json
{
  "success": true,
  "data": [
    {
      "id": "exec_xyz789",
      "workflowId": "wf_abc123xyz",
      "status": "completed",
      "triggeredBy": "voice",
      "startedAt": "2026-01-11T09:00:00Z",
      "completedAt": "2026-01-11T09:00:05Z",
      "duration": 5000
    }
  ]
}
```

---

## Get Execution Details

Get detailed results for a specific execution.

```http
GET /workflows/:id/executions/:execId
```

### Response

```json
{
  "success": true,
  "data": {
    "id": "exec_xyz789",
    "workflowId": "wf_abc123xyz",
    "status": "completed",
    "triggeredBy": "voice",
    "startedAt": "2026-01-11T09:00:00Z",
    "completedAt": "2026-01-11T09:00:05Z",
    "duration": 5000,
    "nodeResults": {
      "fetch-calendar": {
        "status": "completed",
        "startedAt": "2026-01-11T09:00:00Z",
        "duration": 1200,
        "result": { "events": [{ "title": "Standup", "time": "9:30 AM" }] }
      },
      "summarize": {
        "status": "completed",
        "duration": 2100,
        "result": "You have one meeting today: Standup at 9:30 AM."
      },
      "speak": {
        "status": "completed",
        "duration": 100
      }
    },
    "variables": {
      "summary": "You have one meeting today: Standup at 9:30 AM."
    }
  }
}
```

---

## Trigger Types

### Voice Command

Triggered when user says a phrase.

```json
{
  "type": "voice_command",
  "config": {
    "command": "start standup"
  }
}
```

### Schedule

Triggered on a cron schedule.

```json
{
  "type": "schedule",
  "config": {
    "cron": "0 9 * * 1-5",
    "timezone": "America/New_York"
  }
}
```

### API

Triggered via the execute endpoint.

```json
{
  "type": "api"
}
```

### Event

Triggered by a webhook event.

```json
{
  "type": "event",
  "config": {
    "eventType": "session.ended"
  }
}
```

---

## Node Types

### start

Entry point for the workflow.

```json
{ "id": "start", "type": "start", "name": "Start" }
```

### end

Exit point for the workflow.

```json
{ "id": "end", "type": "end", "name": "End" }
```

### mcp_call

Execute a tool from an MCP server.

{% raw %}
```json
{
  "id": "lookup",
  "type": "mcp_call",
  "name": "Lookup Customer",
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

### webhook

Call an external HTTP endpoint.

{% raw %}
```json
{
  "id": "notify",
  "type": "webhook",
  "name": "Notify Slack",
  "config": {
    "url": "https://hooks.slack.com/services/xxx",
    "method": "POST",
    "headers": { "Content-Type": "application/json" },
    "body": { "text": "Workflow completed: {{workflowName}}" }
  }
}
```
{% endraw %}

### llm_prompt

Generate text using the language model.

{% raw %}
```json
{
  "id": "summarize",
  "type": "llm_prompt",
  "name": "Summarize",
  "config": {
    "prompt": "Summarize this in one sentence: {{data}}",
    "model": "gemini-2.0-flash",
    "outputVariable": "summary"
  }
}
```
{% endraw %}

### condition

Branch based on an expression.

```json
{
  "id": "check",
  "type": "condition",
  "name": "Has Events?",
  "config": {
    "expression": "fetch-calendar.result.events.length > 0"
  }
}
```

Connect with conditional edges:

```json
{ "sourceId": "check", "targetId": "summarize", "condition": "true" },
{ "sourceId": "check", "targetId": "no-events", "condition": "false" }
```

### parallel

Execute multiple branches simultaneously.

```json
{
  "id": "parallel-fetch",
  "type": "parallel",
  "name": "Fetch All",
  "config": {
    "branches": [
      { "entryNodeId": "fetch-calendar" },
      { "entryNodeId": "fetch-tasks" },
      { "entryNodeId": "fetch-emails" }
    ]
  }
}
```

### wait

Pause execution.

```json
{
  "id": "wait",
  "type": "wait",
  "name": "Wait for Approval",
  "config": {
    "duration": 60000,
    "event": "approval.received"
  }
}
```

### set_variable

Store a value for later use.

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

### speak

Output to the user.

{% raw %}
```json
{
  "id": "speak",
  "type": "speak",
  "name": "Tell User",
  "config": {
    "text": "{{summary}}"
  }
}
```
{% endraw %}

### activity

Log a custom activity.

{% raw %}
```json
{
  "id": "log",
  "type": "activity",
  "config": {
    "type": "workflow_completed",
    "name": "Daily Standup",
    "data": { "meetingCount": "{{fetch-calendar.result.events.length}}" }
  }
}
```
{% endraw %}

---

## Variable Interpolation

{% raw %}
Use `{{expression}}` syntax to reference:

| Reference | Example |
|-----------|---------|
| Input variables | `{{input.customerName}}` |
| Node results | `{{nodeId.result}}` |
| Workflow variables | `{{variableName}}` |
| Built-ins | `{{today}}`, `{{now}}`, `{{userId}}` |

### Filters

Apply transformations with pipe syntax:

```
{{data | json}}           → JSON stringify
{{text | uppercase}}      → Uppercase
{{list | first}}          → First item
{{number | round}}        → Round number
{{date | format('MMM d')}} → Format date
```
{% endraw %}

---

## Error Handling

### Per-Node Error Handling

```json
{
  "id": "risky",
  "type": "webhook",
  "config": { ... },
  "onError": {
    "type": "goto",
    "targetNodeId": "error-handler"
  }
}
```

### Retry Policy

```json
{
  "id": "flaky",
  "type": "webhook",
  "config": { ... },
  "retry": {
    "maxAttempts": 3,
    "backoffMs": 1000,
    "backoffMultiplier": 2
  }
}
```

---

## Related

- [Workflow Engine Guide](/dev-blog/workflow-engine-guide/) — Full tutorial
- [MCP Servers API](/developers/api/mcp-servers/) — Use MCP tools in workflows
- [Webhooks API](/developers/api/webhooks/) — Trigger workflows from events
