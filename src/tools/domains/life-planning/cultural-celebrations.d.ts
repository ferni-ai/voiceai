/**
 * Cultural Celebrations Database - Jordan's Diversity Awareness
 *
 * Supports planning for diverse cultural celebrations and traditions.
 * Jordan respects and honors different cultures' ways of celebrating
 * life's milestones.
 */
import { llm } from '@livekit/agents';
export interface CulturalCelebrationDetails {
    name: string;
    culture: string;
    description: string;
    typicalAge?: number | string;
    traditions: string[];
    typicalElements: string[];
    attire: string[];
    food: string[];
    guestCount: {
        small: number;
        medium: number;
        large: number;
    };
    planningTimeline: string;
    budgetRange: {
        low: number;
        mid: number;
        high: number;
    };
    tips: string[];
    modernTwists: string[];
}
export declare const CULTURAL_CELEBRATIONS: Record<string, CulturalCelebrationDetails>;
export declare function createCulturalCelebrationTools(): {
    getCulturalCelebrationInfo: llm.FunctionTool<{
        celebrationType: "confirmation" | "quinceanera" | "bar-mitzvah" | "bat-mitzvah" | "sweet-sixteen" | "debutante" | "first-communion";
    }, unknown, string>;
    getCulturalTraditions: llm.FunctionTool<{
        celebrationType: "confirmation" | "quinceanera" | "bar-mitzvah" | "bat-mitzvah" | "sweet-sixteen" | "debutante" | "first-communion";
        aspect: "food" | "attire" | "traditions" | "modern-twists";
    }, unknown, string>;
    suggestCelebration: llm.FunctionTool<{
        age: number;
        culture?: string | undefined;
        budget?: "medium" | "low" | "high" | undefined;
    }, unknown, string>;
};
export default createCulturalCelebrationTools;
//# sourceMappingURL=cultural-celebrations.d.ts.map