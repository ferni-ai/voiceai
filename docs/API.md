# Ferni API Documentation

Generated automatically from route handlers.

## Table of Contents

- [Analytics](#analytics)
- [Conversations](#conversations)
- [Data](#data)
- [Games](#games)
- [Memories](#memories)
- [Predictions](#predictions)
- [Relationship](#relationship)
- [Rituals](#rituals)
- [Team](#team)

---

## Analytics

File: `src/api/routes/analytics.ts`

### `GET /api/analytics/user`

GET /api/analytics/user - Get user progress analytics

---

## Conversations

File: `src/api/routes/conversations.ts`

### `GET /api/conversations`

GET /api/conversations - Get conversation history

---

## Data

File: `src/api/routes/data.ts`

### `GET /api/export/categories`

GET /api/export/categories - Get exportable categories

---

### `POST /api/export`

POST /api/export - Export user data

---

### `DELETE /api/export/all`

DELETE /api/export/all - GDPR data deletion

---

## Games

File: `src/api/routes/games.ts`

### `GET /api/games/insights`

Get music game insights for the "Musical You" dashboard.

**Query Parameters:**
- `userId` (required): User ID

**Response:**
```json
{
  "success": true,
  "insights": {
    "personality": {
      "title": "The Nostalgic Explorer",
      "description": "You love classic hits...",
      "traits": ["80s enthusiast", "quick guesser"]
    },
    "strengths": [
      { "area": "1980s", "accuracy": 85, "description": "Your best decade!" }
    ],
    "growthAreas": [
      { "area": "2010s", "accuracy": 45, "suggestion": "Try more recent hits" }
    ],
    "journey": {
      "totalGames": 15,
      "totalRounds": 87,
      "bestStreak": 5,
      "currentStreak": 2
    },
    "milestones": [
      { "type": "first_perfect", "date": "2025-12-01", "details": "..." }
    ]
  }
}
```

---

### `GET /api/games/suggestion`

Get a personalized game suggestion based on user history.

**Query Parameters:**
- `userId` (required): User ID

**Response:**
```json
{
  "success": true,
  "suggestion": {
    "gameType": "name-that-tune",
    "reason": "It's been a while since we played!",
    "message": "How about a quick Name That Tune?"
  }
}
```

---

### `GET /api/games/conversational`

Get a short conversational insight for the agent to share naturally.

**Query Parameters:**
- `userId` (required): User ID

**Response:**
```json
{
  "success": true,
  "insight": "You've got an amazing ear for 80s music!"
}
```

**Rate Limiting:**
- 30 requests per minute per user
- Returns 429 with `Retry-After: 60` when exceeded

---

## Memories

File: `src/api/routes/memories.ts`

### `GET /api/cognitive/memories`

GET /api/cognitive/memories - What I've Learned

---

### `DELETE /api/cognitive/memories/:id`

DELETE /api/cognitive/memories/:id - Forget a specific memory

---

## Predictions

File: `src/api/routes/predictions.ts`

### `GET /api/predictions`

GET /api/predictions - Get user predictions

---

### `POST /api/predictions/:id/actuals`

POST /api/predictions/:id/actuals - Update prediction with actual values

---

## Relationship

File: `src/api/routes/relationship.ts`

### `GET /api/relationship/progress`

GET /api/relationship/progress - Get relationship progress

---

## Rituals

File: `src/api/routes/rituals.ts`

### `GET /api/rituals`

GET /api/rituals - Get user rituals

---

### `POST /api/rituals`

POST /api/rituals - Create a ritual

---

### `DELETE /api/rituals/:id`

DELETE /api/rituals/:id - Delete a ritual

---

### `POST /api/rituals/:id/complete`

POST /api/rituals/:id/complete - Complete a ritual

---

## Team

File: `src/api/routes/team.ts`

### `GET /api/huddles`

GET /api/huddles - Get team huddles

---


## Authentication

All routes support multiple authentication methods:

1. **API Key**: `X-API-Key: <your-key>`
2. **Bearer Token**: `Authorization: Bearer <jwt>`
3. **Query Parameter**: `?user_id=<id>` (development only)

## Common Response Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad request / validation error |
| 401 | Unauthorized |
| 404 | Resource not found |
| 500 | Internal server error |

---

*Last updated: December 13, 2024*

> Note: This is a subset of the API. For complete API documentation, see:
> - `docs/API-DOCUMENTATION.md` for full reference
> - `src/api/` for route implementations
> - Observability routes: `/api/observability/*`
> - Trust routes: `/api/trust/*`
> - Voice identity: `/api/voice/*`
