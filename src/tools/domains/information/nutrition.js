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
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
/**
 * Get nutrition info from USDA FoodData Central
 */
async function getUSDANutrition(food) {
    const log = getLogger();
    try {
        // Search for food
        const searchUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(food)}&pageSize=1&dataType=Foundation,SR%20Legacy`;
        const apiKey = process.env.USDA_API_KEY || 'DEMO_KEY';
        const response = await fetch(`${searchUrl}&api_key=${apiKey}`, {
            signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
            log.debug({ food, status: response.status }, '🍎 USDA API error');
            return null;
        }
        const data = (await response.json());
        if (!data.foods?.length) {
            log.debug({ food }, '🍎 No USDA results');
            return null;
        }
        const item = data.foods[0];
        const nutrients = item.foodNutrients || [];
        // Extract key nutrients
        const findNutrient = (name) => {
            const nutrient = nutrients.find((n) => n.nutrientName.toLowerCase().includes(name.toLowerCase()));
            return nutrient?.value || 0;
        };
        return {
            name: item.description,
            calories: Math.round(findNutrient('energy')),
            protein: Math.round(findNutrient('protein') * 10) / 10,
            carbs: Math.round(findNutrient('carbohydrate') * 10) / 10,
            fat: Math.round(findNutrient('total lipid') * 10) / 10,
            fiber: Math.round(findNutrient('fiber') * 10) / 10,
            sugar: Math.round(findNutrient('sugars') * 10) / 10,
            servingSize: item.servingSize ? `${item.servingSize}${item.servingSizeUnit || 'g'}` : '100g',
        };
    }
    catch (error) {
        log.warn({ food, error: String(error) }, '🍎 USDA exception');
        return null;
    }
}
/**
 * Common food nutrition lookup (built-in fallback)
 */
const COMMON_FOODS = {
    banana: {
        name: 'Banana',
        calories: 105,
        protein: 1.3,
        carbs: 27,
        fat: 0.4,
        fiber: 3.1,
        sugar: 14,
        servingSize: '1 medium (118g)',
    },
    apple: {
        name: 'Apple',
        calories: 95,
        protein: 0.5,
        carbs: 25,
        fat: 0.3,
        fiber: 4.4,
        sugar: 19,
        servingSize: '1 medium (182g)',
    },
    egg: {
        name: 'Egg',
        calories: 78,
        protein: 6.3,
        carbs: 0.6,
        fat: 5.3,
        fiber: 0,
        sugar: 0.6,
        servingSize: '1 large (50g)',
    },
    'chicken breast': {
        name: 'Chicken Breast',
        calories: 165,
        protein: 31,
        carbs: 0,
        fat: 3.6,
        fiber: 0,
        sugar: 0,
        servingSize: '100g cooked',
    },
    rice: {
        name: 'White Rice',
        calories: 206,
        protein: 4.3,
        carbs: 45,
        fat: 0.4,
        fiber: 0.6,
        sugar: 0,
        servingSize: '1 cup cooked (158g)',
    },
    salmon: {
        name: 'Salmon',
        calories: 208,
        protein: 20,
        carbs: 0,
        fat: 13,
        fiber: 0,
        sugar: 0,
        servingSize: '100g cooked',
    },
    avocado: {
        name: 'Avocado',
        calories: 322,
        protein: 4,
        carbs: 17,
        fat: 29,
        fiber: 13,
        sugar: 1.3,
        servingSize: '1 whole (201g)',
    },
    bread: {
        name: 'Whole Wheat Bread',
        calories: 81,
        protein: 4,
        carbs: 14,
        fat: 1.1,
        fiber: 1.9,
        sugar: 1.4,
        servingSize: '1 slice (28g)',
    },
    milk: {
        name: 'Whole Milk',
        calories: 149,
        protein: 8,
        carbs: 12,
        fat: 8,
        fiber: 0,
        sugar: 12,
        servingSize: '1 cup (244ml)',
    },
    coffee: {
        name: 'Black Coffee',
        calories: 2,
        protein: 0.3,
        carbs: 0,
        fat: 0,
        fiber: 0,
        sugar: 0,
        servingSize: '1 cup (240ml)',
    },
    pizza: {
        name: 'Pizza (Cheese)',
        calories: 285,
        protein: 12,
        carbs: 36,
        fat: 10,
        fiber: 2.5,
        sugar: 4,
        servingSize: '1 slice (107g)',
    },
    hamburger: {
        name: 'Hamburger',
        calories: 540,
        protein: 34,
        carbs: 40,
        fat: 27,
        fiber: 3,
        sugar: 11,
        servingSize: '1 burger (226g)',
    },
    salad: {
        name: 'Garden Salad',
        calories: 35,
        protein: 2.6,
        carbs: 7,
        fat: 0.4,
        fiber: 3.1,
        sugar: 4,
        servingSize: '1 cup (85g)',
    },
    orange: {
        name: 'Orange',
        calories: 62,
        protein: 1.2,
        carbs: 15,
        fat: 0.2,
        fiber: 3.1,
        sugar: 12,
        servingSize: '1 medium (131g)',
    },
    yogurt: {
        name: 'Greek Yogurt',
        calories: 100,
        protein: 17,
        carbs: 6,
        fat: 0.7,
        fiber: 0,
        sugar: 4,
        servingSize: '1 cup (245g)',
    },
};
function findCommonFood(query) {
    const lowerQuery = query.toLowerCase();
    // Direct match
    if (COMMON_FOODS[lowerQuery]) {
        return COMMON_FOODS[lowerQuery];
    }
    // Partial match
    for (const [key, data] of Object.entries(COMMON_FOODS)) {
        if (lowerQuery.includes(key) || key.includes(lowerQuery)) {
            return data;
        }
    }
    return null;
}
// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================
/**
 * Get nutrition information for a food
 */
export async function getNutritionInfo(food) {
    const log = getLogger();
    log.info({ food }, '🍎 Looking up nutrition');
    // Try common foods first (instant response)
    let nutrition = findCommonFood(food);
    // Try USDA if not found
    if (!nutrition) {
        nutrition = await getUSDANutrition(food);
    }
    if (!nutrition) {
        return `I couldn't find nutrition info for "${food}". Try common foods like apple, chicken breast, rice, or banana.`;
    }
    const parts = [
        `${nutrition.name} (${nutrition.servingSize}):`,
        `${nutrition.calories} calories`,
        `${nutrition.protein}g protein`,
        `${nutrition.carbs}g carbs`,
        `${nutrition.fat}g fat`,
    ];
    if (nutrition.fiber && nutrition.fiber > 0) {
        parts.push(`${nutrition.fiber}g fiber`);
    }
    if (nutrition.sugar && nutrition.sugar > 0) {
        parts.push(`${nutrition.sugar}g sugar`);
    }
    return `${parts.join(', ')}.`;
}
/**
 * Compare nutrition of two foods
 */
