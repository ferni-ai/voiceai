/**
 * Unspoken Needs Translator - Better Than Human Service
 *
 * What no human friend can do: Help you see what you actually need.
 *
 * "When you say 'My sister never calls,' I hear an underlying need for feeling
 * valued, not the call itself. Would it help to tell her 'It means a lot when
 * you reach out first' instead of 'You never call'? That names what you
 * actually need."
 *
 * @module tools/domains/communication/superhuman-tools/unspoken-needs
 */
import type { UnspokenNeed } from './types.js';
export type NeedCategory = 'belonging' | 'autonomy' | 'competence' | 'security' | 'meaning' | 'connection' | 'respect';
/**
 * Detect the underlying need from a complaint or expression.
 */
export declare function detectUnderlyingNeed(complaint: string): {
    category: NeedCategory;
    confidence: number;
    betterExpression: string;
} | null;
/**
 * Translate a complaint into a need statement.
 */
export declare function translateToNeed(complaint: string, targetPerson?: string): {
    originalComplaint: string;
    underlyingNeed: string;
    needCategory: NeedCategory;
    betterWayToExpress: string;
    whyItMatters: string;
} | null;
/**
 * Save a detected unspoken need.
 */
export declare function saveUnspokenNeed(userId: string, need: Omit<UnspokenNeed, 'id' | 'detectedAt'>): Promise<UnspokenNeed>;
/**
 * Get unspoken needs that have been detected.
 */
export declare function getUnspokenNeeds(userId: string): Promise<UnspokenNeed[]>;
/**
 * Mark a need as surfaced (we helped them articulate it).
 */
export declare function markNeedSurfaced(userId: string, needId: string): Promise<void>;
/**
 * Mark a need as addressed.
 */
export declare function markNeedAddressed(userId: string, needId: string): Promise<void>;
/**
 * Analyze need patterns for a user.
 */
export declare function analyzeNeedPatterns(userId: string): Promise<{
    dominantNeeds: Array<{
        category: NeedCategory;
        frequency: number;
    }>;
    recurringPeople: Array<{
        person: string;
        needs: NeedCategory[];
    }>;
    insight: string;
}>;
/**
 * Build unspoken needs context for LLM injection.
 */
export declare function buildNeedsContext(userId: string): Promise<string>;
/**
 * Generate a needs translation prompt.
 */
export declare function generateTranslationPrompt(complaint: string): string;
export declare const unspokenNeeds: {
    detect: typeof detectUnderlyingNeed;
    translate: typeof translateToNeed;
    save: typeof saveUnspokenNeed;
    get: typeof getUnspokenNeeds;
    markSurfaced: typeof markNeedSurfaced;
    markAddressed: typeof markNeedAddressed;
    analyzePatterns: typeof analyzeNeedPatterns;
    buildContext: typeof buildNeedsContext;
    generatePrompt: typeof generateTranslationPrompt;
    NEED_CATEGORIES: Record<NeedCategory, {
        description: string;
        surfaceComplaints: RegExp[];
        betterExpressions: string[];
    }>;
};
export default unspokenNeeds;
//# sourceMappingURL=unspoken-needs.d.ts.map