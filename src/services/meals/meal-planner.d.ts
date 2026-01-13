/**
 * Meal Planner Service
 *
 * Intelligent meal planning with recipe management:
 * - Weekly meal planning
 * - Recipe suggestions
 * - Shopping list generation
 * - Dietary preference handling
 *
 * @module services/meals/meal-planner
 */
import { type Recipe, type MealType } from '../stores/meal-store.js';
export interface MealSuggestion {
    recipe: Recipe;
    reason: string;
    score: number;
}
export interface WeeklyPlan {
    startDate: string;
    endDate: string;
    days: Array<{
        date: string;
        dayName: string;
        meals: {
            breakfast?: Recipe;
            lunch?: Recipe;
            dinner?: Recipe;
            snacks?: Recipe[];
        };
    }>;
    shoppingList: Array<{
        ingredient: string;
        amount: number;
        unit: string;
        recipes: string[];
    }>;
    nutritionSummary?: {
        avgCalories: number;
        avgProtein: number;
        avgCarbs: number;
        avgFat: number;
    };
}
export declare class MealPlanner {
    private userId;
    constructor(userId: string);
    /**
     * Get meal suggestions based on user preferences and history
     */
    getSuggestions(params: {
        mealType?: MealType;
        maxPrepTime?: number;
        count?: number;
    }): Promise<MealSuggestion[]>;
    /**
     * Suggest what to make with available ingredients
     */
    suggestWithIngredients(ingredients: string[]): Promise<MealSuggestion[]>;
    /**
     * Get quick meal suggestions
     */
    getQuickMeals(maxMinutes?: number): Promise<Recipe[]>;
    /**
     * Generate reason for suggestion
     */
    private generateSuggestionReason;
    /**
     * Score a recipe for suggestions
     */
    private scoreRecipe;
    /**
     * Generate a weekly meal plan
     */
    generateWeeklyPlan(params: {
        startDate?: Date;
        includeBreakfast?: boolean;
        includeLunch?: boolean;
        includeDinner?: boolean;
    }): Promise<WeeklyPlan>;
    /**
     * Pick a recipe for a meal type, avoiding recently used
     */
    private pickRecipe;
    /**
     * Generate combined shopping list from recipes
     */
    private generateCombinedShoppingList;
    /**
     * Get next Monday
     */
    private getNextMonday;
    /**
     * Import a recipe from URL (basic implementation)
     */
    importRecipeFromUrl(url: string): Promise<Recipe | null>;
    /**
     * Parse recipe from text
     */
    parseRecipeFromText(text: string): Partial<Recipe>;
    /**
     * Parse a single ingredient line
     */
    private parseIngredient;
}
export declare function getMealPlanner(userId: string): MealPlanner;
export declare function resetMealPlanner(userId: string): void;
//# sourceMappingURL=meal-planner.d.ts.map