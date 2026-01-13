/**
 * Startup Validation Module
 *
 * Validates that the system is properly configured before allowing startup.
 * Fails loudly and clearly when critical configuration is missing.
 *
 * This prevents the silent fallback problem where the app runs
 * but doesn't actually persist data.
 */
import { getGCPProjectId } from '../../config/environment.js';
import { getLogger } from '../../utils/safe-logger.js';
const DEFAULT_CONFIG = {
    requirePersistentMemory: true,
    requireSemanticSearch: true,
    requireTTS: true,
    requireLLM: true,
    environment: process.env.NODE_ENV || 'development',
};
// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================
/**
 * Validate Google Cloud configuration
 */
function validateGoogleCloud() {
    const errors = [];
    const warnings = [];
    const projectId = getGCPProjectId();
    const hasCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        process.env.GCLOUD_SERVICE_KEY ||
        process.env.K_SERVICE || // Cloud Run
        process.env.GCE_METADATA_HOST; // GCE
    if (!projectId) {
        warnings.push('GOOGLE_CLOUD_PROJECT not set - Firestore persistence unavailable');
    }
    if (projectId && !hasCredentials && process.env.NODE_ENV !== 'production') {
        warnings.push('Google Cloud project set but no credentials found. ' +
            'Set GOOGLE_APPLICATION_CREDENTIALS for local Firestore access.');
    }
    return { valid: errors.length === 0, errors, warnings };
}
/**
 * Validate embedding configuration
 */
function validateEmbeddings() {
    const errors = [];
    const warnings = [];
    let provider = 'local';
    const hasGoogleKey = !!process.env.GOOGLE_API_KEY;
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    if (hasGoogleKey) {
        provider = 'google';
    }
    else if (hasOpenAIKey) {
        provider = 'openai';
    }
    else {
        provider = 'local';
        warnings.push('No embedding API key found (GOOGLE_API_KEY or OPENAI_API_KEY). ' +
            'Semantic search will NOT work - using hash-based fallback.');
    }
    return { valid: errors.length === 0, errors, warnings, provider };
}
/**
 * Validate TTS configuration
 */
function validateTTS() {
    const errors = [];
    const warnings = [];
    const hasGoogleKey = !!process.env.GOOGLE_API_KEY;
    const hasCartesiaKey = !!process.env.CARTESIA_API_KEY;
    const hasElevenLabsKey = !!process.env.ELEVENLABS_API_KEY;
    if (!hasGoogleKey && !hasCartesiaKey && !hasElevenLabsKey) {
        warnings.push('No TTS API key found. Voice responses may not work. ' +
            'Set GOOGLE_API_KEY, CARTESIA_API_KEY, or ELEVENLABS_API_KEY.');
    }
    return { valid: errors.length === 0, errors, warnings };
}
/**
 * Validate LLM configuration
 */
function validateLLM() {
    const errors = [];
    const warnings = [];
    const hasGoogleKey = !!process.env.GOOGLE_API_KEY;
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
    if (!hasGoogleKey && !hasOpenAIKey && !hasAnthropicKey) {
        errors.push('No LLM API key found. The AI cannot function. ' +
            'Set GOOGLE_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.');
    }
    return { valid: errors.length === 0, errors, warnings };
}
/**
 * Validate database/persistence configuration
 */
