/**
 * BM25 Keyword Search
 *
 * Implements BM25 (Best Matching 25) algorithm for keyword-based search.
 * Complements vector semantic search for exact name/term matching.
 *
 * BM25 Formula:
 * score(D, Q) = Σ IDF(qi) * (f(qi, D) * (k1 + 1)) / (f(qi, D) + k1 * (1 - b + b * |D|/avgdl))
 *
 * Where:
 * - f(qi, D) = term frequency of qi in D
 * - |D| = document length
 * - avgdl = average document length
 * - k1 = term saturation parameter (default: 1.5)
 * - b = length normalization parameter (default: 0.75)
 *
 * @module memory/retrieval/bm25-search
 */

import { createLogger } from '../../utils/safe-logger.js';
import { tokenizeForQuery, tokenizeForIndex, calculateTermFrequency } from './tokenizer.js';

const log = createLogger({ module: 'BM25Search' });

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default BM25 parameters */
const DEFAULT_K1 = 1.5; // Term saturation parameter
const DEFAULT_B = 0.75; // Length normalization parameter

// ============================================================================
// TYPES
// ============================================================================

/**
 * BM25 search options
 */
export interface BM25SearchOptions {
  /** Maximum results to return */
  topK?: number;
  /** Minimum score threshold */
  minScore?: number;
  /** k1 parameter (term saturation) */
  k1?: number;
  /** b parameter (length normalization) */
  b?: number;
  /** Boost exact matches */
  boostExactMatch?: number;
}

/**
 * Indexed document for BM25 search
 */
export interface BM25Document {
  id: string;
  /** Pre-computed search tokens */
  tokens: string[];
  /** Term frequency map */
  termFrequency: Map<string, number>;
  /** Document length (token count) */
  length: number;
  /** Original text (for display) */
  text: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * BM25 search result
 */
export interface BM25SearchResult {
  id: string;
  score: number;
  text: string;
  metadata?: Record<string, unknown>;
  /** Score breakdown for debugging */
  scoreBreakdown?: {
    termScores: Record<string, number>;
    exactMatchBoost: number;
  };
}

/**
 * BM25 index statistics
 */
export interface BM25IndexStats {
  documentCount: number;
  averageDocLength: number;
  vocabularySize: number;
  documentFrequencies: Map<string, number>;
}

// ============================================================================
// BM25 INDEX
// ============================================================================

/**
 * BM25 Index for keyword search
 *
 * Maintains the inverted index and IDF scores for fast BM25 queries.
 */
export class BM25Index {
  /** All documents in the index */
  private documents: Map<string, BM25Document> = new Map();

  /** Inverted index: token -> document IDs */
  private invertedIndex: Map<string, Set<string>> = new Map();

  /** Document frequency: token -> number of documents containing it */
  private documentFrequency: Map<string, number> = new Map();

  /** Total document length for average calculation */
  private totalDocLength = 0;

  /** BM25 parameters */
  private k1: number;
  private b: number;

  constructor(k1 = DEFAULT_K1, b = DEFAULT_B) {
    this.k1 = k1;
    this.b = b;
  }

  /**
   * Get average document length
   */
  get averageDocLength(): number {
    return this.documents.size > 0 ? this.totalDocLength / this.documents.size : 0;
  }

  /**
   * Get document count
   */
  get documentCount(): number {
    return this.documents.size;
  }

  /**
   * Add a document to the index
   */
  addDocument(id: string, text: string, metadata?: Record<string, unknown>): void {
    // Remove existing if present
    if (this.documents.has(id)) {
      this.removeDocument(id);
    }

    // Tokenize
    const tokens = tokenizeForIndex(text);
    const termFrequency = calculateTermFrequency(tokens);

    // Create document
    const doc: BM25Document = {
      id,
      tokens,
      termFrequency,
      length: tokens.length,
      text,
      metadata,
    };

    // Add to documents
    this.documents.set(id, doc);
    this.totalDocLength += doc.length;

    // Update inverted index and document frequencies
    const uniqueTokens = Array.from(new Set(tokens));
    for (const token of uniqueTokens) {
      // Update inverted index
      if (!this.invertedIndex.has(token)) {
        this.invertedIndex.set(token, new Set());
      }
      this.invertedIndex.get(token)!.add(id);

      // Update document frequency
      this.documentFrequency.set(token, (this.documentFrequency.get(token) || 0) + 1);
    }
  }

