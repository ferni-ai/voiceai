/**
 * Agent Assets Loader
 *
 * Loads agent-specific theme and asset configurations.
 * Assets include:
 * - Theme: Colors, typography, avatar settings
 * - Sounds: Audio cues for various events
 * - Icons: Custom icons for the agent
 * - Images: Avatar images and other visuals
 *
 * Directory structure:
 *   assets/
 *     theme.json         - Theme configuration
 *     sounds.json        - Sound mappings
 *     icons/             - Custom icons
 *     images/            - Custom images (avatar, etc.)
 *
 * @module personas/bundles/assets-loader
 */
import type { BundleAssets, BundleTheme, BundleSounds } from './types/commands.js';
/**
 * Load theme configuration from theme.json
 */
export declare function loadTheme(assetsDir: string): Promise<BundleTheme | null>;
/**
 * Load sound configuration from sounds.json
 */
export declare function loadSounds(assetsDir: string): Promise<BundleSounds | null>;
/**
 * Load all assets for an agent
 */
export declare function loadAssets(assetsDir: string): Promise<BundleAssets | null>;
/**
 * Load assets for a persona bundle
 */
export declare function loadBundleAssets(bundlePath: string): Promise<BundleAssets | null>;
/**
 * Get assets for a bundle (with caching)
 */
export declare function getAssets(bundlePath: string, forceReload?: boolean): Promise<BundleAssets | null>;
/**
 * Clear assets cache for a bundle
 */
export declare function clearAssetsCache(bundlePath?: string): void;
/**
 * Generate CSS variables from a theme
 */
export declare function themeToCSSVariables(theme: BundleTheme, prefix?: string): string;
declare const _default: {
    loadTheme: typeof loadTheme;
    loadSounds: typeof loadSounds;
    loadAssets: typeof loadAssets;
    loadBundleAssets: typeof loadBundleAssets;
    getAssets: typeof getAssets;
    clearAssetsCache: typeof clearAssetsCache;
    themeToCSSVariables: typeof themeToCSSVariables;
};
export default _default;
//# sourceMappingURL=assets-loader.d.ts.map