function validatePersistence() {
    const errors = [];
    const warnings = [];
    let storeType = 'memory';
    const explicitType = process.env.MEMORY_STORE_TYPE;
    const hasFirestore = !!getGCPProjectId();
    const hasPostgres = !!process.env.DATABASE_URL;
    if (explicitType === 'firestore' && !hasFirestore) {
        errors.push('MEMORY_STORE_TYPE=firestore but GOOGLE_CLOUD_PROJECT not set');
    }
    if (explicitType === 'postgres' && !hasPostgres) {
        errors.push('MEMORY_STORE_TYPE=postgres but DATABASE_URL not set');
    }
    // Determine actual store type
    if (explicitType && ['firestore', 'postgres', 'memory'].includes(explicitType)) {
        storeType = explicitType;
    }
    else if (hasFirestore) {
        storeType = 'firestore';
    }
    else if (hasPostgres) {
        storeType = 'postgres';
    }
    else {
        storeType = 'memory';
    }
    if (storeType === 'memory') {
        warnings.push('Using in-memory storage - USER DATA WILL NOT PERSIST across restarts! ' +
            'Set GOOGLE_CLOUD_PROJECT for Firestore or DATABASE_URL for PostgreSQL.');
    }
    return { valid: errors.length === 0, errors, warnings, storeType };
}
/**
 * Validate LiveKit configuration
 */
function validateLiveKit() {
    const errors = [];
    const warnings = [];
    if (!process.env.LIVEKIT_URL) {
        errors.push('LIVEKIT_URL not set - voice agent cannot connect');
    }
    if (!process.env.LIVEKIT_API_KEY) {
        errors.push('LIVEKIT_API_KEY not set');
    }
    if (!process.env.LIVEKIT_API_SECRET) {
        errors.push('LIVEKIT_API_SECRET not set');
    }
    return { valid: errors.length === 0, errors, warnings };
}
// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================
/**
 * Validate the startup configuration
 * Returns detailed results about what will and won't work
 */
export function validateStartup(config = {}) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const allErrors = [];
    const allWarnings = [];
    // Run all validations
    const gcpResult = validateGoogleCloud();
    const embeddingResult = validateEmbeddings();
    const ttsResult = validateTTS();
    const llmResult = validateLLM();
    const persistenceResult = validatePersistence();
    const livekitResult = validateLiveKit();
    // Collect all errors and warnings
    allErrors.push(...gcpResult.errors, ...embeddingResult.errors, ...ttsResult.errors);
    allErrors.push(...llmResult.errors, ...persistenceResult.errors, ...livekitResult.errors);
    allWarnings.push(...gcpResult.warnings, ...embeddingResult.warnings, ...ttsResult.warnings);
    allWarnings.push(...llmResult.warnings, ...persistenceResult.warnings, ...livekitResult.warnings);
    // Apply production requirements
    if (mergedConfig.environment === 'production') {
        if (mergedConfig.requirePersistentMemory && persistenceResult.storeType === 'memory') {
            allErrors.push('Production requires persistent memory. Set GOOGLE_CLOUD_PROJECT or DATABASE_URL.');
        }
        if (mergedConfig.requireSemanticSearch && embeddingResult.provider === 'local') {
            allErrors.push('Production requires semantic search. Set GOOGLE_API_KEY or OPENAI_API_KEY.');
        }
    }
    // Build capabilities report
    const capabilities = {
        persistentMemory: persistenceResult.storeType !== 'memory',
        semanticSearch: embeddingResult.provider !== 'local',
        voiceRecognition: ttsResult.valid, // Simplified - assumes STT works with TTS keys
        textToSpeech: ttsResult.valid && allErrors.filter((e) => e.includes('TTS')).length === 0,
        llmAvailable: llmResult.valid,
        storeType: persistenceResult.storeType,
        embeddingProvider: embeddingResult.provider,
    };
    return {
        valid: allErrors.length === 0,
        errors: allErrors,
        warnings: allWarnings,
        capabilities,
    };
}
/**
 * Validate and log results, throwing if invalid
 */
