/**
 * Engagement Domain - Helper Functions
 *
 * Utility functions for engagement games and activities.
 *
 * @module engagement/helpers
 */
import type { EmotionalWeather } from '../../../services/daily-rituals.js';
export declare function generateWeatherInsight(trends: {
    dominantWeather: EmotionalWeather['primary'] | null;
    energyTrend: string;
    pattern?: string;
}): string;
export declare function generateDomainInsight(domain: string, rating: number): string;
//# sourceMappingURL=helpers.d.ts.map