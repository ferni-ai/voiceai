/**
 * Apology Effectiveness Memory - Better Than Human Service
 *
 * What no human friend can do: Remember what kind of apologies work with each person.
 *
 * "With Lisa, your apologies work better when they're action-focused rather
 * than emotional. Last time you said 'I'm so sorry,' she responded coolly.
 * When you said 'Here's what I'll do differently,' she engaged. Try leading
 * with action."
 *
 * @module tools/domains/communication/superhuman-tools/apology-effectiveness
 */
import type { ApologyRecord } from './types.js';
export type ApologyStyle = 'emotional' | 'action' | 'explanation' | 'acknowledgment' | 'responsibility' | 'combination';
/**
 * Detect the apology style(s) in a message.
 */
export declare function detectApologyStyle(message: string): ApologyStyle[];
/**
 * Record an apology and its outcome.
 */
export declare function recordApology(userId: string, record: Omit<ApologyRecord, 'id' | 'recordedAt'>): Promise<ApologyRecord>;
/**
 * Get apology history with a specific contact.
 */
export declare function getApologyHistory(userId: string, contactName: string): Promise<ApologyRecord[]>;
/**
 * Get all apology records for a user.
 */
export declare function getAllApologyRecords(userId: string): Promise<ApologyRecord[]>;
interface ApologyEffectivenessProfile {
    contactName: string;
    totalApologies: number;
    effectiveStyles: Array<{
        style: ApologyStyle;
        successRate: number;
    }>;
    ineffectiveStyles: Array<{
        style: ApologyStyle;
        failureRate: number;
    }>;
    bestApproach: string;
    worstApproach: string;
    insights: string[];
}
/**
 * Analyze apology effectiveness for a specific contact.
 */
export declare function analyzeApologyEffectiveness(userId: string, contactName: string): Promise<ApologyEffectivenessProfile | null>;
/**
 * Get quick recommendation for an apology to a specific person.
 */
export declare function getApologyRecommendation(userId: string, contactName: string): Promise<string>;
/**
 * Build apology context for LLM injection.
 */
export declare function buildApologyContext(userId: string, contactName?: string): Promise<string>;
export declare const apologyEffectiveness: {
    detectStyle: typeof detectApologyStyle;
    record: typeof recordApology;
    getHistory: typeof getApologyHistory;
    analyze: typeof analyzeApologyEffectiveness;
    getRecommendation: typeof getApologyRecommendation;
    buildContext: typeof buildApologyContext;
};
export default apologyEffectiveness;
//# sourceMappingURL=apology-effectiveness.d.ts.map