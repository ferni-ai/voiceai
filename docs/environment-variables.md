# Environment Variables

This document describes the environment variables used by the John Bogle Voice AI Agent.

## Core LiveKit Variables

```bash
# LiveKit server configuration
LIVEKIT_URL=wss://your-livekit-server.com
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
```

## AI Provider Variables

```bash
# Google AI (for Gemini)
GOOGLE_API_KEY=your-google-api-key
GOOGLE_PROJECT_ID=your-project-id  # For Vertex AI

# OpenAI (for embeddings if using OpenAI)
OPENAI_API_KEY=your-openai-api-key

# Cartesia (for TTS)
CARTESIA_API_KEY=your-cartesia-api-key
```

## Memory System Variables

```bash
# Embedding provider: 'google' (default), 'openai', or 'local'
EMBEDDING_PROVIDER=google

# Google Embedding settings (if using Google)
GOOGLE_EMBEDDING_MODEL=gemini-embedding-001
GOOGLE_EMBEDDING_DIMENSIONS=768

# OpenAI Embedding settings (if using OpenAI)
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_DIMENSIONS=1536

# Vector store configuration
VECTOR_STORE_TYPE=memory  # 'memory' for dev, 'pinecone' or 'weaviate' for production

# Pinecone (if using Pinecone for vector store)
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_ENVIRONMENT=your-environment
PINECONE_INDEX=bogle-knowledge

# Memory persistence (for production)
DATABASE_URL=postgresql://user:pass@host:5432/bogle
REDIS_URL=redis://localhost:6379
```

## Communication Services

```bash
# SendGrid (Email)
SENDGRID_API_KEY=your-sendgrid-api-key
SENDGRID_FROM_EMAIL=jack@bogle-advisor.com

# Twilio (SMS)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+15551234567

# Google Calendar API
GOOGLE_CALENDAR_CREDENTIALS={"client_id":"...","client_secret":"...","refresh_token":"..."}
GOOGLE_CALENDAR_ID=primary
```

## Banking (Plaid)

```bash
# Plaid API credentials
PLAID_CLIENT_ID=your-plaid-client-id
PLAID_SECRET=your-plaid-secret
PLAID_ENV=sandbox  # sandbox, development, or production

# URL to your hosted Plaid Link page (for voice flow - link sent via SMS/email)
PLAID_LINK_BASE_URL=https://your-app.com/link-account
```

## Spotify Integration

```bash
# Spotify API credentials (for music playback)
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
# Note: SPOTIFY_REFRESH_TOKEN is managed automatically via .spotify-tokens.json
```

## Telephony (Outbound Calls)

```bash
# LiveKit SIP integration for outbound calls
SIP_TRUNK_ID=your-livekit-sip-trunk-id
CALLER_ID=+15551234567  # Your outbound caller ID (must be verified)
```

## Voice Configuration

```bash
# Cartesia voice IDs (optional - defaults provided)
JACK_BOGLE_VOICE_ID=9c10dc48-8799-42f9-a72a-0c7dfe13a06d
PETER_LYNCH_VOICE_ID=dbaa36ed-1b01-4db4-874d-33b6491a4905
```

## Agent Configuration

```bash
# Agent name (for telephony routing)
AGENT_NAME=john-bogle-agent

# Health check port (for Cloud Run)
PORT=8080

# Logging level
LOG_LEVEL=info  # debug, info, warn, error
```

## Feature Flags

```bash
# Enable/disable features
ENABLE_SEMANTIC_RAG=true
ENABLE_EMOTION_DETECTION=true
ENABLE_INTENT_CLASSIFICATION=true
ENABLE_ADAPTIVE_SSML=true
ENABLE_PERSISTENT_MEMORY=true
ENABLE_CROSS_SESSION_CONTINUITY=true
```

## Development vs Production

### Development (.env.local)
```bash
EMBEDDING_PROVIDER=local  # Use placeholder embeddings
VECTOR_STORE_TYPE=memory  # In-memory store
LOG_LEVEL=debug
```

### Production (.env.production)
```bash
EMBEDDING_PROVIDER=google
VECTOR_STORE_TYPE=pinecone
ENABLE_PERSISTENT_MEMORY=true
DATABASE_URL=postgresql://...
LOG_LEVEL=info
```

## Quick Start

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in required variables:
   - `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
   - `GOOGLE_API_KEY` (for Gemini LLM and embeddings)
   - `CARTESIA_API_KEY` (for TTS)

3. For development, the memory system will use in-memory stores automatically.

4. For production, configure:
   - Database connection (`DATABASE_URL`)
   - Vector store (`PINECONE_API_KEY` or similar)
   - Redis for caching (`REDIS_URL`)

5. Optional services (features degrade gracefully if not configured):
   - **Email**: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`
   - **SMS**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
   - **Calendar**: `GOOGLE_CALENDAR_CREDENTIALS`, `GOOGLE_CALENDAR_ID`
   - **Banking**: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `PLAID_LINK_BASE_URL`
   - **Music**: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`
   - **Outbound Calls**: `SIP_TRUNK_ID`, `CALLER_ID`
   - **Custom Voices**: `JACK_BOGLE_VOICE_ID`, `PETER_LYNCH_VOICE_ID`

