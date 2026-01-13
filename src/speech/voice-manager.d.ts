/**
 * Voice Manager
 *
 * Manages TTS voice switching between all personas in the team.
 * Uses Cartesia's API to switch voices mid-session.
 *
 * Features:
 * - DynamicTTS class that switches voices based on current agent
 * - Automatic voice switching on handoff events
 * - Support for all 6 personas: Ferni, Jack Bogle, Peter John, Alex, Maya, Jordan
 *
 * Voice IDs are now sourced from the voice-registry (single source of truth).
 *
 * NOTE: This file is a re-export wrapper for backward compatibility.
 * The implementation has been split into:
 * - ./voice-manager/types.ts - Type definitions
 * - ./voice-manager/config.ts - Voice configurations
 * - ./voice-manager/manager.ts - VoiceManager class and singleton
 * - ./voice-manager/dynamic-tts.ts - DynamicTTS class
 * - ./voice-manager/persona-aware-tts.ts - PersonaAwareTTS class
 */
export * from './voice-manager/index.js';
export { default } from './voice-manager/index.js';
//# sourceMappingURL=voice-manager.d.ts.map