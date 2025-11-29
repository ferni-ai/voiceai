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

