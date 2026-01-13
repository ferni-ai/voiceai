/**
 * Landing Intelligence Orchestrator
 *
 * Main entry point that combines all landing intelligence services
 * into a single optimized response.
 *
 * @module services/landing-intelligence/orchestrator
 */
import { type DemoConversation } from './demo-generator.js';
import { type BehaviorSignals, type VisitorIntent } from './intent-detector.js';
import { type LayoutOptimization } from './layout-optimizer.js';
import { type ReturningVisitorExperience } from './returning-visitor.js';
import { type TimeAwareContent, type TimeMode } from './time-aware.js';
import { type GeneratedVariant } from './variant-generator.js';
export interface LandingOptimizationRequest {
    /** Visitor ID (for returning visitor detection) */
    visitorId?: string;
    /** Behavior signals from frontend */
    behaviorSignals?: BehaviorSignals;
    /** Device type */
    device?: 'mobile' | 'tablet' | 'desktop';
    /** Current section being viewed */
    currentSection?: string;
    /** Hour of day (0-23) */
    hour?: number;
    /** Request specific components */
    include?: {
        variant?: boolean;
        layout?: boolean;
        demo?: boolean;
        chatGreeting?: boolean;
        timeContent?: boolean;
        returningExperience?: boolean;
    };
}
export interface LandingOptimizationResponse {
    /** Unique response ID */
    responseId: string;
    /** Processing time in ms */
    processingTime: number;
    /** Detected visitor intent */
    intent?: VisitorIntent;
    /** Time-aware content */
    timeContent?: TimeAwareContent;
    /** Returning visitor experience */
    returningExperience?: ReturningVisitorExperience;
    /** Generated variant */
    variant?: GeneratedVariant;
    /** Layout optimization */
    layout?: LayoutOptimization;
    /** Demo conversation */
    demo?: DemoConversation;
    /** Chat widget greeting */
    chatGreeting?: {
        message: string;
        timing: {
            shouldShow: boolean;
            delay: number;
        };
    };
    /** Metadata */
    meta: {
        timeMode: TimeMode;
        isReturning: boolean;
        visitCount: number;
        patternsUsed: number;
    };
}
export declare function optimizeLandingPage(request: LandingOptimizationRequest): Promise<LandingOptimizationResponse>;
export declare function getQuickOptimization(section: string, timeOnPage: number, scrollDepth: number): Promise<{
    chatGreeting?: string;
    shouldShowChat: boolean;
    delay: number;
}>;
//# sourceMappingURL=orchestrator.d.ts.map