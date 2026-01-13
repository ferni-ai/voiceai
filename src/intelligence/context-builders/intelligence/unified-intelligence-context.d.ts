/**
 * Unified Intelligence Context Builder
 *
 * Integrates the full Unified Intelligence system (Levels 2-5)
 * into the context builder pipeline:
 * - Context Assembly (Level 2) - What matters RIGHT NOW
 * - Cross-Domain Correlation (Level 4) - Patterns humans miss
 * - Proactive Intelligence (Level 5) - WHEN to surface insights
 *
 * This builder surfaces cross-domain correlations and proactive
 * insights at the right moments in conversation.
 *
 * @module intelligence/context-builders/unified-intelligence-context
 */
import { type ContextWindow, type CrossDomainCorrelation, type ProactiveIntelligenceInsight, type SurfaceMoment } from '../../unified-intelligence-api.js';
import type { ContextBuilder } from '../index.js';
interface UnifiedIntelligenceData {
    context: ContextWindow;
    correlations: CrossDomainCorrelation[];
    proactiveInsights: ProactiveIntelligenceInsight[];
    activeInsight?: ProactiveIntelligenceInsight;
}
/**
 * Unified Intelligence Context Builder
 *
 * Priority: standard (50)
 * Category: intelligence
 *
 * This builder is called on every turn to inject unified intelligence
 * context into the LLM prompt.
 */
export declare const unifiedIntelligenceBuilder: ContextBuilder;
/**
 * Get unified intelligence data without injection formatting
 * Useful for direct integration in turn handler
 */
export declare function getUnifiedIntelligenceData(userId: string, options?: {
    moment?: SurfaceMoment;
    voiceEmotion?: {
        primary?: string;
        valence?: string;
        energy?: number;
    };
    recentTopics?: string[];
    forceRefresh?: boolean;
}): Promise<UnifiedIntelligenceData>;
/**
 * Format unified intelligence for direct prompt injection
 */
export declare function formatUnifiedIntelligenceForPrompt(data: UnifiedIntelligenceData): string;
export default unifiedIntelligenceBuilder;
//# sourceMappingURL=unified-intelligence-context.d.ts.map