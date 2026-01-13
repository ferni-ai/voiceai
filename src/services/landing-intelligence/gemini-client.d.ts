/**
 * Gemini Client for Landing Intelligence
 *
 * Fast, low-latency Gemini client optimized for landing page use cases.
 * Uses Gemini 2.0 Flash for speed, with fallback to cached responses.
 *
 * NOTE: Uses dynamic import for @google/generative-ai to make it optional.
 * If the package is not installed, falls back to null responses.
 *
 * @module services/landing-intelligence/gemini-client
 */
export interface GenerationOptions {
    maxTokens?: number;
    temperature?: number;
    cacheTTL?: number;
    skipCache?: boolean;
    timeout?: number;
}
export declare function generateJSON<T>(prompt: string, options?: GenerationOptions): Promise<T | null>;
export declare function generateText(prompt: string, options?: GenerationOptions): Promise<string | null>;
export declare function checkGeminiHealth(): Promise<boolean>;
export declare function clearCache(): void;
export declare function getCacheStats(): {
    size: number;
    keys: string[];
};
//# sourceMappingURL=gemini-client.d.ts.map