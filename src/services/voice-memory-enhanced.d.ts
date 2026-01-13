/**
 * Enhanced Voice Memory Service
 *
 * Uses native Rust speaker embedding model (ferni-speaker) for high-accuracy
 * voice recognition. Falls back to DSP-based features if native module unavailable.
 *
 * Performance:
 * - Neural embedding: 5-15ms, ~99% accuracy
 * - DSP fallback: <1ms, ~85% accuracy
 */
/**
 * Neural speaker embedding (192-dimensional).
 */
export interface SpeakerEmbedding {
    /** Embedding vector */
    vector: Float32Array;
    /** Extraction method */
    method: 'neural' | 'dsp';
    /** Confidence score (0-1) */
    confidence: number;
    /** Timestamp */
    timestamp: Date;
}
/**
 * Speaker match result.
 */
export interface SpeakerMatch {
    /** Index of matched speaker in candidate list */
    index: number;
    /** Similarity score (0-1) */
    similarity: number;
    /** Whether this is a confident match */
    isMatch: boolean;
}
/**
 * Extract speaker embedding from audio samples.
 *
 * Uses neural model if available, otherwise falls back to DSP-based features.
 *
 * @param audio - Audio samples (16kHz mono Float32Array)
 * @returns Speaker embedding
 */
export declare function extractSpeakerEmbedding(audio: Float32Array): Promise<SpeakerEmbedding | null>;
/**
 * Compare two speaker embeddings.
 *
 * @returns Similarity score (0-1, higher = more similar)
 */
export declare function compareSpeakerEmbeddings(emb1: SpeakerEmbedding, emb2: SpeakerEmbedding): Promise<number>;
/**
 * Find the best matching speaker from a list of candidates.
 *
 * @param query - Query embedding
 * @param candidates - List of candidate embeddings
 * @param threshold - Minimum similarity threshold (default 0.7)
 * @returns Best match or null if no match above threshold
 */
export declare function findBestSpeakerMatch(query: SpeakerEmbedding, candidates: SpeakerEmbedding[], threshold?: number): Promise<SpeakerMatch | null>;
/**
 * Extract multiple embeddings in batch (more efficient).
 */
export declare function extractSpeakerEmbeddingsBatch(audioSamples: Float32Array[]): Promise<SpeakerEmbedding[]>;
/**
 * Check if neural speaker embedding is available.
 */
export declare function isNeuralEmbeddingAvailable(): Promise<boolean>;
/**
 * Get information about the speaker embedding model.
 */
export declare function getSpeakerModelInfo(): Promise<{
    available: boolean;
    model?: string;
    embeddingDim?: number;
    method: 'neural' | 'dsp';
}>;
//# sourceMappingURL=voice-memory-enhanced.d.ts.map