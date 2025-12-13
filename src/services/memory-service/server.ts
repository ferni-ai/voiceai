/**
 * Memory Service Server
 *
 * Standalone HTTP server for memory operations.
 * Provides recall, store, and search functionality.
 *
 * Usage:
 *   node dist/services/memory-service/server.js
 *   # or
 *   pnpm service:memory
 */

import express from 'express';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('memory-service');

// Lazy-loaded modules
let memoryStore: Awaited<ReturnType<typeof import('../../memory/store-factory.js').createStore>> | null = null;
let vectorStore: Awaited<ReturnType<typeof import('../../memory/vector-store.js').getVectorStore>> | null = null;
let embeddings: typeof import('../../memory/embeddings.js') | null = null;

async function ensureInitialized(): Promise<void> {
  if (!memoryStore) {
    log.info('Initializing memory store...');
    const factory = await import('../../memory/store-factory.js');
    memoryStore = await factory.createStore();
    log.info('Memory store initialized');
  }

  if (!vectorStore) {
    const vectorModule = await import('../../memory/vector-store.js');
    vectorStore = await vectorModule.getVectorStore();
    log.info('Vector store initialized');
  }

  if (!embeddings) {
    embeddings = await import('../../memory/embeddings.js');
    log.info('Embeddings initialized');
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface RecallRequest {
  userId: string;
  query: string;
  limit?: number;
  threshold?: number;
}

interface RecallResponse {
  memories: Array<{
    content: string;
    relevance: number;
    timestamp: number;
    category?: string;
  }>;
}

interface StoreRequest {
  userId: string;
  content: string;
  metadata?: Record<string, unknown>;
}

interface StoreResponse {
  id: string;
  success: boolean;
}

interface SearchRequest {
  userId: string;
  query: string;
  filters?: {
    category?: string;
    startDate?: string;
    endDate?: string;
  };
  limit?: number;
}

// ============================================================================
// SERVER
// ============================================================================

const app = express();
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'memory-service', timestamp: new Date().toISOString() });
});

// Recall memories (semantic search)
app.post('/ferni.memory.v1.MemoryService/Recall', async (req, res) => {
  const request = req.body as RecallRequest;
  const startTime = Date.now();

  log.info({ userId: request.userId, queryLength: request.query?.length }, 'Recalling memories');

  try {
    await ensureInitialized();

    // Get query embedding
    const queryEmbedding = await embeddings!.embed(request.query);

    // Search vector store
    const results = await vectorStore!.search(queryEmbedding, {
      limit: request.limit || 5,
      filter: { userId: request.userId },
    });

    // Filter by threshold
    const threshold = request.threshold || 0.5;
    const filteredResults = results.filter(r => r.score >= threshold);

    const response: RecallResponse = {
      memories: filteredResults.map(r => ({
        content: r.document.content,
        relevance: r.score,
        timestamp: r.document.timestamp || Date.now(),
        category: r.document.metadata?.category as string | undefined,
      })),
    };

    log.info({
      userId: request.userId,
      resultCount: response.memories.length,
      durationMs: Date.now() - startTime,
    }, 'Memories recalled');

    res.json(response);

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ userId: request.userId, error: err.message }, 'Failed to recall memories');
    res.status(500).json({ error: err.message });
  }
});

// Store a memory
app.post('/ferni.memory.v1.MemoryService/Store', async (req, res) => {
  const request = req.body as StoreRequest;
  const startTime = Date.now();

  log.info({ userId: request.userId, contentLength: request.content?.length }, 'Storing memory');

  try {
    await ensureInitialized();

    // Generate embedding
    const embedding = await embeddings!.embed(request.content);

    // Store in vector store
    const id = crypto.randomUUID();
    await vectorStore!.upsert({
      id,
      userId: request.userId,
      content: request.content,
      embedding,
      metadata: request.metadata || {},
      timestamp: Date.now(),
    });

    const response: StoreResponse = {
      id,
      success: true,
    };

    log.info({
      userId: request.userId,
      memoryId: id,
      durationMs: Date.now() - startTime,
    }, 'Memory stored');

    res.json(response);

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ userId: request.userId, error: err.message }, 'Failed to store memory');
    res.status(500).json({ error: err.message, success: false });
  }
});

// Search memories (with filters)
app.post('/ferni.memory.v1.MemoryService/Search', async (req, res) => {
  const request = req.body as SearchRequest;

  log.info({ userId: request.userId, query: request.query }, 'Searching memories');

  try {
    await ensureInitialized();

    // Get query embedding
    const queryEmbedding = await embeddings!.embed(request.query);

    // Build filter
    const filter: Record<string, unknown> = { userId: request.userId };
    if (request.filters?.category) {
      filter['metadata.category'] = request.filters.category;
    }

    // Search
    const results = await vectorStore!.search(queryEmbedding, {
      limit: request.limit || 10,
      filter,
    });

    res.json({
      results: results.map(r => ({
        id: r.document.id,
        content: r.document.content,
        score: r.score,
        metadata: r.document.metadata,
        timestamp: r.document.timestamp,
      })),
      totalCount: results.length,
    });

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ userId: request.userId, error: err.message }, 'Failed to search memories');
    res.status(500).json({ error: err.message });
  }
});

// Delete memories
app.post('/ferni.memory.v1.MemoryService/Delete', async (req, res) => {
  const { userId, memoryIds } = req.body;

  log.info({ userId, count: memoryIds?.length }, 'Deleting memories');

  try {
    await ensureInitialized();

    if (memoryIds && memoryIds.length > 0) {
      for (const id of memoryIds) {
        await vectorStore!.delete(id);
      }
    }

    res.json({ success: true, deletedCount: memoryIds?.length || 0 });

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ userId, error: err.message }, 'Failed to delete memories');
    res.status(500).json({ error: err.message, success: false });
  }
});

// Get memory stats
app.post('/ferni.memory.v1.MemoryService/GetStats', async (req, res) => {
  const { userId } = req.body;

  try {
    await ensureInitialized();

    const stats = await vectorStore!.getStats(userId);

    res.json({
      userId,
      totalMemories: stats?.documentCount || 0,
      totalSize: stats?.totalSize || 0,
      lastUpdated: stats?.lastUpdated || new Date().toISOString(),
    });

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ userId, error: err.message }, 'Failed to get stats');
    res.status(500).json({ error: err.message });
  }
});

// Health endpoint for gRPC style
app.post('/ferni.memory.v1.MemoryService/Health', (_req, res) => {
  res.json({
    status: 'SERVICE_HEALTH_HEALTHY',
    components: {
      vectorStore: { status: 'SERVICE_HEALTH_HEALTHY', message: 'OK', latencyMs: 1 },
      embeddings: { status: 'SERVICE_HEALTH_HEALTHY', message: 'OK', latencyMs: 1 },
    },
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// ============================================================================
// STARTUP
// ============================================================================

async function main() {
  const port = parseInt(process.env.PORT || '50053', 10);

  // Pre-initialize to catch startup errors
  await ensureInitialized();

  log.info('Memory service ready');

  app.listen(port, '0.0.0.0', () => {
    log.info({ port }, 'Memory service started');
  });
}

main().catch((error) => {
  log.error({ error: String(error) }, 'Failed to start memory service');
  process.exit(1);
});
