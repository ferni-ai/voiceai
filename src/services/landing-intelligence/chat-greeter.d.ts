/**
 * Chat Widget Greeter
 *
 * Generates contextual, proactive greetings for the landing page chat widget.
 * Non-intrusive, warm, and relevant to what the visitor is doing.
 *
 * @module services/landing-intelligence/chat-greeter
 */
import type { VisitorIntent } from './intent-detector.js';
import type { TimeMode } from './time-aware.js';
export interface ChatGreetingContext {
    /** Current section being viewed */
    currentSection: string;
    /** Time on page in seconds */
    timeOnPage: number;
    /** Scroll depth percentage */
    scrollDepth: number;
    /** Time mode */
    timeMode?: TimeMode;
    /** Detected intent */
    intent?: VisitorIntent;
    /** Is returning visitor */
    isReturning?: boolean;
    /** Visit count */
    visitCount?: number;
    /** Has hovered CTA without clicking */
    ctaHesitation?: boolean;
}
export declare function generateChatGreeting(context: ChatGreetingContext): Promise<string>;
export interface GreetingTiming {
    /** Should show greeting */
    shouldShow: boolean;
    /** Delay before showing (ms) */
    delay: number;
    /** Reason for decision */
    reason: string;
}
export declare function getGreetingTiming(context: ChatGreetingContext): GreetingTiming;
//# sourceMappingURL=chat-greeter.d.ts.map