  /**
   * Remove a document from the index
   */
  removeDocument(id: string): boolean {
    const doc = this.documents.get(id);
    if (!doc) return false;

    // Update total length
    this.totalDocLength -= doc.length;

    // Update inverted index and document frequencies
    const uniqueTokensArray = Array.from(new Set(doc.tokens));
    for (const token of uniqueTokensArray) {
      // Remove from inverted index
      const docSet = this.invertedIndex.get(token);
      if (docSet) {
        docSet.delete(id);
        if (docSet.size === 0) {
          this.invertedIndex.delete(token);
        }
      }

      // Update document frequency
      const df = this.documentFrequency.get(token);
      if (df !== undefined) {
        if (df <= 1) {
          this.documentFrequency.delete(token);
        } else {
          this.documentFrequency.set(token, df - 1);
        }
      }
    }

    // Remove document
    this.documents.delete(id);
    return true;
  }

  /**
   * Calculate IDF for a term
   *
   * IDF(qi) = log((N - n(qi) + 0.5) / (n(qi) + 0.5))
   *
   * Where:
   * - N = total documents
   * - n(qi) = documents containing term qi
   */
  private calculateIDF(term: string): number {
    const N = this.documents.size;
    const n = this.documentFrequency.get(term) || 0;

    // Handle edge cases
    if (N === 0 || n === 0) return 0;

    // BM25 IDF formula with smoothing
    return Math.log((N - n + 0.5) / (n + 0.5) + 1);
  }

  /**
   * Calculate BM25 score for a document
   */
  private calculateScore(
    queryTokens: string[],
    doc: BM25Document,
    options: BM25SearchOptions = {}
  ): { score: number; termScores: Record<string, number> } {
    const k1 = options.k1 ?? this.k1;
    const b = options.b ?? this.b;
    const avgdl = this.averageDocLength;

    let score = 0;
    const termScores: Record<string, number> = {};

    for (const term of queryTokens) {
      const tf = doc.termFrequency.get(term) || 0;
      if (tf === 0) continue;

      const idf = this.calculateIDF(term);

      // BM25 term score
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (doc.length / avgdl));
      const termScore = idf * (numerator / denominator);

      termScores[term] = termScore;
      score += termScore;
    }

    return { score, termScores };
  }

  /**
   * Search the index using BM25
   */
  search(query: string, options: BM25SearchOptions = {}): BM25SearchResult[] {
    const { topK = 10, minScore = 0.0, boostExactMatch = 1.5 } = options;

    const queryTokens = tokenizeForQuery(query);
    const normalizedQuery = query.toLowerCase().trim();

    if (queryTokens.length === 0) {
      return [];
    }

    // Find candidate documents (any document containing at least one query term)
    const candidateIdsSet = new Set<string>();
    for (const token of queryTokens) {
      const docIds = this.invertedIndex.get(token);
      if (docIds) {
        const docIdsArray = Array.from(docIds);
        for (const id of docIdsArray) {
          candidateIdsSet.add(id);
        }
      }
    }

    // Score candidates
    const results: BM25SearchResult[] = [];
    const candidateIds = Array.from(candidateIdsSet);
    for (const id of candidateIds) {
      const doc = this.documents.get(id);
      if (!doc) continue;

      const { score, termScores } = this.calculateScore(queryTokens, doc, options);

      // Apply exact match boost
      let exactMatchBoost = 0;
      const normalizedText = doc.text.toLowerCase();
      if (normalizedText.includes(normalizedQuery)) {
        exactMatchBoost = score * (boostExactMatch - 1);
      }

      const finalScore = score + exactMatchBoost;

      if (finalScore >= minScore) {
        results.push({
          id: doc.id,
          score: finalScore,
          text: doc.text,
          metadata: doc.metadata,
          scoreBreakdown: {
            termScores,
            exactMatchBoost,
          },
        });
      }
    }

    // Sort by score and return top K
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Get index statistics
   */
  getStats(): BM25IndexStats {
    return {
      documentCount: this.documents.size,
      averageDocLength: this.averageDocLength,
      vocabularySize: this.invertedIndex.size,
      documentFrequencies: new Map(this.documentFrequency),
    };
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.documents.clear();
    this.invertedIndex.clear();
    this.documentFrequency.clear();
    this.totalDocLength = 0;
  }

  /**
   * Serialize index for persistence
   */
  serialize(): string {
    const data = {
      k1: this.k1,
      b: this.b,
      totalDocLength: this.totalDocLength,
      documents: Array.from(this.documents.entries()).map(([id, doc]) => ({
        id,
        tokens: doc.tokens,
        length: doc.length,
        text: doc.text,
        metadata: doc.metadata,
      })),
    };
    return JSON.stringify(data);
  }

  /**
   * Deserialize index from storage
   */
  static deserialize(json: string): BM25Index {
    const data = JSON.parse(json);
    const index = new BM25Index(data.k1, data.b);

    for (const doc of data.documents) {
      index.addDocument(doc.id, doc.text, doc.metadata);
    }

    return index;
  }
}

// ============================================================================
// FIRESTORE-BACKED BM25 SEARCH
// ============================================================================

/**
 * Search entities using BM25 in Firestore
 *
 * Uses the searchTokens field stored on entities for keyword matching.
 * This is an approximation of BM25 using Firestore's array-contains-any.
 */
export async function searchEntitiesBM25(
  userId: string,
  query: string,
  options: BM25SearchOptions & { types?: string[] } = {}
): Promise<BM25SearchResult[]> {
  const { topK = 20, minScore = 0.1, types } = options;

  try {
    const { Firestore, FieldPath } = await import('@google-cloud/firestore');
    const db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });

