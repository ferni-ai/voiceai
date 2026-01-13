/**
 * Layout Optimizer
 *
 * Determines optimal section ordering and emphasis based on visitor context.
 * Uses AI to reason about what content will resonate.
 *
 * @module services/landing-intelligence/layout-optimizer
 */
import type { VisitorIntent } from './intent-detector.js';
import type { TimeMode } from './time-aware.js';
export interface SectionEmphasis {
    /** Section ID */
    section: string;
    /** CSS class to add */
    treatment: 'section--expanded' | 'section--highlighted' | 'section--minimal' | 'section--hidden';
    /** Priority within the layout */
    priority: number;
}
export interface LayoutOptimization {
    /** Optimized section order */
    order: string[];
    /** Section emphasis treatments */
    emphasis: SectionEmphasis[];
    /** Sections to hide completely */
    hide: string[];
    /** Why this layout */
    reasoning: string;
    /** Confidence in this layout (0-1) */
    confidence: number;
}
interface LayoutContext {
    intent?: VisitorIntent;
    timeMode?: TimeMode;
    device?: 'mobile' | 'tablet' | 'desktop';
    isReturning?: boolean;
    visitCount?: number;
}
export declare function getOptimalSectionOrder(context: LayoutContext): Promise<LayoutOptimization>;
export declare function optimizeForMobile(layout: LayoutOptimization): LayoutOptimization;
export {};
//# sourceMappingURL=layout-optimizer.d.ts.map