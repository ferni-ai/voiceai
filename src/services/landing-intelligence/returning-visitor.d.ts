/**
 * Returning Visitor Personalization
 *
 * Recognizes returning visitors and personalizes their experience
 * based on previous interactions.
 *
 * @module services/landing-intelligence/returning-visitor
 */
export interface ReturningVisitorContext {
    /** Visitor ID (from cookie/localStorage) */
    visitorId: string;
    /** First visit timestamp */
    firstVisit: Date;
    /** Last visit timestamp */
    lastVisit: Date;
    /** Total number of visits */
    visitCount: number;
    /** Sections they engaged most with */
    topSections: string[];
    /** Time spent total (seconds) */
    totalTimeSpent: number;
    /** Conversion attempts (CTA clicks without signup) */
    conversionAttempts: number;
    /** Where they typically abandon */
    abandonmentPoints: string[];
    /** Variants they've seen */
    seenVariants: string[];
    /** Any partial signup info */
    hasStartedSignup: boolean;
    /** Preferred time of day to visit */
    preferredTimeOfDay?: string;
}
export interface ReturningVisitorExperience {
    /** Welcome back message (subtle, not creepy) */
    welcomeMessage: string;
    /** Hero overrides */
    heroOverride?: {
        tagline: string;
        headline: string;
        subhead?: string;
    };
    /** Section to surface first */
    surfaceFirst?: string;
    /** Sections to hide (already seen extensively) */
    hideSections?: string[];
    /** Special offer or nudge */
    specialOffer?: {
        type: 'trial_extension' | 'discount' | 'feature_highlight' | 'testimonial';
        message: string;
        ctaText?: string;
    };
    /** Chat widget behavior */
    chatBehavior: 'proactive' | 'passive' | 'hidden';
    /** Chat greeting */
    chatGreeting?: string;
    /** Reasoning */
    reasoning: string;
}
export interface VisitorSession {
    visitorId: string;
    sessionId: string;
    startTime: Date;
    endTime?: Date;
    sectionsViewed: string[];
    timePerSection: Record<string, number>;
    scrollDepth: number;
    ctaClicks: number;
    variantsSeen: string[];
    converted: boolean;
}
export declare function recordVisitorSession(session: VisitorSession): void;
export declare function getReturningVisitorContext(visitorId: string): Promise<ReturningVisitorContext | null>;
export declare function getReturningVisitorExperience(context: ReturningVisitorContext): Promise<ReturningVisitorExperience>;
export declare function generateVisitorId(): string;
//# sourceMappingURL=returning-visitor.d.ts.map