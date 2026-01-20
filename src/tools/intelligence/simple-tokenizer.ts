/**
 * Simple BERT Tokenizer
 *
 * A lightweight tokenizer for BERT-based models that doesn't require
 * transformers.js (which conflicts with onnxruntime-node).
 *
 * Loads vocabulary from tokenizer.json and performs basic WordPiece tokenization.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface TokenizerConfig {
  vocabPath: string;
  maxLength: number;
  padToken: string;
  unkToken: string;
  clsToken: string;
  sepToken: string;
}

export interface EncodedOutput {
  input_ids: bigint[];
  attention_mask: bigint[];
}

const DEFAULT_CONFIG: Partial<TokenizerConfig> = {
  maxLength: 64,
  padToken: '[PAD]',
  unkToken: '[UNK]',
  clsToken: '[CLS]',
  sepToken: '[SEP]',
};

export class SimpleTokenizer {
  private vocab: Map<string, number> = new Map();
  private padId = 0;
  private unkId = 100;
  private clsId = 101;
  private sepId = 102;
  private maxLength: number;
  private initialized = false;

  constructor(private config: Partial<TokenizerConfig> = {}) {
    this.maxLength = config.maxLength || 64;
  }

  async loadVocab(vocabPath: string): Promise<void> {
    try {
      const content = await fs.readFile(vocabPath, 'utf-8');
      const data = JSON.parse(content);

      // Handle different vocab formats
      let vocabObj: Record<string, number>;

      if (data.model?.vocab) {
        // tokenizer.json format
        vocabObj = data.model.vocab;
      } else if (data.vocab) {
        // vocab.json format
        vocabObj = data.vocab;
      } else {
        // Assume it's already a vocab object
        vocabObj = data;
      }

      // Build vocab map
      for (const [token, id] of Object.entries(vocabObj)) {
        this.vocab.set(token, id as number);
      }

      // Find special tokens
      this.padId = this.vocab.get('[PAD]') ?? this.vocab.get('<pad>') ?? 0;
      this.unkId = this.vocab.get('[UNK]') ?? this.vocab.get('<unk>') ?? 100;
      this.clsId = this.vocab.get('[CLS]') ?? this.vocab.get('<s>') ?? 101;
      this.sepId = this.vocab.get('[SEP]') ?? this.vocab.get('</s>') ?? 102;

      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to load vocab from ${vocabPath}: ${error}`);
    }
  }

  /**
   * Simple WordPiece tokenization
   */
  private tokenize(text: string): string[] {
    const tokens: string[] = [];

    // Lowercase and split on whitespace and punctuation
    const words = text.toLowerCase().split(/(\s+|[.,!?;:'"()\[\]{}])/);

    for (const word of words) {
      if (!word || !word.trim()) continue;

      // Try to find the word in vocab
      if (this.vocab.has(word)) {
        tokens.push(word);
        continue;
      }

      // WordPiece: try to break into subwords
      let remaining = word;
      let isFirst = true;

      while (remaining.length > 0) {
        let found = false;

        // Try progressively shorter prefixes
        for (let end = remaining.length; end > 0; end--) {
          const substr = isFirst ? remaining.slice(0, end) : '##' + remaining.slice(0, end);

          if (this.vocab.has(substr)) {
            tokens.push(substr);
            remaining = remaining.slice(end);
            isFirst = false;
            found = true;
            break;
          }
        }

        if (!found) {
          // Can't tokenize - use UNK for first char and continue
          tokens.push('[UNK]');
          remaining = remaining.slice(1);
          isFirst = false;
        }
      }
    }

    return tokens;
  }

  /**
   * Encode text to token IDs
   */
  encode(text: string): EncodedOutput {
    if (!this.initialized) {
      throw new Error('Tokenizer not initialized. Call loadVocab() first.');
    }

    const tokens = this.tokenize(text);

    // Convert to IDs with CLS and SEP
    const ids: bigint[] = [BigInt(this.clsId)];

    for (const token of tokens) {
      if (ids.length >= this.maxLength - 1) break;
      const id = this.vocab.get(token) ?? this.unkId;
      ids.push(BigInt(id));
    }

    ids.push(BigInt(this.sepId));

    // Pad to maxLength
    const attention_mask: bigint[] = ids.map(() => BigInt(1));

    while (ids.length < this.maxLength) {
      ids.push(BigInt(this.padId));
      attention_mask.push(BigInt(0));
    }

    return { input_ids: ids, attention_mask };
  }

  isReady(): boolean {
    return this.initialized;
  }

  vocabSize(): number {
    return this.vocab.size;
  }
}

// ============================================================================
// SINGLETON FACTORY
// ============================================================================

const tokenizerCache = new Map<string, SimpleTokenizer>();

export async function getSimpleTokenizer(vocabPath: string): Promise<SimpleTokenizer> {
  if (tokenizerCache.has(vocabPath)) {
    return tokenizerCache.get(vocabPath)!;
  }

  const tokenizer = new SimpleTokenizer();
  await tokenizer.loadVocab(vocabPath);
  tokenizerCache.set(vocabPath, tokenizer);
  return tokenizer;
}
