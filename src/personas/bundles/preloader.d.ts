/**
 * Persona Bundle Preloader
 *
 * Preloads all persona bundles during prewarm for faster first use.
 * This eliminates cold-start latency for handoffs between personas.
 *
 * @module personas/bundles/preloader
 */
/**
 * Preload all persona bundles into memory.
 * This is called during prewarm to eliminate cold-start latency.
 *
 * The function is idempotent - calling it multiple times is safe.
 */
export declare function preloadAllBundles(): Promise<void>;
/**
 * Check if bundles have been preloaded.
 */
export declare function areBundlesPreloaded(): boolean;
/**
 * Reset preload status (for testing).
 */
export declare function resetPreloadStatus(): void;
//# sourceMappingURL=preloader.d.ts.map