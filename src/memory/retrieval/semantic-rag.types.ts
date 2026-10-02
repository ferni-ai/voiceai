/**
 * Semantic RAG - types
 *
 * @module memory/retrieval/semantic-rag.types
 */

/**
 * RAG search result
 */
export interface RAGResult {
  content: string;
  source: string;
  category?: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * RAG context for injection into prompts
 */
export interface RAGContext {
  results: RAGResult[];
  formattedContext: string;
  queryEmbedding?: number[];
}

/**
 * RAG result with natural language explanation
 */
export interface ExplainedRAGResult extends RAGResult {
  /** Natural language explanation of why this was retrieved */
  explanation?: string;
  /** Suggested way to reference this in conversation */
  suggestedReference?: string;
}

/**
 * Enhanced RAG context with explanations
 */
export interface ExplainedRAGContext extends RAGContext {
  explainedResults: ExplainedRAGResult[];
}
