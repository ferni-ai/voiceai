/**
 * Enhanced Daily Briefing
 *
 * "Better Than Human" version of daily briefing that integrates:
 * - Environmental health (air quality, UV, pollen)
 * - Proactive alerts (weather-calendar conflicts)
 * - User preferences (favorite teams, watchlist)
 * - Personalized news based on interests
 *
 * A human friend might say "Nice day today!"
 * We say "Great day for your 2pm run - air quality is good, UV is moderate,
 * but bring sunscreen. Oh, and the Eagles play tonight at 8:25!"
 */
import type { ToolDefinition } from '../../registry/types.js';
interface EnhancedBriefingOptions {
    userId: string;
    location?: string;
    includeWeather?: boolean;
    includeSports?: boolean;
    includeAlerts?: boolean;
    includeEnvironmental?: boolean;
}
/**
 * Generate an enhanced "better than human" daily briefing
 */
declare function generateEnhancedBriefing(options: EnhancedBriefingOptions): Promise<string>;
export declare const enhancedBriefingToolDefinitions: ToolDefinition[];
/**
 * Get enhanced briefing tool definitions
 */
export declare function getEnhancedBriefingToolDefinitions(): ToolDefinition[];
export { generateEnhancedBriefing };
//# sourceMappingURL=enhanced-briefing.d.ts.map