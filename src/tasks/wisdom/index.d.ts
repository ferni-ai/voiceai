/**
 * Task Wisdom Loader
 *
 * Loads task wisdom definitions from JSON files and compiles them into
 * the format expected by TaskManager.
 *
 * JSON files are organized by category:
 * - micro-tasks.json: Quick, natural moments (1-2 turns)
 * - support-tasks.json: Emotional support and crisis handling
 * - life-events.json: Major life transitions
 * - advice-tasks.json: Wisdom sharing and guidance
 * - relationship-tasks.json: Connection and follow-up tasks
 * - domain-tasks.json: Domain-specific (habits, research, etc.)
 */
import type { ConversationAnalysis } from '../../services/types.js';
export interface TaskWisdom {
    id: string;
    name: string;
    category: 'micro' | 'support' | 'advice' | 'relationship' | 'life_event';
    priority: number;
    domain?: string;
    triggers: {
        emotions?: string[];
        distressThreshold?: number;
        intents?: string[];
        keywords?: RegExp;
        phases?: string[];
        custom?: (analysis: ConversationAnalysis, userText: string) => boolean;
    };
    instructions: {
        base: string;
        ifDistressed?: string;
        ifPositive?: string;
        ifReturning?: string;
    };
    completion?: {
        afterTurns?: number;
        onEmotionChange?: boolean;
        onKeywords?: RegExp;
        custom?: (analysis: ConversationAnalysis, userText: string) => boolean;
    };
    transitions?: {
        entry?: string[];
        exit?: string[];
        toTask?: string;
    };
}
/**
 * Load all task wisdom from JSON files
 */
export declare function loadTaskWisdom(): TaskWisdom[];
/**
 * Get task wisdom (cached after first load)
 */
export declare function getTaskWisdom(): TaskWisdom[];
/**
 * Reload task wisdom (for hot-reloading in development)
 */
export declare function reloadTaskWisdom(): TaskWisdom[];
/**
 * Get task wisdom by category
 */
export declare function getTaskWisdomByCategory(category: TaskWisdom['category']): TaskWisdom[];
/**
 * Get task wisdom by ID
 */
export declare function getTaskWisdomById(id: string): TaskWisdom | undefined;
declare const _default: {
    loadTaskWisdom: typeof loadTaskWisdom;
    getTaskWisdom: typeof getTaskWisdom;
    reloadTaskWisdom: typeof reloadTaskWisdom;
    getTaskWisdomByCategory: typeof getTaskWisdomByCategory;
    getTaskWisdomById: typeof getTaskWisdomById;
};
export default _default;
//# sourceMappingURL=index.d.ts.map