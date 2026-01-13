/**
 * Voice IDs - Internal Constants
 *
 * This file provides voice ID constants and lookup functions.
 * Used internally by voice-registry.ts.
 *
 * NOTE: For new code, use the voice-registry API via personas/voice-registry.js
 * which provides getVoiceId() for voice ID lookups.
 *
 * Environment variables can OVERRIDE these defaults:
 *   JACK_B_VOICE_ID, PETER_JOHN_VOICE_ID, NAYAN_VOICE_ID, etc.
 *
 * To find voice IDs: https://play.cartesia.ai/library
 */
/**
 * Cartesia model from environment variable.
 * sonic-3 is the latest with best quality.
 */
export declare const CARTESIA_MODEL: string;
/**
 * Voice ID constants - used as fallback/defaults.
 * Bundle manifests are the primary source of truth.
 */
export declare const VOICE_IDS: {
    readonly FERNI: "fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc";
    readonly PETER_JOHN: "3f04e815-3260-4f50-8fd9-af9c657be4c2";
    readonly ALEX_CHEN: "81c164d9-7baa-419d-9f9a-6b18100a01ee";
    readonly MAYA_SANTOS: "11175483-5332-496c-8c01-ca527ce04e4a";
    readonly JORDAN_TAYLOR: "b2d14370-c56b-4bdd-a6a3-71abe1b6e345";
    readonly NAYAN_PATEL: "52f0a563-2a2a-4c4a-ab4f-000eaaed32b3";
    readonly JOEL_DICKSON: "3ebcd114-d280-4eed-a238-b9323a6b8e52";
    readonly GENERIC: "79a125e8-cd45-4c13-8a67-188112f4dd22";
};
/**
 * Alias for backwards compatibility with cartesia-core.ts
 */
export declare const DEFAULT_VOICE_IDS: {
    readonly FERNI: "fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc";
    readonly PETER_JOHN: "3f04e815-3260-4f50-8fd9-af9c657be4c2";
    readonly ALEX_CHEN: "81c164d9-7baa-419d-9f9a-6b18100a01ee";
    readonly MAYA_SANTOS: "11175483-5332-496c-8c01-ca527ce04e4a";
    readonly JORDAN_TAYLOR: "b2d14370-c56b-4bdd-a6a3-71abe1b6e345";
    readonly NAYAN_PATEL: "52f0a563-2a2a-4c4a-ab4f-000eaaed32b3";
    readonly JOEL_DICKSON: "3ebcd114-d280-4eed-a238-b9323a6b8e52";
    readonly GENERIC: "79a125e8-cd45-4c13-8a67-188112f4dd22";
};
/**
 * Map canonical persona IDs to their voice IDs.
 * Environment variables can override these.
 * Used internally by voice-registry.ts.
 */
export declare function getVoiceIdForPersona(personaId: string): string;
/**
 * Get voice ID from bundle manifest (async, preferred method)
 * Falls back to legacy VOICE_IDS if agent not found
 */
export declare function getVoiceIdFromManifest(personaId: string): Promise<string>;
/**
 * Validate a voice ID format (UUID v4)
 */
export declare function isValidVoiceId(voiceId: string): boolean;
/**
 * Log voice ID assignments for debugging
 */
export declare function logVoiceIdAssignments(): void;
//# sourceMappingURL=voice-ids.d.ts.map