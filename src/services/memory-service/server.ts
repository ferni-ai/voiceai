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
import { getLogger } from '../../utils/safe-logger.js';
import { getVectorStore, type VectorStore } from '../../memory/vector-store.js';
import { embed } from '../../memory/embeddings.js';
import type { VectorSearchOptions } from '../../memory/vector-store-interface.js';

const log = getLogger().child({ module: 'memory-service' });

// Lazy-loaded modules
let vectorStore: VectorStore | null = null;

async function ensureInitialized(): Promise<void> {
  if (!vectorStore) {
    log.info('Initializing vector store...');
    vectorStore = getVectorStore();
    if (!vectorStore.isInitialized) {
      await vectorStore.initialize();
    }
    log.info('Vector store initialized');
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

    // Search vector store using text query (it handles embedding internally)
    const searchOptions: VectorSearchOptions = {
      topK: request.limit || 5,
      filter: { userId: request.userId },
      minScore: request.threshold || 0.5,
    };

    const results = await vectorStore!.search(request.query, searchOptions);

    const response: RecallResponse = {
      memories: results.map((r) => ({
        content: r.document.text,
        relevance: r.score,
        timestamp:
          r.document.metadata?.timestamp instanceof Date
            ? r.document.metadata.timestamp.getTime()
            : Date.now(),
        category: r.document.metadata?.category as string | undefined,
      })),
    };

    log.info(
      {
        userId: request.userId,
        resultCount: response.memories.length,
        durationMs: Date.now() - startTime,
      },
      'Memories recalled'
    );

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
    const embedding = await embed(request.content);

    // Store in vector store using addDocument
    const id = crypto.randomUUID();
    await vectorStore!.addDocument({
      id,
      text: request.content,
      embedding,
      metadata: {
        source: 'memory-service',
        userId: request.userId,
        timestamp: new Date(),
        ...request.metadata,
      },
    });

    const response: StoreResponse = {
      id,
      success: true,
    };

    log.info(
      {
        userId: request.userId,
        memoryId: id,
        durationMs: Date.now() - startTime,
      },
      'Memory stored'
    );

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

    // Build filter
    const filter: Record<string, unknown> = { userId: request.userId };
    if (request.filters?.category) {
      filter.category = request.filters.category;
    }

    // Search using text query
    const searchOptions: VectorSearchOptions = {
      topK: request.limit || 10,
      filter,
    };

    const results = await vectorStore!.search(request.query, searchOptions);

    res.json({
      results: results.map((r) => ({
        id: r.document.id,
        content: r.document.text,
        score: r.score,
        metadata: r.document.metadata,
        timestamp:
          r.document.metadata?.timestamp instanceof Date
            ? r.document.metadata.timestamp.getTime()
            : undefined,
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

    let deletedCount = 0;
    if (memoryIds && memoryIds.length > 0) {
      for (const id of memoryIds) {
        const deleted = vectorStore!.removeDocument(id);
        if (deleted) deletedCount++;
      }
    }

    res.json({ success: true, deletedCount });
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

    // getStats() takes no arguments - returns global stats
    const stats = vectorStore!.getStats();

    res.json({
      userId,
      totalMemories: stats.documentCount || 0,
      bySource: stats.bySource || {},
      byCategory: stats.byCategory || {},
      lastUpdated: new Date().toISOString(),
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
