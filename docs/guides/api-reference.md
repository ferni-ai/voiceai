# API Reference

Ferni Voice AI Platform API Documentation

## Base URLs

| Service | Default Port | Description |
|---------|--------------|-------------|
| Token Server | 3001 | LiveKit tokens, Spotify OAuth |
| UI Server | 3002 | Engagement APIs, Plaid integration |
| Frontend Dev | 3004 | Vite dev server (proxies to above) |

---

## Authentication

APIs use device-based identification. Include the user ID in requests:

```
# Query parameter
?userId=device-123-abc

# Header
X-User-Id: device-123-abc
```

Default user: `demo-user` if not provided.

---

## Token Server Endpoints

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-12-06T10:00:00.000Z"
}
```

---

### GET /token-url

Get the LiveKit WebSocket URL.

**Response:**
```json
{
  "url": "wss://your-livekit-server.livekit.cloud"
}
```

---

### GET /token

Generate a LiveKit access token for joining a room.

**Query Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| room | Yes | Room name to join |
| username | Yes | Display name for participant |
| device_id | No | Persistent device identifier |
| persona_id | No | AI persona to use (default: `jack-bogle`) |

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "url": "wss://livekit-server.cloud",
  "room": "room-name",
  "username": "User",
  "persona_id": "ferni",
  "spotify_linked": false
}
```

---

### GET /spotify/login

Start Spotify OAuth flow.

**Query Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| device_id | Yes | Device identifier for token storage |
| return_url | No | URL to redirect after auth |

**Response:** Redirects to Spotify authorization page.

---

### GET /spotify/callback

OAuth callback from Spotify. Internal use only.

---

### GET /spotify/status

Check Spotify connection status for a device.

**Query Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| device_id | Yes | Device identifier |

**Response:**
```json
{
  "linked": true,
  "has_valid_token": true,
  "needs_refresh": false,
  "login_url": "/spotify/login?device_id=..."
}
```

---

### POST /spotify/disconnect

Disconnect Spotify account from device.

**Query Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| device_id | Yes | Device identifier |

**Response:**
```json
{
  "success": true,
  "message": "Spotify disconnected"
}
```

---

## Engagement API Endpoints

All engagement endpoints are served from the UI Server.

### GET /api/conversations

Get conversation history for a user.

**Query Parameters:**
| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| userId | No | demo-user | User identifier |
| limit | No | 50 | Max sessions to return |

**Response:**
```json
{
  "sessions": [
    {
      "id": "session-123",
      "startedAt": "2024-12-06T10:00:00.000Z",
      "duration": 15,
      "personaId": "ferni",
      "topicsDiscussed": ["investing", "goals"],
      "keyMoments": []
    }
  ],
  "totalSessions": 42,
  "totalMinutes": 630,
  "insightCount": 15
}
```

---

### GET /api/analytics/user

Get user progress analytics.

**Query Parameters:**
| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| userId | No | demo-user | User identifier |

**Response:**
```json
{
  "totalDays": 30,
  "totalRituals": 45,
  "currentLongestStreak": 7,
  "averageMood": 4.2,
  "predictionAccuracy": 78,
  "streakTrends": [
    { "date": "2024-12-06", "count": 1, "ritualId": "...", "personaId": "..." }
  ],
  "moodTrends": [
    { "date": "2024-12-06", "mood": "sunny", "energy": "high" }
  ],
  "predictionTrends": [
    { "date": "2024-12-01", "accuracy": 85, "totalPredictions": 5 }
  ],
  "bestDay": "Tuesday",
  "mostConsistentRitual": "Morning Sky Check",
  "improvementAreas": ["Some rituals could use more consistency"]
}
```

---

### GET /api/predictions

Get user predictions.

**Query Parameters:**
| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| userId | No | demo-user | User identifier |
| limit | No | 20 | Max predictions to return |

**Response:**
```json
{
  "predictions": [
    {
      "id": "pred-123",
      "predictions": { "Mood average (1-10)": 7 },
      "weekOf": "2024-12-01",
      "createdAt": "2024-12-01T10:00:00.000Z",
      "completedAt": null,
      "accuracy": null,
      "status": "pending"
    }
  ],
  "stats": {
    "totalPredictions": 15,
    "averageAccuracy": 72,
    "pendingCount": 3,
    "expiredCount": 2
  }
}
```

