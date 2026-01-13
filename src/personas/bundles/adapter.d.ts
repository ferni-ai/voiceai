/**
 * Bundle to PersonaConfig Adapter
 *
 * Converts loaded persona bundles (new format) to PersonaConfig (legacy format)
 * for seamless integration with the existing voice-agent system.
 */
import type { PersonaConfig } from '../types.js';
import type { LoadedPersonaBundle } from './types.js';
/**
 * Convert a loaded bundle to PersonaConfig
 * Includes defensive null checks for incomplete manifests (e.g., marketplace agents)
 */
export declare function bundleToPersonaConfig(bundle: LoadedPersonaBundle): Promise<PersonaConfig>;
declare const _default: {
    bundleToPersonaConfig: typeof bundleToPersonaConfig;
};
export default _default;
//# sourceMappingURL=adapter.d.ts.map