export function validateAndLog(config = {}) {
    const result = validateStartup(config);
    // Log warnings
    for (const warning of result.warnings) {
        getLogger().warn(`⚠️  ${warning}`);
    }
    // Log errors
    for (const error of result.errors) {
        getLogger().error(`❌ ${error}`);
    }
    // Log capabilities summary
    getLogger().info({
        storeType: result.capabilities.storeType,
        embeddingProvider: result.capabilities.embeddingProvider,
        persistentMemory: result.capabilities.persistentMemory,
        semanticSearch: result.capabilities.semanticSearch,
        llmAvailable: result.capabilities.llmAvailable,
    }, '🔧 Startup capabilities');
    if (!result.valid) {
        const errorSummary = result.errors.join('\n  - ');
        throw new Error(`Startup validation failed:\n  - ${errorSummary}`);
    }
    // Final warning about data loss risk
    if (!result.capabilities.persistentMemory) {
        getLogger().warn('⚠️  ========================================\n' +
            '⚠️  WARNING: MEMORY IS NOT PERSISTENT!\n' +
            '⚠️  User data will be LOST on restart.\n' +
            '⚠️  ========================================');
    }
    if (!result.capabilities.semanticSearch) {
        getLogger().warn('⚠️  ========================================\n' +
            '⚠️  WARNING: SEMANTIC SEARCH DISABLED!\n' +
            '⚠️  RAG and memory retrieval will not work.\n' +
            '⚠️  ========================================');
    }
    return result.capabilities;
}
/**
 * Quick check if we're in a "full capability" mode
 */
export function hasFullCapabilities() {
    const result = validateStartup();
    return (result.capabilities.persistentMemory &&
        result.capabilities.semanticSearch &&
        result.capabilities.llmAvailable);
}
/**
 * Get a human-readable summary of current capabilities
 */
export function getCapabilitySummary() {
    const result = validateStartup();
    const lines = ['Ferni AI Capabilities:'];
    lines.push(`  Memory: ${result.capabilities.persistentMemory ? '✅ Persistent' : '❌ Ephemeral (will lose data)'}`);
    lines.push(`  Semantic Search: ${result.capabilities.semanticSearch ? '✅ Enabled' : '❌ Disabled (hash fallback)'}`);
    lines.push(`  LLM: ${result.capabilities.llmAvailable ? '✅ Available' : '❌ Not configured'}`);
    lines.push(`  TTS: ${result.capabilities.textToSpeech ? '✅ Available' : '⚠️ May not work'}`);
    lines.push(`  Store: ${result.capabilities.storeType}`);
    lines.push(`  Embeddings: ${result.capabilities.embeddingProvider}`);
    if (result.warnings.length > 0) {
        lines.push('\nWarnings:');
        for (const warning of result.warnings) {
            lines.push(`  ⚠️  ${warning}`);
        }
    }
    return lines.join('\n');
}
// ============================================================================
// EMBEDDING CONSISTENCY CHECK
// ============================================================================
/**
 * Check if current embedding dimensions match stored data
 */
export async function checkEmbeddingConsistency() {
    const embeddingResult = validateEmbeddings();
    // Determine current dimensions based on provider
    const dimensionMap = {
        google: 768,
        openai: 1536,
        local: 384,
    };
    const currentDimensions = dimensionMap[embeddingResult.provider];
    // Try to detect stored dimensions
    // This would require reading from the vector store
    try {
        // Check environment for explicit dimension setting
        const storedDimensions = process.env.EMBEDDING_DIMENSIONS
            ? parseInt(process.env.EMBEDDING_DIMENSIONS, 10)
            : undefined;
        if (storedDimensions && storedDimensions !== currentDimensions) {
            return {
                consistent: false,
                currentDimensions,
                storedDimensions,
                warning: `Embedding dimension mismatch! Stored: ${storedDimensions}, Current: ${currentDimensions}. ` +
                    `Re-indexing required or set EMBEDDING_DIMENSIONS=${currentDimensions}`,
            };
        }
        return {
            consistent: true,
            currentDimensions,
            storedDimensions,
        };
    }
    catch (error) {
        getLogger().warn({ error }, 'Could not check embedding consistency');
        return {
            consistent: true, // Assume consistent if we can't check
            currentDimensions,
        };
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    validateStartup,
    validateAndLog,
    hasFullCapabilities,
    getCapabilitySummary,
    checkEmbeddingConsistency,
};
//# sourceMappingURL=startup-validation.js.map