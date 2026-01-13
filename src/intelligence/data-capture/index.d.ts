/**
 * Semantic Data Capture Router
 *
 * Real-time extraction and routing of personal data mentioned during conversation.
 * Bridges the gap between tool-based semantic routing and passive data storage.
 *
 * This system enables "Better than Human" by:
 * 1. Passively capturing contacts, commitments, dreams, relationships
 * 2. Feeding data into Superhuman Services (commitment-keeper, dream-keeper, etc.)
 * 3. Generating natural acknowledgments for the LLM to weave in
 *
 * Example: "My mom's number is 555-1234"
 * → Extracts: { name: "Mom", relationship: "mother", phone: "555-1234" }
 * → Routes to: Contacts service
 * → Returns: Acknowledgment for LLM context
 *
 * @module intelligence/data-capture
 */
import type { DataCaptureContext, DataCaptureResult } from './types.js';
/**
 * Process transcript for data capture
 *
 * Extracts entities, classifies intent, routes to storage,
 * and returns context for LLM acknowledgment.
 */
export declare function processDataCapture(context: DataCaptureContext): Promise<DataCaptureResult>;
/**
 * Enhanced data capture that combines hardcoded + definition-based capture.
 *
 * This is the main entry point for "Better than Human" passive learning.
 *
 * @param context - Capture context with transcript and user info
 * @returns Capture result with acknowledgment for LLM injection
 */
export declare function captureDataBetterThanHuman(context: DataCaptureContext): Promise<DataCaptureResult>;
export type * from './types.js';
//# sourceMappingURL=index.d.ts.map