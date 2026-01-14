/**
 * Data Capture Definitions Index (DEPRECATED)
 *
 * @deprecated The static capture definitions have been replaced by dynamic
 * memory extraction in src/memory/dynamic/
 *
 * The legacy definitions have been moved to ../_deprecated/
 *
 * Migration:
 * - Use fastCapture() from src/memory/dynamic/ for real-time extraction
 * - DeepExtractionWorker handles LLM-powered extraction in background
 * - Dynamic memories are stored in Firestore: dynamic_entities, dynamic_facts, dynamic_relationships
 *
 * @see src/memory/dynamic/CLAUDE.md for the new architecture
 */

import type { DataCaptureDefinition } from '../types.js';

// Empty array - definitions have been deprecated
export const allDataCaptureDefinitions: DataCaptureDefinition[] = [];

export default allDataCaptureDefinitions;
