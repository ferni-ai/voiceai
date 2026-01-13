/**
 * Startup Validation Module
 *
 * Validates that the system is properly configured before allowing startup.
 * Fails loudly and clearly when critical configuration is missing.
 *
 * This prevents the silent fallback problem where the app runs
 * but doesn't actually persist data.
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    capabilities: StartupCapabilities;
}
export interface StartupCapabilities {
    /** Whether user data will persist across restarts */
    persistentMemory: boolean;
    /** Whether semantic search will work */
    semanticSearch: boolean;
    /** Whether voice recognition is available */
    voiceRecognition: boolean;
    /** Whether TTS is available */
    textToSpeech: boolean;
    /** Whether LLM is available */
    llmAvailable: boolean;
    /** Store type being used */
    storeType: 'firestore' | 'postgres' | 'memory';
    /** Embedding provider being used */
    embeddingProvider: 'google' | 'openai' | 'local';
}
export interface ValidationConfig {
    /** Require persistent memory in production */
    requirePersistentMemory: boolean;
    /** Require semantic search capability */
    requireSemanticSearch: boolean;
    /** Require TTS capability */
    requireTTS: boolean;
    /** Require LLM capability */
    requireLLM: boolean;
    /** Environment to validate for */
    environment: 'production' | 'development' | 'test';
}
/**
 * Validate the startup configuration
 * Returns detailed results about what will and won't work
 */
export declare function validateStartup(config?: Partial<ValidationConfig>): ValidationResult;
/**
 * Validate and log results, throwing if invalid
 */
export declare function validateAndLog(config?: Partial<ValidationConfig>): StartupCapabilities;
/**
 * Quick check if we're in a "full capability" mode
 */
export declare function hasFullCapabilities(): boolean;
/**
 * Get a human-readable summary of current capabilities
 */
export declare function getCapabilitySummary(): string;
/**
 * Check if current embedding dimensions match stored data
 */
export declare function checkEmbeddingConsistency(): Promise<{
    consistent: boolean;
    currentDimensions: number;
    storedDimensions?: number;
    warning?: string;
}>;
declare const _default: {
    validateStartup: typeof validateStartup;
    validateAndLog: typeof validateAndLog;
    hasFullCapabilities: typeof hasFullCapabilities;
    getCapabilitySummary: typeof getCapabilitySummary;
    checkEmbeddingConsistency: typeof checkEmbeddingConsistency;
};
export default _default;
//# sourceMappingURL=startup-validation.d.ts.map