    const queryTokens = tokenizeForQuery(query);
    if (queryTokens.length === 0) {
      return [];
    }

    // Firestore array-contains-any supports up to 10 values
    const searchTokens = queryTokens.slice(0, 10);

    // Build query
    let firestoreQuery: FirebaseFirestore.Query = db
      .collection('entity_store')
      .doc(userId)
      .collection('entities')
      .where('searchTokens', 'array-contains-any', searchTokens);

    if (types && types.length > 0) {
      firestoreQuery = firestoreQuery.where('type', 'in', types);
    }

    firestoreQuery = firestoreQuery.limit(topK * 2); // Get extra for scoring

    const snapshot = await firestoreQuery.get();

    // Score results
    const results: BM25SearchResult[] = [];
    const totalDocs = snapshot.size;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const docTokens: string[] = data.searchTokens || [];

      // Approximate BM25 scoring
      let score = 0;
      let matchedTerms = 0;

      for (const token of queryTokens) {
        if (docTokens.includes(token)) {
          matchedTerms++;
          // Simple TF-IDF approximation
          const tf = docTokens.filter((t) => t === token).length;
          const idf = Math.log(totalDocs / (1 + matchedTerms));
          score += tf * idf;
        }
      }

      // Boost for more terms matched
      score *= 1 + matchedTerms / queryTokens.length;

      // Exact name match boost
      const name = (data.canonicalName || '').toLowerCase();
      if (name === query.toLowerCase() || name.includes(query.toLowerCase())) {
        score *= 1.5;
      }

      if (score >= minScore) {
        results.push({
          id: doc.id,
          score,
          text: data.canonicalName || data.name || 'Unknown',
          metadata: {
            type: data.type,
            relationship: data.relationship,
            aliases: data.aliases,
          },
        });
      }
    }

    // Sort and limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  } catch (error) {
    log.warn({ userId, query, error: String(error) }, 'BM25 entity search failed');
    return [];
  }
}

// ============================================================================
// MEMORY INDEX SINGLETON
// ============================================================================

let memoryBM25Index: BM25Index | null = null;

/**
 * Get or create the shared BM25 index for memories
 */
export function getMemoryBM25Index(): BM25Index {
  if (!memoryBM25Index) {
    memoryBM25Index = new BM25Index();
  }
  return memoryBM25Index;
}

/**
 * Clear the memory BM25 index
 */
export function clearMemoryBM25Index(): void {
  if (memoryBM25Index) {
    memoryBM25Index.clear();
    memoryBM25Index = null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { DEFAULT_K1, DEFAULT_B };