export async function compareNutrition(food1, food2) {
    const log = getLogger();
    log.info({ food1, food2 }, '🍎 Comparing nutrition');
    const [n1, n2] = await Promise.all([
        findCommonFood(food1) || getUSDANutrition(food1),
        findCommonFood(food2) || getUSDANutrition(food2),
    ]);
    if (!n1 && !n2) {
        return `I couldn't find nutrition info for either "${food1}" or "${food2}".`;
    }
    if (!n1) {
        return `I couldn't find nutrition info for "${food1}", but ${await getNutritionInfo(food2)}`;
    }
    if (!n2) {
        return `I couldn't find nutrition info for "${food2}", but ${await getNutritionInfo(food1)}`;
    }
    const comparison = [];
    // Calorie comparison
    if (n1.calories !== n2.calories) {
        const higher = n1.calories > n2.calories ? n1.name : n2.name;
        const diff = Math.abs(n1.calories - n2.calories);
        comparison.push(`${higher} has ${diff} more calories`);
    }
    // Protein comparison
    if (n1.protein !== n2.protein) {
        const higher = n1.protein > n2.protein ? n1.name : n2.name;
        comparison.push(`${higher} has more protein (${Math.max(n1.protein, n2.protein)}g vs ${Math.min(n1.protein, n2.protein)}g)`);
    }
    return `Comparing ${n1.name} vs ${n2.name}: ${comparison.join('. ')}. ${n1.name}: ${n1.calories} cal, ${n1.protein}g protein. ${n2.name}: ${n2.calories} cal, ${n2.protein}g protein.`;
}
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
export function createNutritionTools() {
    const logger = getLogger();
    return {
        getNutritionInfo: llm.tool({
            description: 'Get nutritional information for a food including calories, protein, carbs, and fat. Use when user asks about nutrition, calories, or macros of a food.',
            parameters: z.object({
                food: z.string().describe('Name of the food (e.g., "banana", "chicken breast", "pizza")'),
            }),
            execute: async ({ food }) => {
                logger.info({ food }, '🍎 Nutrition tool called');
                return getNutritionInfo(food);
            },
        }),
        compareNutrition: llm.tool({
            description: 'Compare nutritional information between two foods. Use when user asks which food is healthier or wants to compare calories/macros.',
            parameters: z.object({
                food1: z.string().describe('First food to compare'),
                food2: z.string().describe('Second food to compare'),
            }),
            execute: async ({ food1, food2 }) => {
                logger.info({ food1, food2 }, '🍎 Nutrition comparison tool called');
                return compareNutrition(food1, food2);
            },
        }),
    };
}
export default createNutritionTools;
//# sourceMappingURL=nutrition.js.map