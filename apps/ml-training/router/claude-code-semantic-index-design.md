# Semantic Codebase Index for Claude Code

> Design document for adding Cursor-style semantic search to Claude Code

## Overview

Add a local semantic index that enables Claude Code to find relevant code by meaning, not just keywords. This would dramatically improve codebase exploration for large projects.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Claude Code Process                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │   Indexer    │    │  Query API   │    │   MCP Server         │  │
│  │  (background)│    │              │    │ (optional external)  │  │
│  └──────┬───────┘    └──────┬───────┘    └──────────┬───────────┘  │
│         │                   │                       │               │
│         ▼                   ▼                       ▼               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Index Manager                             │   │
│  │  - Merkle tree for change detection                         │   │
│  │  - File watcher for real-time updates                       │   │
│  │  - Priority queue for indexing                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│         ┌────────────────────┼────────────────────┐                │
│         ▼                    ▼                    ▼                │
│  ┌────────────┐      ┌────────────┐      ┌────────────────┐       │
│  │ AST Chunker│      │ Embedder   │      │  Vector Store  │       │
│  │(tree-sitter)│      │ (local)    │      │  (SQLite+vec)  │       │
│  └────────────┘      └────────────┘      └────────────────┘       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. AST-Based Chunker (tree-sitter)

**Why AST over naive splitting:**
- Preserves semantic boundaries (functions, classes, methods)
- Respects language syntax
- Better embedding quality when chunks are coherent units

**Implementation:**
```typescript
interface CodeChunk {
  id: string;              // hash of content
  filePath: string;
  language: string;
  chunkType: 'function' | 'class' | 'method' | 'module' | 'block';
  name: string;            // function/class name
  startLine: number;
  endLine: number;
  content: string;
  signature?: string;      // e.g., "async function processUser(id: string): Promise<User>"
  parentChunk?: string;    // for nested structures
}
```

**Chunking strategy:**
1. Parse file with tree-sitter
2. Extract top-level declarations (functions, classes, interfaces)
3. For large classes, also extract individual methods
4. Include docstrings/comments with their associated code
5. Cap chunks at ~1000 tokens (embedding model limit)

**Supported languages (via tree-sitter):**
- TypeScript/JavaScript
- Python
- Rust
- Go
- Java
- Swift
- C/C++
- Ruby
- PHP

### 2. Local Embedding Model

**Options (ranked by quality/speed tradeoff):**

| Model | Dimensions | Speed | Quality | Size |
|-------|------------|-------|---------|------|
| `nomic-embed-text` (Ollama) | 768 | Fast | Good | 274MB |
| `bge-small-en-v1.5` | 384 | Very fast | Good | 133MB |
| `all-MiniLM-L6-v2` | 384 | Very fast | OK | 80MB |
| `CodeBERT` | 768 | Medium | Best for code | 440MB |

**Recommendation:** `nomic-embed-text` via Ollama
- Runs locally (privacy)
- No API costs
- Good code understanding
- Fast enough for real-time queries

**Implementation:**
```typescript
interface EmbeddingService {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

// Ollama implementation
class OllamaEmbedder implements EmbeddingService {
  private model = 'nomic-embed-text';

  async embed(text: string): Promise<number[]> {
    const response = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      body: JSON.stringify({ model: this.model, prompt: text })
    });
    return (await response.json()).embedding;
  }
}
```

### 3. Vector Store (SQLite + sqlite-vec)

**Why SQLite:**
- Zero setup - just a file
- Portable across platforms
- Fast for <1M vectors
- `sqlite-vec` extension adds vector operations

**Schema:**
```sql
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  language TEXT,
  chunk_type TEXT,
  name TEXT,
  start_line INTEGER,
  end_line INTEGER,
  content TEXT,
  signature TEXT,
  parent_id TEXT,
  content_hash TEXT,
  indexed_at INTEGER,
  FOREIGN KEY (parent_id) REFERENCES chunks(id)
);

CREATE VIRTUAL TABLE chunk_embeddings USING vec0(
  id TEXT PRIMARY KEY,
  embedding FLOAT[768]
);

CREATE INDEX idx_chunks_file ON chunks(file_path);
CREATE INDEX idx_chunks_type ON chunks(chunk_type);
CREATE INDEX idx_chunks_name ON chunks(name);

-- Merkle tree for incremental updates
CREATE TABLE file_hashes (
  file_path TEXT PRIMARY KEY,
  content_hash TEXT,
  last_indexed INTEGER
);

CREATE TABLE directory_hashes (
  dir_path TEXT PRIMARY KEY,
  subtree_hash TEXT
);
```

**Query:**
```sql
-- Semantic search with metadata filtering
SELECT c.*, vec_distance_cosine(e.embedding, ?) as distance
FROM chunks c
JOIN chunk_embeddings e ON c.id = e.id
WHERE c.language = 'typescript'
  AND c.chunk_type IN ('function', 'method')
ORDER BY distance
LIMIT 20;
```

### 4. Merkle Tree for Incremental Updates

**Why Merkle tree:**
- O(log n) change detection
- Only re-index modified files
- Efficient sync with minimal comparisons

