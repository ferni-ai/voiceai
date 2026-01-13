/**
 * Content Delivery Pacing
 *
 * Makes reading longer content feel human and "better than human."
 *
 * When Ferni reads from the web, summarizes research, or delivers
 * informational content, we need MORE than just sentence pauses.
 * Humans naturally:
 * - Slow down for important points
 * - Speed up through transitions
 * - Add "breathing room" between topics
 * - Use signposting phrases
 * - Vary their rhythm to maintain interest
 *
 * This module transforms robotic content delivery into engaging storytelling.
 */
export type ContentType = 'web_result' | 'list' | 'factual' | 'narrative' | 'instructions' | 'mixed' | 'conversational';
export interface ContentAnalysis {
    type: ContentType;
    complexity: 'simple' | 'moderate' | 'complex';
    wordCount: number;
    sentenceCount: number;
    hasNumbers: boolean;
    hasList: boolean;
    hasQuotes: boolean;
    estimatedReadTimeMs: number;
    segments: ContentSegment[];
}
export interface ContentSegment {
    text: string;
    type: 'opening' | 'main_point' | 'supporting' | 'transition' | 'list_item' | 'conclusion';
    importance: 'high' | 'medium' | 'low';
    ssmlPacing: SegmentPacing;
}
export interface SegmentPacing {
    /** Speed ratio (0.8 = slow, 1.0 = normal, 1.1 = faster) */
    speed: number;
    /** Pause before this segment in ms */
    pauseBefore: number;
    /** Pause after this segment in ms */
    pauseAfter: number;
    /** Volume adjustment (0.9 = softer, 1.0 = normal) */
    volume: number;
}
export interface DeliveryOptions {
    /** Force a specific content type */
    forceContentType?: ContentType;
    /** Persona affects delivery style */
    personaId?: string;
    /** User's current energy level */
    userEnergy?: 'high' | 'medium' | 'low';
    /** Is this responding to a direct question? */
    isDirectResponse?: boolean;
}
/**
 * Detect the type of content being delivered
 */
export declare function detectContentType(text: string): ContentType;
/**
 * Analyze content for optimal delivery pacing
 */
export declare function analyzeContent(text: string, options?: DeliveryOptions): ContentAnalysis;
/**
 * Apply delivery pacing to text, returning SSML-enhanced version
 */
export declare function applyDeliveryPacing(text: string, options?: DeliveryOptions): string;
/**
 * Check if content should use delivery pacing
 */
export declare function shouldApplyDeliveryPacing(text: string): boolean;
/**
 * Add signposting to multi-part content (optional enhancement)
 */
export declare function addSignposting(text: string, options?: {
    addOpening?: boolean;
    addTransitions?: boolean;
}): string;
/**
 * Get a summary phrase for very long content
 */
export declare function getSummaryIntro(contentType: ContentType): string;
declare const _default: {
    detectContentType: typeof detectContentType;
    analyzeContent: typeof analyzeContent;
    applyDeliveryPacing: typeof applyDeliveryPacing;
    shouldApplyDeliveryPacing: typeof shouldApplyDeliveryPacing;
    addSignposting: typeof addSignposting;
    getSummaryIntro: typeof getSummaryIntro;
};
export default _default;
//# sourceMappingURL=content-delivery-pacing.d.ts.map