---

### POST /api/predictions/:id/actuals

Submit actual values for a prediction.

**URL Parameters:**
| Parameter | Description |
|-----------|-------------|
| id | Prediction ID |

**Request Body:**
```json
{
  "userId": "device-123",
  "actuals": {
    "Mood average (1-10)": 8,
    "Deep work hours": 6
  }
}
```

**Response:**
```json
{
  "id": "pred-123",
  "accuracy": 85,
  "completedAt": "2024-12-06T10:00:00.000Z"
}
```

---

### GET /api/cognitive/memories

Get "What I've Learned" - memories the AI has formed about the user.

**Query Parameters:**
| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| userId | No | demo-user | User identifier |

**Response:**
```json
{
  "memories": [
    {
      "id": "mem-123",
      "type": "fact|preference|goal|pattern|relationship",
      "content": "Prefers index funds over individual stocks",
      "confidence": 0.85,
      "source": "Ferni",
      "learnedAt": "2024-12-01T10:00:00.000Z",
      "personaId": "ferni"
    }
  ],
  "patterns": [
    {
      "id": "pat-123",
      "pattern": "You prefer direct, to-the-point communication",
      "frequency": 10,
      "examples": [],
      "category": "communication"
    }
  ],
  "totalInteractions": 42,
  "knowledgeScore": 65
}
```

---

### DELETE /api/cognitive/memories/:id

Delete (forget) a specific memory.

**URL Parameters:**
| Parameter | Description |
|-----------|-------------|
| id | Memory ID (URL-encoded) |

**Query Parameters:**
| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| userId | No | demo-user | User identifier |

**Response:**
```json
{
  "success": true,
  "memoryId": "mem-123",
  "source": "persona_memory"
}
```

---

### GET /api/rituals

Get user's rituals and streaks.

**Query Parameters:**
| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| userId | No | demo-user | User identifier |

**Response:**
```json
{
  "activeRituals": ["ferni-sky-check", "ritual-custom-123"],
  "streaks": [
    {
      "ritualId": "ferni-sky-check",
      "personaId": "ferni",
      "currentStreak": 7,
      "longestStreak": 14,
      "lastCompletedAt": "2024-12-06T10:00:00.000Z",
      "totalCompletions": 45
    }
  ],
  "weatherHistory": [
    {
      "date": "2024-12-06",
      "weather": { "primary": "sunny", "energy": "high", "note": "Great day!" },
      "ritualId": "ferni-sky-check"
    }
  ],
  "stats": {
    "totalRitualDays": 45,
    "longestOverallStreak": 21,
    "totalSkyChecks": 30
  }
}
```

---

### POST /api/rituals

Create a new ritual.

**Request Body:**
```json
{
  "userId": "device-123",
  "ritual": {
    "personaId": "ferni",
    "name": "Evening Reflection"
  }
}
```

**Response:**
```json
{
  "success": true,
  "ritualId": "ritual-1701856800000-abc123"
}
```

---

### DELETE /api/rituals/:id

Delete a ritual.

**URL Parameters:**
| Parameter | Description |
|-----------|-------------|
| id | Ritual ID |

**Query Parameters:**
| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| userId | No | demo-user | User identifier |

**Response:**
```json
{
  "success": true,
  "ritualId": "ritual-123"
}
```

---

### POST /api/rituals/:id/complete

Mark a ritual as completed for today.

**URL Parameters:**
| Parameter | Description |
|-----------|-------------|
| id | Ritual ID |

**Request Body:**
```json
{
  "userId": "device-123",
  "weather": {
    "primary": "sunny",
    "energy": "high",
    "note": "Feeling great today"
  }
}
```

**Response:**
```json
{
  "success": true,
  "streak": 8,
  "longestStreak": 14,
  "totalCompletions": 46,
  "celebration": {
    "type": "milestone",
    "milestone": 7,
    "message": "One whole week. The habit is taking root."
  }
}
```

