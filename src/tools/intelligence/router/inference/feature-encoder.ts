/**
 * Feature Encoder
 *
 * Encodes input queries and context into features for the router model.
 * Uses a tokenizer compatible with the trained model.
 *
 * @module tools/intelligence/router/inference/feature-encoder
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import type { RouterInput, EncodedFeatures, RouterModelConfig } from './types.js';

const log = createLogger({ module: 'ftis:feature-encoder' });

// ============================================================================
// SIMPLE TOKENIZER (fallback when transformers.js not available)
// ============================================================================

/**
 * Simple word-piece style tokenizer for fallback
 * This is a simplified version - production should use proper tokenizer
 */
class SimpleTokenizer {
  private vocab = new Map<string, number>();
  private inverseVocab = new Map<number, string>();
  private padTokenId = 0;
  private unkTokenId = 1;
  private clsTokenId = 2;
  private sepTokenId = 3;

  constructor() {
    // Initialize with special tokens
    this.vocab.set('[PAD]', 0);
    this.vocab.set('[UNK]', 1);
    this.vocab.set('[CLS]', 2);
    this.vocab.set('[SEP]', 3);

    // Build inverse vocab
    for (const [token, id] of this.vocab) {
      this.inverseVocab.set(id, token);
    }
  }

  /**
   * Load vocabulary from file or config
   */
  async loadVocab(vocabPath: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(vocabPath, 'utf-8');
      const vocabData = JSON.parse(content) as Record<string, number>;

      for (const [token, id] of Object.entries(vocabData)) {
        this.vocab.set(token, id);
        this.inverseVocab.set(id, token);
      }

      log.debug({ vocabSize: this.vocab.size }, 'Loaded vocabulary');
    } catch (error) {
      log.warn({ error: String(error) }, 'Failed to load vocabulary, using fallback');
    }
  }

  /**
   * Tokenize text into IDs
   */
  encode(
    text: string,
    maxLength: number,
    padding = true
  ): { inputIds: number[]; attentionMask: number[] } {
    // Simple word tokenization
    const words = text.toLowerCase().split(/\s+/);

    // Convert to IDs
    const tokenIds: number[] = [this.clsTokenId];

    for (const word of words) {
      // Look up word or use UNK
      const id = this.vocab.get(word) ?? this.unkTokenId;
      tokenIds.push(id);

      if (tokenIds.length >= maxLength - 1) {
        break;
      }
    }

    tokenIds.push(this.sepTokenId);

    // Create attention mask
    const attentionMask = new Array(tokenIds.length).fill(1);

    // Pad if needed
    if (padding) {
      while (tokenIds.length < maxLength) {
        tokenIds.push(this.padTokenId);
        attentionMask.push(0);
      }
    }

    return { inputIds: tokenIds, attentionMask };
  }

  /**
   * Decode IDs back to text
   */
  decode(ids: number[]): string {
    const tokens: string[] = [];
    for (const id of ids) {
      const token = this.inverseVocab.get(id);
      if (token && !['[PAD]', '[CLS]', '[SEP]', '[UNK]'].includes(token)) {
        tokens.push(token);
      }
    }
    return tokens.join(' ');
  }

  get padToken(): number {
    return this.padTokenId;
  }
}

// ============================================================================
// FEATURE ENCODER
// ============================================================================

export class FeatureEncoder {
  private config: RouterModelConfig;
  private tokenizer: SimpleTokenizer | null = null;
  private transformersTokenizer: unknown = null;
  private useTransformers = false;
  private cache = new Map<string, EncodedFeatures>();

