/**
 * Alive Voice Module
 *
 * Makes agents come alive through:
 * 1. Sentence-level emotion arcs - emotions shift mid-sentence based on content
 * 2. Dynamic pause scaling - longer pauses for heavier topics
 * 3. Speed variation - slow for emphasis, fast for asides
 * 4. Pre-response micro-sounds - "Oh!", "Hmm...", "Wow!" openings
 * 5. Persona voice fingerprints - distinct SSML patterns per persona
 * 6. Contextual laughter - knows when a laugh would feel natural
 *
 * Philosophy: Humans don't speak with one emotion. They shift, hesitate,
 * speed up when excited, slow down when serious. This module brings
 * that natural variation to AI speech.
 *
 * This file re-exports from the subdirectory for backwards compatibility.
 * The module has been split for maintainability (was 977 lines).
 *
 * @module speech/adaptive-ssml/alive-voice
 */

export * from './alive-voice/index.js';
