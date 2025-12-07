# Local Development Setup

## Quick Start (In-Memory - No Setup)

```bash
# Just run it - uses in-memory store automatically
PERSONA_ID=jack-bogle npm run dev
```

## With Persistent Storage (Recommended)

### 1. Start Local Services

```bash
# Start PostgreSQL and Redis
docker compose -f docker-compose.local.yml up -d
```

### 2. Create `.env.local`

```env
# Required - Core Services
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
GOOGLE_API_KEY=your-google-ai-key
CARTESIA_API_KEY=your-cartesia-key

# Persona
PERSONA_ID=jack-bogle

# Local Persistence
DATABASE_URL=postgresql://voiceai:localdev@localhost:5432/voiceai
REDIS_URL=redis://localhost:6379
```

### 3. Run the Agent

```bash
npm run dev
```

## Verify Services

```bash
# Check PostgreSQL
psql postgresql://voiceai:localdev@localhost:5432/voiceai -c "SELECT 1"

# Check Redis
redis-cli ping
```

## Stop Services

```bash
docker compose -f docker-compose.local.yml down
```

## Reset Data

```bash
# Remove all data and start fresh
docker compose -f docker-compose.local.yml down -v
docker compose -f docker-compose.local.yml up -d
```