  constructor(config: RouterModelConfig) {
    this.config = config;
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize the encoder
   */
  async initialize(): Promise<void> {
    // Use unified loader to avoid OrtEnv conflicts (NEVER import @xenova directly!)
    try {
      const { createTokenizer } = await import('../../../../utils/transformers-loader.js');
      this.transformersTokenizer = await createTokenizer(this.config.tokenizerPath, {
        localFilesOnly: true,
      });
      this.useTransformers = true;
      log.info('Using unified transformers loader for tokenizer');
    } catch (error) {
      log.debug({ error: String(error) }, 'Transformers.js not available, using simple tokenizer');

      // Fall back to simple tokenizer
      this.tokenizer = new SimpleTokenizer();

      // Try to load vocab
      try {
        const vocabPath = `${this.config.tokenizerPath}/vocab.json`;
        await this.tokenizer.loadVocab(vocabPath);
      } catch {
        log.debug('No vocab file found, using basic tokenization');
      }
    }

    log.info('Feature encoder initialized');
  }

  // ==========================================================================
  // ENCODING
  // ==========================================================================

  /**
   * Encode router input into model features
   */
  async encode(input: RouterInput): Promise<EncodedFeatures> {
    // Check cache
    const cacheKey = this.getCacheKey(input);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Build query with context
    const enhancedQuery = this.buildEnhancedQuery(input);

    // Tokenize
    let inputIds: number[];
    let attentionMask: number[];

    if (this.useTransformers && this.transformersTokenizer) {
      // Use transformers.js
      const tokenizer = this.transformersTokenizer as {
        encode: (
          text: string
        ) => Promise<{ input_ids: { data: bigint[] }; attention_mask: { data: bigint[] } }>;
      };

      const encoded = await tokenizer.encode(enhancedQuery);

      // Convert BigInt arrays to number arrays and handle padding
      inputIds = this.padOrTruncate(
        Array.from(encoded.input_ids.data).map(Number),
        this.config.maxLength
      );
      attentionMask = this.padOrTruncate(
        Array.from(encoded.attention_mask.data).map(Number),
        this.config.maxLength
      );
    } else if (this.tokenizer) {
      // Use simple tokenizer
      const encoded = this.tokenizer.encode(enhancedQuery, this.config.maxLength);
      inputIds = encoded.inputIds;
      attentionMask = encoded.attentionMask;
    } else {
      throw new Error('No tokenizer available');
    }

    const features: EncodedFeatures = {
      inputIds,
      attentionMask,
    };

    // Cache
    if (this.cache.size >= this.config.cacheSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(cacheKey, features);

    return features;
  }

  /**
   * Encode multiple inputs in batch
   */
  async encodeBatch(inputs: RouterInput[]): Promise<EncodedFeatures[]> {
    return Promise.all(inputs.map(async (input) => this.encode(input)));
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Build enhanced query with context
   */
  private buildEnhancedQuery(input: RouterInput): string {
    const parts: string[] = [];

    // Add persona context
    parts.push(`[${input.personaId}]`);

    // Add emotion if not neutral
    if (input.emotion && input.emotion !== 'neutral') {
      parts.push(`[${input.emotion}]`);
    }

    // Add time context
    parts.push(`[${input.timeOfDay}]`);

    // Add recent tools context (abbreviated)
    if (input.recentTools.length > 0) {
      const recentStr = input.recentTools.slice(-3).join(',');
      parts.push(`[recent:${recentStr}]`);
    }

    // Add the main query
    parts.push(input.query);

    return parts.join(' ');
  }

  /**
   * Pad or truncate sequence to target length
   */
  private padOrTruncate(sequence: number[], targetLength: number, padValue = 0): number[] {
    if (sequence.length >= targetLength) {
      return sequence.slice(0, targetLength);
    }

    const padded = [...sequence];
    while (padded.length < targetLength) {
      padded.push(padValue);
    }
    return padded;
  }

  /**
   * Get cache key for input
   */
  private getCacheKey(input: RouterInput): string {
    return JSON.stringify({
      q: input.query,
      p: input.personaId,
      e: input.emotion,
      t: input.timeOfDay,
      r: input.recentTools.slice(-3),
    });
  }

  /**
   * Clear the encoding cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.cacheSize,
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let encoderInstance: FeatureEncoder | null = null;

export function getFeatureEncoder(config?: RouterModelConfig): FeatureEncoder {
  if (!encoderInstance && config) {
    encoderInstance = new FeatureEncoder(config);
  }
  if (!encoderInstance) {
    throw new Error('Feature encoder not initialized');
  }
  return encoderInstance;
}

export async function initializeFeatureEncoder(config: RouterModelConfig): Promise<FeatureEncoder> {
  encoderInstance = new FeatureEncoder(config);
  await encoderInstance.initialize();
  return encoderInstance;
}

export function resetFeatureEncoder(): void {
  encoderInstance = null;
}
