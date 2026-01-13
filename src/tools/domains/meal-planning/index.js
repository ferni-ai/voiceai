/**
 * Meal Planning Tools
 *
 * Tools for meal planning and recipes:
 * - Weekly meal planning
 * - Recipe management
 * - Shopping list generation
 * - Dietary preferences
 *
 * DOMAIN: meal-planning
 */
import { z } from 'zod';
import { llm } from '@livekit/agents';
import { createLogger } from '../../../utils/safe-logger.js';
import { getMealPlanner } from '../../../services/meals/meal-planner.js';
import { addRecipe, searchRecipes, recordCooking, updatePreferences, } from '../../../services/stores/meal-store.js';
const log = createLogger({ module: 'meal-planning-tools' });
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
export function getMealPlanningToolDefinitions() {
    return [
        // =========================================================================
        // planWeeklyMeals - Generate meal plan
        // =========================================================================
        {
            id: 'planWeeklyMeals',
            name: 'Plan Weekly Meals',
            description: 'Generate a weekly meal plan based on your preferences and recipes.',
            domain: 'meal-planning',
            tags: ['meal', 'plan', 'weekly', 'menu'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Generate a weekly meal plan based on your preferences and recipes.',
                    parameters: z.object({
                        includeBreakfast: z
                            .boolean()
                            .optional()
                            .describe('Include breakfast in the plan (default: true)'),
                        includeLunch: z
                            .boolean()
                            .optional()
                            .describe('Include lunch in the plan (default: true)'),
                        includeDinner: z
                            .boolean()
                            .optional()
                            .describe('Include dinner in the plan (default: true)'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to create a meal plan.';
                        }
                        const planner = getMealPlanner(userId);
                        const plan = await planner.generateWeeklyPlan(params);
                        if (plan.days.every((d) => !d.meals.breakfast && !d.meals.lunch && !d.meals.dinner)) {
                            return "You don't have any recipes saved yet. " +
                                "Try adding some recipes first, then I can help you plan your meals!";
                        }
                        let response = `📅 **Your Meal Plan**\n`;
                        response += `${plan.startDate} to ${plan.endDate}\n\n`;
                        for (const day of plan.days) {
                            response += `**${day.dayName}**\n`;
                            if (day.meals.breakfast) {
                                response += `  🌅 Breakfast: ${day.meals.breakfast.name}\n`;
                            }
                            if (day.meals.lunch) {
                                response += `  ☀️ Lunch: ${day.meals.lunch.name}\n`;
                            }
                            if (day.meals.dinner) {
                                response += `  🌙 Dinner: ${day.meals.dinner.name}\n`;
                            }
                            response += '\n';
                        }
                        if (plan.shoppingList.length > 0) {
                            response += `\n🛒 **Shopping List** (${plan.shoppingList.length} items)\n`;
                            response += `Say "generate shopping list" to see the full list.`;
                        }
                        return response;
                    },
                });
            },
        },
        // =========================================================================
        // addRecipe - Save a recipe
        // =========================================================================
        {
            id: 'addRecipe',
            name: 'Add Recipe',
            description: 'Save a new recipe to your collection.',
            domain: 'meal-planning',
            tags: ['recipe', 'add', 'save'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Save a new recipe to your collection.',
                    parameters: z.object({
                        name: z.string().describe('Name of the recipe'),
                        ingredients: z
                            .array(z.string())
                            .describe('List of ingredients'),
                        instructions: z
                            .array(z.string())
                            .optional()
                            .describe('Cooking instructions'),
                        prepTime: z.number().optional().describe('Prep time in minutes'),
                        cookTime: z.number().optional().describe('Cook time in minutes'),
                        servings: z.number().optional().describe('Number of servings'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to save a recipe.';
                        }
                        const recipe = await addRecipe(userId, {
                            name: params.name,
                            ingredients: params.ingredients.map((i) => ({
                                name: i,
                                amount: 1,
                                unit: 'unit',
                                optional: false,
                            })),
                            instructions: params.instructions || [],
                            prepTimeMinutes: params.prepTime || 15,
                            cookTimeMinutes: params.cookTime || 30,
                            totalTimeMinutes: (params.prepTime || 15) + (params.cookTime || 30),
                            servings: params.servings || 4,
                            mealTypes: ['dinner'],
                            difficulty: 'medium',
                            dietaryTags: [],
                            tags: [],
                        });
                        return `✅ Recipe saved: **${recipe.name}**\n\n` +
                            `You can now include it in your meal plans!`;
                    },
                });
            },
        },
        // =========================================================================
        // searchRecipes - Find by ingredients or cuisine
        // =========================================================================
        {
            id: 'searchRecipes',
            name: 'Search Recipes',
            description: 'Search your recipe collection by name, ingredients, or cuisine.',
            domain: 'meal-planning',
            tags: ['recipe', 'search', 'find'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Search your recipe collection by name, ingredients, or cuisine.',
                    parameters: z.object({
                        query: z.string().describe('Search term (recipe name, ingredient, or cuisine)'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to search your recipes.';
                        }
                        const results = await searchRecipes(userId, params.query);
                        if (results.length === 0) {
                            return `No recipes found matching "${params.query}". ` +
                                `Try a different search term or add some recipes to your collection.`;
                        }
                        let response = `🍳 **Found ${results.length} recipe(s):**\n\n`;
                        for (const recipe of results.slice(0, 5)) {
                            response += `**${recipe.name}**`;
                            if (recipe.rating)
                                response += ` (${recipe.rating}⭐)`;
                            if (recipe.isFavorite)
                                response += ' ❤️';
                            response += `\n`;
                            response += `  ⏱️ ${recipe.totalTimeMinutes} min | 👥 ${recipe.servings} servings\n`;
                            if (recipe.dietaryTags.length > 0) {
                                response += `  🏷️ ${recipe.dietaryTags.join(', ')}\n`;
                            }
                            response += '\n';
                        }
                        if (results.length > 5) {
                            response += `...and ${results.length - 5} more`;
                        }
                        return response;
                    },
                });
            },
        },
        // =========================================================================
        // suggestMeals - "What can I make with..."
        // =========================================================================
        {
            id: 'suggestMeals',
            name: 'Suggest Meals',
            description: 'Suggest meals based on ingredients you have.',
            domain: 'meal-planning',
            tags: ['recipe', 'suggest', 'ingredients'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Suggest meals based on ingredients you have.',
                    parameters: z.object({
                        ingredients: z
                            .array(z.string())
                            .describe('Ingredients you have available'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to suggest meals.';
                        }
                        const planner = getMealPlanner(userId);
                        const suggestions = await planner.suggestWithIngredients(params.ingredients);
                        if (suggestions.length === 0) {
                            return `I couldn't find recipes matching those ingredients. ` +
                                `Try adding more recipes to your collection, or tell me what you'd like to make!`;
                        }
                        let response = `🍽️ **What you can make:**\n\n`;
                        for (const suggestion of suggestions) {
                            response += `**${suggestion.recipe.name}** (${Math.round(suggestion.score)}% match)\n`;
                            response += `  ${suggestion.reason}\n\n`;
                        }
                        return response;
                    },
                });
            },
        },
        // =========================================================================
        // generateShoppingList - Create list from meal plan
        // =========================================================================
        {
            id: 'generateShoppingList',
            name: 'Generate Shopping List',
            description: 'Generate a shopping list from your meal plan.',
            domain: 'meal-planning',
            tags: ['shopping', 'list', 'groceries'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Generate a shopping list from your meal plan.',
                    parameters: z.object({}),
                    execute: async () => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to generate a shopping list.';
                        }
                        const planner = getMealPlanner(userId);
                        const plan = await planner.generateWeeklyPlan({});
                        if (plan.shoppingList.length === 0) {
                            return "No shopping list to generate. " +
                                "Create a meal plan first, then I can generate the shopping list.";
                        }
                        let response = `🛒 **Shopping List**\n`;
                        response += `For meal plan: ${plan.startDate} to ${plan.endDate}\n\n`;
                        // Group by likely store section
                        const grouped = groupIngredients(plan.shoppingList);
                        for (const [section, items] of Object.entries(grouped)) {
                            if (items.length === 0)
                                continue;
                            response += `**${section}:**\n`;
                            for (const item of items) {
                                response += `- ${item.ingredient} (${item.amount} ${item.unit})\n`;
                            }
                            response += '\n';
                        }
                        return response;
                    },
                });
            },
        },
        // =========================================================================
        // trackDietaryPreferences - Allergies, restrictions
        // =========================================================================
        {
            id: 'trackDietaryPreferences',
            name: 'Track Dietary Preferences',
            description: 'Set dietary preferences, allergies, or restrictions.',
            domain: 'meal-planning',
            tags: ['diet', 'allergy', 'restriction', 'preference'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Set dietary preferences, allergies, or restrictions.',
                    parameters: z.object({
                        restrictions: z
                            .array(z.string())
                            .optional()
                            .describe('Dietary restrictions (vegetarian, vegan, gluten-free, etc.)'),
                        allergies: z
                            .array(z.string())
                            .optional()
                            .describe('Food allergies (nuts, dairy, shellfish, etc.)'),
                        disliked: z
                            .array(z.string())
                            .optional()
                            .describe('Ingredients you dislike'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to save your preferences.';
                        }
                        await updatePreferences(userId, {
                            restrictions: (params.restrictions || []),
                            allergies: params.allergies || [],
                            dislikedIngredients: params.disliked || [],
                        });
                        let response = '✅ **Dietary preferences updated:**\n\n';
                        if (params.restrictions?.length) {
                            response += `🥗 Restrictions: ${params.restrictions.join(', ')}\n`;
                        }
                        if (params.allergies?.length) {
                            response += `⚠️ Allergies: ${params.allergies.join(', ')}\n`;
                        }
                        if (params.disliked?.length) {
                            response += `👎 Avoid: ${params.disliked.join(', ')}\n`;
                        }
                        response += '\nI\'ll use these when suggesting recipes and planning meals.';
                        return response;
                    },
                });
            },
        },
        // =========================================================================
        // markRecipeCooked - Record cooking
        // =========================================================================
        {
            id: 'markRecipeCooked',
            name: 'Mark Recipe Cooked',
            description: 'Record that you cooked a recipe, with optional rating.',
            domain: 'meal-planning',
            tags: ['recipe', 'cooked', 'rating'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Record that you cooked a recipe, with optional rating.',
                    parameters: z.object({
                        recipeName: z.string().describe('Name of the recipe you cooked'),
                        rating: z
                            .number()
                            .min(1)
                            .max(5)
                            .optional()
                            .describe('Rating from 1-5 stars'),
                        notes: z.string().optional().describe('Any notes about the recipe'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to track your cooking.';
                        }
                        const recipes = await searchRecipes(userId, params.recipeName);
                        if (recipes.length === 0) {
                            return `I couldn't find a recipe named "${params.recipeName}".`;
                        }
                        const recipe = recipes[0];
                        await recordCooking(userId, recipe.id, params.rating, params.notes);
                        let response = `✅ Recorded: You made **${recipe.name}**!`;
                        if (params.rating) {
                            response += ` (${params.rating}⭐)`;
                        }
                        return response;
                    },
                });
            },
        },
    ];
}
// ============================================================================
// HELPERS
// ============================================================================
function groupIngredients(items) {
    const groups = {
        'Produce': [],
        'Meat & Seafood': [],
        'Dairy': [],
        'Bakery': [],
        'Pantry': [],
        'Frozen': [],
        'Other': [],
    };
    const produceKeywords = ['lettuce', 'tomato', 'onion', 'garlic', 'pepper', 'carrot', 'celery', 'potato', 'apple', 'banana', 'lemon', 'lime', 'herb', 'basil', 'parsley', 'cilantro'];
    const meatKeywords = ['chicken', 'beef', 'pork', 'fish', 'salmon', 'shrimp', 'turkey', 'bacon', 'sausage'];
    const dairyKeywords = ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'egg'];
    const bakeryKeywords = ['bread', 'roll', 'tortilla', 'pita'];
    const frozenKeywords = ['frozen'];
    for (const item of items) {
        const lower = item.ingredient.toLowerCase();
        if (produceKeywords.some((k) => lower.includes(k))) {
            groups['Produce'].push(item);
        }
        else if (meatKeywords.some((k) => lower.includes(k))) {
            groups['Meat & Seafood'].push(item);
        }
        else if (dairyKeywords.some((k) => lower.includes(k))) {
            groups['Dairy'].push(item);
        }
        else if (bakeryKeywords.some((k) => lower.includes(k))) {
            groups['Bakery'].push(item);
        }
        else if (frozenKeywords.some((k) => lower.includes(k))) {
            groups['Frozen'].push(item);
        }
        else {
            groups['Pantry'].push(item);
        }
    }
    return groups;
}
// ============================================================================
// DOMAIN EXPORT
// ============================================================================
export function getToolDefinitions() {
    return getMealPlanningToolDefinitions();
}
export const definitions = getMealPlanningToolDefinitions();
//# sourceMappingURL=index.js.map