**Implementation:**
```typescript
interface MerkleNode {
  path: string;
  hash: string;
  children?: MerkleNode[];
}

class MerkleTree {
  private root: MerkleNode;

  // Compute hash of directory = hash(sorted children hashes)
  computeDirectoryHash(dirPath: string): string {
    const children = fs.readdirSync(dirPath);
    const childHashes = children
      .map(child => this.getNodeHash(path.join(dirPath, child)))
      .sort();
    return crypto.createHash('sha256')
      .update(childHashes.join(''))
      .digest('hex');
  }

  // Find changed files by comparing trees
  diff(oldTree: MerkleNode, newTree: MerkleNode): string[] {
    if (oldTree.hash === newTree.hash) return [];

    // If hashes differ, recurse into children
    const changes: string[] = [];
    // ... recursive diff logic
    return changes;
  }
}
```

### 5. Index Manager

**Responsibilities:**
- Background indexing on project open
- File watcher for real-time updates
- Priority queue (recently edited files first)
- Graceful degradation if Ollama not available

**Configuration:**
```yaml
# .claude/semantic-index.yaml
enabled: true
embedding_model: nomic-embed-text
index_path: .claude/index.db
exclude_patterns:
  - node_modules/**
  - dist/**
  - .git/**
  - "*.min.js"
max_file_size: 100kb
chunk_size_tokens: 1000
update_interval: 30s  # debounce file changes
```

### 6. Query API (New Tool)

**Tool Definition:**
```typescript
interface SemanticSearchTool {
  name: 'SemanticSearch';
  description: 'Search codebase by semantic meaning, not just keywords';
  parameters: {
    query: string;           // Natural language query
    filters?: {
      languages?: string[];  // e.g., ['typescript', 'python']
      chunkTypes?: string[]; // e.g., ['function', 'class']
      paths?: string[];      // e.g., ['src/services/**']
    };
    limit?: number;          // Default 10
    includeContent?: boolean; // Return full chunk content
  };
}
```

**Example usage:**
```
User: "Find code that handles rate limiting"

SemanticSearch({
  query: "rate limiting throttling request limits",
  filters: { chunkTypes: ['function', 'class'] },
  limit: 10
})

Returns:
[
  { file: 'src/middleware/rate-limiter.ts', name: 'RateLimiter', score: 0.92 },
  { file: 'src/api/throttle.ts', name: 'throttleRequests', score: 0.87 },
  { file: 'src/utils/backoff.ts', name: 'exponentialBackoff', score: 0.71 },
]
```

## Integration with Existing Tools

### Enhanced Grep
```typescript
// Current: exact text search
Grep({ pattern: "rate limit" })

// Enhanced: falls back to semantic if no exact matches
Grep({
  pattern: "rate limit",
  semantic_fallback: true  // If <3 results, also do semantic search
})
```

### Enhanced Explore Agent
```typescript
// The Explore agent could use SemanticSearch as its first step
// before falling back to Glob/Grep for more specific searches
```

## Privacy & Security

1. **All processing is local** - no code leaves the machine
2. **Embeddings stored locally** - in project's `.claude/` directory
3. **Ollama runs locally** - no API calls
4. **Index is gitignored** - `.claude/index.db` in `.gitignore`

## Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Initial indexing | <30s for 10k files | Background, non-blocking |
| Incremental update | <100ms per file | Triggered by file save |
| Semantic query | <50ms | Vector similarity search |
| Memory overhead | <100MB | Index + embedding model |

## Implementation Phases

### Phase 1: Core Infrastructure (MVP)
- [ ] tree-sitter chunker for TypeScript/Python
- [ ] Ollama embedding integration
- [ ] SQLite + sqlite-vec store
- [ ] Basic SemanticSearch tool
- [ ] Manual indexing command

### Phase 2: Incremental Updates
- [ ] Merkle tree implementation
- [ ] File watcher integration
- [ ] Background indexing
- [ ] Index persistence

### Phase 3: Enhanced Integration
- [ ] Grep semantic fallback
- [ ] Explore agent integration
- [ ] Multi-language support (Rust, Go, Java)
- [ ] Hybrid search (BM25 + semantic)

### Phase 4: Advanced Features
- [ ] Code symbol graph (call relationships)
- [ ] Cross-file reference tracking
- [ ] "Find usages" semantic search
- [ ] Index sharing (for teams)

## Alternatives Considered

### MCP Server Approach
Could implement as an MCP server that Claude Code connects to:
```json
{
  "mcpServers": {
    "codebase-index": {
      "command": "npx",
      "args": ["@anthropic/codebase-index-mcp"]
    }
  }
}
```
**Pros:** Decoupled, reusable
**Cons:** Extra process, IPC overhead

### Cloud Embeddings (like Cursor)
**Pros:** Better embedding quality
**Cons:** Privacy concerns, API costs, latency

### Full Graph RAG
Build a knowledge graph of code relationships:
**Pros:** Richer understanding
**Cons:** Much more complex, slower indexing

## Open Questions

1. **Embedding model choice**: Test CodeBERT vs nomic-embed-text on code retrieval benchmarks
2. **Chunk size optimization**: What's the sweet spot for code chunks?
3. **Hybrid search**: Should we combine BM25 (keyword) + semantic by default?
4. **Index format**: SQLite or something more specialized like LanceDB?
5. **Multi-repo support**: How to handle monorepos or linked packages?

## References

- [How Cursor Indexes Codebases](https://read.engineerscodex.com/p/how-cursor-indexes-codebases-fast)
- [Building RAG on Codebases](https://lancedb.com/blog/building-rag-on-codebases-part-1/)
- [tree-sitter](https://tree-sitter.github.io/tree-sitter/)
- [sqlite-vec](https://github.com/asg017/sqlite-vec)
- [Ollama embeddings](https://ollama.ai/library/nomic-embed-text)
