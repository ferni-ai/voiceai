# Ferni API Documentation

Generated automatically from route handlers.

## Table of Contents

- [Analytics](#analytics)
- [Conversations](#conversations)
- [Data](#data)
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

*Last updated: 2025-12-07*
