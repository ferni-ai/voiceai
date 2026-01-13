/**
 * Time-Aware Content
 *
 * Adapts landing page content based on time of day.
 * On-brand for Ferni's "2am presence" positioning.
 *
 * @module services/landing-intelligence/time-aware
 */
export type TimeMode = 'late-night' | 'early-morning' | 'morning' | 'afternoon' | 'evening' | 'night';
export interface TimeAwareContent {
    /** Time mode */
    mode: TimeMode;
    /** Hero overrides */
    hero: {
        tagline: string;
        headline: string;
        subhead: string;
    };
    /** Chat widget greeting */
    chatGreeting: string;
    /** Section to emphasize */
    emphasizeSection: string;
    /** Visual mode */
    visualMode: 'light' | 'dark' | 'auto';
    /** Background treatment */
    backgroundTreatment: 'default' | 'dim' | 'warm' | 'calming';
    /** CTA adjustment */
    ctaOverride?: {
        text: string;
        style: 'primary' | 'secondary' | 'ghost';
    };
}
export declare function getTimeMode(hour?: number): TimeMode;
export declare function getTimeAwareContent(hour?: number): TimeAwareContent;
export declare function getTimeAwareContentWithOccasions(hour?: number): TimeAwareContent;
export declare function getTimeAwareClasses(content: TimeAwareContent): string[];
//# sourceMappingURL=time-aware.d.ts.map