/**
 * Transcript Parser
 *
 * Extracts structured data from phone call transcripts.
 * Uses pattern matching for common formats + LLM for complex extraction.
 *
 * "Better Than Human" - understands context, catches nuances humans might miss.
 */
import type { ConciergeResultData, ConciergeDomain } from '../types.js';
export interface ParseResult {
    success: boolean;
    data: ConciergeResultData;
    summary: string;
    contactName?: string;
    confidence: number;
}
/**
 * Parse a call transcript and extract structured data
 */
export declare function parseTranscript(transcript: string, domain: ConciergeDomain, businessName: string): ParseResult;
/**
 * Parse multiple transcripts and combine results
 */
export declare function parseMultipleTranscripts(transcripts: Array<{
    transcript: string;
    businessName: string;
}>, domain: ConciergeDomain): ParseResult[];
//# sourceMappingURL=transcript-parser.d.ts.map