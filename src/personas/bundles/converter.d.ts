/**
 * Legacy Persona to Bundle Converter
 *
 * Converts existing PersonaConfig objects to the new bundle format,
 * making migration to the bundle system easy.
 *
 * Usage:
 *   import { JACK_BOGLE_PERSONA } from '../jack-bogle/index.js';
 *   import { convertLegacyToBundle } from './converter.js';
 *
 *   const bundlePath = await convertLegacyToBundle(JACK_BOGLE_PERSONA, './bundles');
 */
import type { PersonaConfig } from '../types.js';
import type { PersonaBundleManifest } from './types.js';
/**
 * Generate a bundle manifest from a legacy PersonaConfig
 */
export declare function generateManifest(persona: PersonaConfig): PersonaBundleManifest;
/**
 * Convert a legacy PersonaConfig to a bundle directory
 *
 * @param persona The legacy PersonaConfig to convert
 * @param outputDir Base directory for bundles
 * @returns Path to the created bundle
 */
export declare function convertLegacyToBundle(persona: PersonaConfig, outputDir: string): Promise<string>;
declare const _default: {
    generateManifest: typeof generateManifest;
    convertLegacyToBundle: typeof convertLegacyToBundle;
};
export default _default;
//# sourceMappingURL=converter.d.ts.map