/**
 * Human Listening Pipeline
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Unified pipeline that integrates all human-like listening capabilities:
 *
 * AUDIO-BASED:
 * - Breath pattern detection (sighs, held breath, deep breaths)
 * - Voice tremor/strain detection (wavering, cracking)
 * - Volume dynamics (getting quieter on vulnerable topics)
 * - Energy fade detection (voice trailing off)
 *
 * TEXT-BASED:
 * - Cognitive load indicators (fillers, pauses, restarts)
 * - Fluency analysis (stammering, self-corrections)
 * - Hedging detection (uncertainty, minimizing, protecting)
 * - Filler/subvocal patterns (um, uh, like analysis)
 * - Self-soothing detection (reassurance, dismissal)
 *
 * CONVERSATION-BASED:
 * - Narrative arc tracking (building, meandering, climax)
 * - Engagement scoring (present vs. distracted)
 *
 * This pipeline produces a comprehensive "how they're really doing"
 * assessment that goes beyond just what they say.
 *
 * @module HumanListeningPipeline
 *
 * NOTE: This file is a re-export wrapper for backward compatibility.
 * The implementation has been split into:
 * - ./human-listening-pipeline/types.ts - Type definitions
 * - ./human-listening-pipeline/pipeline.ts - Main pipeline class
 * - ./human-listening-pipeline/analyzers.ts - Analysis functions
 * - ./human-listening-pipeline/synthesis.ts - Result synthesis
 * - ./human-listening-pipeline/session-management.ts - Session handling
 */
export * from './human-listening-pipeline/index.js';
export { default } from './human-listening-pipeline/index.js';
//# sourceMappingURL=human-listening-pipeline.d.ts.map