**Celebration Types:**
- `milestone` - Hit a streak milestone (3, 7, 14, 21, 30, 60, 90, 100, 365)
- `personal_best` - New longest streak

---

### GET /api/huddles

Get team huddle history.

**Query Parameters:**
| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| userId | No | demo-user | User identifier |

**Response:**
```json
{
  "totalHuddles": 5,
  "lastHuddleAt": "2024-12-05T10:00:00.000Z",
  "recentHuddles": []
}
```

---

### GET /api/export/categories

Get exportable data categories.

**Query Parameters:**
| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| userId | No | demo-user | User identifier |

**Response:**
```json
{
  "categories": [
    { "id": "conversations", "name": "Conversations", "count": 42 },
    { "id": "rituals", "name": "Rituals & Streaks", "count": 45 },
    { "id": "predictions", "name": "Predictions", "count": 15 },
    { "id": "memories", "name": "What I've Learned", "count": 28 }
  ]
}
```

---

### POST /api/export

Export user data.

**Request Body:**
```json
{
  "userId": "device-123",
  "format": "json",
  "categories": ["conversations", "rituals"]
}
```

**Response:** File download with appropriate Content-Type.

**Formats:**
- `json` - JSON file
- `csv` - CSV file

---

### DELETE /api/export/all

Delete all user data (GDPR request).

**Request Body:**
```json
{
  "userId": "device-123",
  "confirmDelete": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "All data deleted"
}
```

**Note:** `confirmDelete: true` is required for safety.

---

### GET /api/relationship/progress

Get relationship stage with AI.

**Query Parameters:**
| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| userId | No | demo-user | User identifier |

**Response:**
```json
{
  "stage": "friend",
  "stageNumber": 4,
  "engagementScore": 35,
  "nextStageAt": 50,
  "progress": 70,
  "stats": {
    "totalConversations": 25,
    "totalRitualDays": 5,
    "lastEngagement": "2024-12-06T10:00:00.000Z"
  }
}
```

**Relationship Stages:**
| Stage | Number | Score Required |
|-------|--------|----------------|
| stranger | 1 | 0 |
| familiar | 2 | 5 |
| acquaintance | 3 | 10 |
| friend | 4 | 25 |
| confidant | 5 | 50 |
| family | 6 | 100 |

---

## Agent Health Endpoints

Available on the agent's health check server (default port 8080).

### GET /health

Agent health check.

**Response:**
```json
{
  "status": "ok",
  "service": "voice-agent",
  "timestamp": "2024-12-06T10:00:00.000Z"
}
```

---

### GET /api/cognitive

Get current cognitive state.

**Response:**
```json
{
  "success": true,
  "data": {
    "currentEmotion": "engaged",
    "confidence": 0.85,
    "topics": ["investing"],
    "sessionId": "session-123"
  },
  "timestamp": "2024-12-06T10:00:00.000Z"
}
```

---

### GET /api/cognitive/history

Get cognitive event history.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "type": "emotion_detected",
      "value": "curious",
      "timestamp": "2024-12-06T10:00:00.000Z"
    }
  ],
  "count": 25,
  "timestamp": "2024-12-06T10:00:00.000Z"
}
```

---

### GET /api/metrics

Get full persistence metrics snapshot.

**Response:**
```json
{
  "success": true,
  "data": {
    "activeSessions": 3,
    "totalOperations": 1250,
    "errorRate": 0.02,
    "currentSessions": []
  },
  "timestamp": "2024-12-06T10:00:00.000Z"
}
```

---

### GET /api/metrics/summary

Get concise metrics summary.

---

### GET /api/metrics/sessions

Get active sessions only.

---

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "error": "Error message",
  "message": "Detailed description (optional)"
}
```

**Common HTTP Status Codes:**
| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Missing/invalid parameters |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |
| 503 | Service Unavailable - Feature not configured |

---

## Rate Limiting

Currently no rate limiting is enforced. See `docs/security-review.md` for recommendations.

---

## CORS

All APIs allow cross-origin requests (`Access-Control-Allow-Origin: *`).

For production, restrict to specific frontend origins.
