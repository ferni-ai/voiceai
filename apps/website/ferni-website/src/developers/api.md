---
layout: layouts/docs.njk
title: API Reference
description: REST endpoints for agent management and voice integration
order: 2
---

## Base URL

```
http://localhost:3000/api
```

## Agents

Endpoints for managing AI agents in your team.

### List All Agents

```http
GET /api/agents
```

Returns all enabled agents with UI-ready data.

**Response:**

```json
{
  "agents": [
    {
      "id": "ferni",
      "name": "Ferni",
      "description": "Your AI life coach",
      "subtitle": "Life Coach",
      "enabled": true,
      "colors": {
        "primary": "#4a6741",
        "secondary": "#3d5a35"
      }
    }
  ],
  "total": 7
}
```

### Get Agent Details

```http
GET /api/agents/:id
```

Get detailed information for a specific agent by ID or alias.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Agent ID or alias (e.g., "ferni", "jack-bogle") |

**Response:**

```json
{
  "id": "ferni",
  "name": "Ferni",
  "description": "Your AI life coach",
  "personality": {
    "warmth": 0.85,
    "energy": 0.7,
    "directness": 0.6
  },
  "voice": {
    "provider": "cartesia",
    "voiceId": "..."
  },
  "team": {
    "handoff_triggers": ["life", "coach", "help"],
    "can_handoff_to": ["jack", "maya", "jordan"]
  }
}
```

### Enable/Disable Agent

```http
POST /api/agents/:id/enable
```

Enable or disable an agent in the team roster.

**Request Body:**

```json
{
  "enabled": true
}
```

### Update Agent

```http
PUT /api/agents/:id
```

Update agent settings like colors, subtitle, or display name.

**Request Body:**

```json
{
  "subtitle": "Career Advisor",
  "colors": {
    "primary": "#4a6741",
    "secondary": "#3d5a35"
  }
}
```

## Team Management

### Update Team Order

```http
POST /api/team/order
```

Update the display order of agents in the team roster.

**Request Body:**

```json
{
  "order": ["ferni", "jack", "maya", "peter", "alex", "jordan"]
}
```

## Validation

### Validate All Bundles

```http
POST /api/agents/validate
```

Run validation on all agent bundles. Returns errors and warnings.

**Response:**

```json
{
  "valid": true,
  "results": [
    {
      "id": "ferni",
      "valid": true,
      "errors": [],
      "warnings": []
    },
    {
      "id": "my-advisor",
      "valid": false,
      "errors": ["Missing required field: voice.voiceId"],
      "warnings": ["No stories defined"]
    }
  ]
}
```

## Voice

### Preview Voice

```http
GET /api/voice/preview/:voiceId
```

Get Cartesia playground URL for previewing a voice.

**Response:**

```json
{
  "url": "https://play.cartesia.ai/...",
  "voiceId": "a0e99841-438c-4a64-b679-ae501e7d6091"
}
```

## WebSocket Connection

For real-time voice communication, connect via WebSocket:

```javascript
// Connect to voice agent
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  // Start session with specific agent
  ws.send(JSON.stringify({
    type: 'start',
    agentId: 'ferni',
    options: {
      voice: true,
      transcript: true
    }
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle agent responses
  if (data.type === 'transcript') {
    console.log('Agent:', data.text);
  }
};
```

## Error Handling

All endpoints return standard error responses:

```json
{
  "error": true,
  "code": "AGENT_NOT_FOUND",
  "message": "Agent 'unknown-id' not found"
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AGENT_NOT_FOUND` | 404 | The requested agent ID does not exist |
| `VALIDATION_ERROR` | 400 | Request body failed validation |
| `BUNDLE_INVALID` | 400 | Agent bundle has structural errors |
| `VOICE_UNAVAILABLE` | 503 | Voice synthesis service is unavailable |

