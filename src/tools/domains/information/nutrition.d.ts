/**
 * Nutrition Information Tools
 *
 * Domain: Food nutrition data and calorie information.
 * Single responsibility: Looking up nutritional information for foods.
 *
 * APIs used:
 * - USDA FoodData Central (free, no key required for basic access)
 * - Nutritionix (fallback, requires API key)
 */
import { llm } from '@livekit/agents';
/**
 * Get nutrition information for a food
 */
export declare function getNutritionInfo(food: string): Promise<string>;
/**
 * Compare nutrition of two foods
 */
export declare function compareNutrition(food1: string, food2: string): Promise<string>;
export declare function createNutritionTools(): {
    getNutritionInfo: llm.FunctionTool<{
        food: string;
    }, unknown, string>;
    compareNutrition: llm.FunctionTool<{
        food1: string;
        food2: string;
    }, unknown, string>;
};
export default createNutritionTools;
//# sourceMappingURL=nutrition.d.ts.map