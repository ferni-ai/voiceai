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

import { createLogger } from '../../utils/safe-logger.js';
import {
  getMealData,
  getRecipesForDiet,
  getQuickRecipes,
  suggestRecipesByIngredients,
  type Recipe,
  type MealType,
  type Ingredient,
  type MealData,
} from '../stores/meal-store.js';

const log = createLogger({ module: 'meal-planner' });

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// MEAL PLANNER CLASS
// ============================================================================

export class MealPlanner {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  // ==========================================================================
  // MEAL SUGGESTIONS
  // ==========================================================================

  /**
   * Get meal suggestions based on user preferences and history
   */
  async getSuggestions(params: {
    mealType?: MealType;
    maxPrepTime?: number;
    count?: number;
  }): Promise<MealSuggestion[]> {
    const data = await getMealData(this.userId);
    
    let candidates = data.recipes;
    
    // Filter by meal type
    if (params.mealType) {
      candidates = candidates.filter((r) => r.mealTypes.includes(params.mealType!));
    }
    
    // Filter by prep time
    if (params.maxPrepTime) {
      candidates = candidates.filter((r) => r.totalTimeMinutes <= params.maxPrepTime!);
    }
    
    // Filter by dietary restrictions
    const dietaryRecipes = await getRecipesForDiet(this.userId);
    candidates = candidates.filter((r) => dietaryRecipes.some((dr) => dr.id === r.id));
    
    // Score and rank
    const suggestions: MealSuggestion[] = candidates.map((recipe) => ({
      recipe,
      reason: this.generateSuggestionReason(recipe, data),
      score: this.scoreRecipe(recipe, data),
    }));
    
    // Sort by score and limit
    suggestions.sort((a, b) => b.score - a.score);
    return suggestions.slice(0, params.count || 5);
  }

  /**
   * Suggest what to make with available ingredients
   */
  async suggestWithIngredients(ingredients: string[]): Promise<MealSuggestion[]> {
    const results = await suggestRecipesByIngredients(this.userId, ingredients);
    
    return results.slice(0, 5).map(({ recipe, matchPercentage, missingIngredients }) => ({
      recipe,
      reason: matchPercentage >= 90
        ? 'You have all the ingredients!'
        : `Missing ${missingIngredients.length} ingredients: ${missingIngredients.slice(0, 3).join(', ')}`,
      score: matchPercentage,
    }));
  }

  /**
   * Get quick meal suggestions
   */
  async getQuickMeals(maxMinutes: number = 30): Promise<Recipe[]> {
    return getQuickRecipes(this.userId, maxMinutes);
  }

  /**
   * Generate reason for suggestion
   */
  private generateSuggestionReason(recipe: Recipe, data: MealData): string {
    if (recipe.isFavorite) {
      return 'One of your favorites';
    }
    if (recipe.rating && recipe.rating >= 4) {
      return `You rated this ${recipe.rating} stars`;
    }
    if (recipe.timesCooked === 0) {
      return 'Something new to try';
    }
    if (recipe.totalTimeMinutes <= 20) {
      return 'Quick and easy';
    }
    if (recipe.cuisineType && data.preferences.preferredCuisines.includes(recipe.cuisineType)) {
      return `${recipe.cuisineType} cuisine - one of your favorites`;
    }
    return 'Matches your preferences';
  }

  /**
   * Score a recipe for suggestions
   */
  private scoreRecipe(recipe: Recipe, data: MealData): number {
    let score = 50;
    
    // Boost favorites
    if (recipe.isFavorite) score += 20;
    
    // Boost high ratings
    if (recipe.rating) score += recipe.rating * 5;
    
    // Slight boost for never cooked (variety)
    if (recipe.timesCooked === 0) score += 10;
    
    // Boost for preferred cuisines
    if (recipe.cuisineType && data.preferences.preferredCuisines.includes(recipe.cuisineType)) {
      score += 15;
    }
    
    // Boost for quick meals
    if (recipe.totalTimeMinutes <= 30) score += 10;
    
    // Penalize if cooked recently
    if (recipe.lastCookedAt) {
      const daysSince = Math.floor(
        (Date.now() - new Date(recipe.lastCookedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSince < 7) score -= (7 - daysSince) * 3;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  // ==========================================================================
  // WEEKLY PLANNING
  // ==========================================================================

  /**
   * Generate a weekly meal plan
   */
  async generateWeeklyPlan(params: {
    startDate?: Date;
    includeBreakfast?: boolean;
    includeLunch?: boolean;
    includeDinner?: boolean;
  }): Promise<WeeklyPlan> {
    const data = await getMealData(this.userId);
    
    const startDate = params.startDate || this.getNextMonday();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    
    const days: WeeklyPlan['days'] = [];
    const usedRecipeIds = new Set<string>();
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      
      const day: WeeklyPlan['days'][0] = {
        date: date.toISOString().split('T')[0],
        dayName: date.toLocaleDateString('en-US', { weekday: 'long' }),
        meals: {},
      };
      
      // Assign meals
      if (params.includeBreakfast !== false) {
        const breakfast = this.pickRecipe(data.recipes, 'breakfast', usedRecipeIds);
        if (breakfast) {
          day.meals.breakfast = breakfast;
          usedRecipeIds.add(breakfast.id);
        }
      }
      
      if (params.includeLunch !== false) {
        const lunch = this.pickRecipe(data.recipes, 'lunch', usedRecipeIds);
        if (lunch) {
          day.meals.lunch = lunch;
          usedRecipeIds.add(lunch.id);
        }
      }
      
      if (params.includeDinner !== false) {
        const dinner = this.pickRecipe(data.recipes, 'dinner', usedRecipeIds);
        if (dinner) {
          day.meals.dinner = dinner;
          usedRecipeIds.add(dinner.id);
        }
      }
      
      days.push(day);
    }
    
    // Generate shopping list
    const recipeIds = Array.from(usedRecipeIds);
    const recipes = data.recipes.filter((r) => recipeIds.includes(r.id));
    const shoppingList = this.generateCombinedShoppingList(recipes);
    
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      days,
      shoppingList,
    };
  }

  /**
   * Pick a recipe for a meal type, avoiding recently used
   */
  private pickRecipe(
    recipes: Recipe[],
    mealType: MealType,
    usedIds: Set<string>
  ): Recipe | undefined {
    const candidates = recipes
      .filter((r) => r.mealTypes.includes(mealType) && !usedIds.has(r.id))
      .sort((a, b) => {
        // Prioritize favorites and highly rated
        let scoreA = 0, scoreB = 0;
        if (a.isFavorite) scoreA += 20;
        if (b.isFavorite) scoreB += 20;
        if (a.rating) scoreA += a.rating * 5;
        if (b.rating) scoreB += b.rating * 5;
        return scoreB - scoreA;
      });
    
    return candidates[0];
  }

  /**
   * Generate combined shopping list from recipes
   */
  private generateCombinedShoppingList(recipes: Recipe[]): WeeklyPlan['shoppingList'] {
    const ingredientMap = new Map<string, { amount: number; unit: string; recipes: string[] }>();
    
    for (const recipe of recipes) {
      for (const ingredient of recipe.ingredients) {
        const key = `${ingredient.name.toLowerCase()}|${ingredient.unit}`;
        const existing = ingredientMap.get(key);
        
        if (existing) {
          existing.amount += ingredient.amount;
          if (!existing.recipes.includes(recipe.name)) {
            existing.recipes.push(recipe.name);
          }
        } else {
          ingredientMap.set(key, {
            amount: ingredient.amount,
            unit: ingredient.unit,
            recipes: [recipe.name],
          });
        }
      }
    }
    
    return Array.from(ingredientMap.entries()).map(([key, value]) => ({
      ingredient: key.split('|')[0],
      ...value,
    }));
  }

  /**
   * Get next Monday
   */
  private getNextMonday(): Date {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? 1 : 8 - day;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + diff);
    nextMonday.setHours(0, 0, 0, 0);
    return nextMonday;
  }

  // ==========================================================================
  // RECIPE IMPORT
  // ==========================================================================

  /**
   * Import a recipe from URL (basic implementation)
   */
  async importRecipeFromUrl(url: string): Promise<Recipe | null> {
    // This would use a recipe parser service in production
    // For now, return null and let the user know
    log.info({ url }, 'Recipe import requested');
    return null;
  }

  /**
   * Parse recipe from text
   */
  parseRecipeFromText(text: string): Partial<Recipe> {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    
    // Basic parsing - look for common patterns
    const recipe: Partial<Recipe> = {
      ingredients: [],
      instructions: [],
      tags: [],
      dietaryTags: [],
      mealTypes: ['dinner'],
    };
    
    let section: 'none' | 'ingredients' | 'instructions' = 'none';
    
    for (const line of lines) {
      const lower = line.toLowerCase();
      
      // Detect section headers
      if (lower.includes('ingredient')) {
        section = 'ingredients';
        continue;
      }
      if (lower.includes('instruction') || lower.includes('direction') || lower.includes('method')) {
        section = 'instructions';
        continue;
      }
      
      // First non-empty line is likely the title
      if (!recipe.name && !line.startsWith('-') && !line.match(/^\d/)) {
        recipe.name = line;
        continue;
      }
      
      // Parse based on section
      if (section === 'ingredients' && (line.startsWith('-') || line.match(/^\d/))) {
        const ingredient = this.parseIngredient(line);
        if (ingredient) {
          recipe.ingredients!.push(ingredient);
        }
      } else if (section === 'instructions' && line.match(/^\d/)) {
        recipe.instructions!.push(line.replace(/^\d+[.)\s]+/, ''));
      }
    }
    
    return recipe;
  }

  /**
   * Parse a single ingredient line
   */
  private parseIngredient(line: string): Ingredient | null {
    // Remove leading dash or number
    const cleaned = line.replace(/^[-•*\d.)\s]+/, '').trim();
    if (!cleaned) return null;
    
    // Try to parse "1 cup flour" pattern
    const match = cleaned.match(/^([\d./]+)?\s*(\w+)?\s+(.+)$/);
    if (match) {
      return {
        name: match[3] || cleaned,
        amount: match[1] ? parseFloat(match[1]) : 1,
        unit: match[2] || 'unit',
        optional: line.toLowerCase().includes('optional'),
      };
    }
    
    return {
      name: cleaned,
      amount: 1,
      unit: 'unit',
      optional: false,
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

const instances: Map<string, MealPlanner> = new Map();

export function getMealPlanner(userId: string): MealPlanner {
  let instance = instances.get(userId);
  if (!instance) {
    instance = new MealPlanner(userId);
    instances.set(userId, instance);
  }
  return instance;
}

export function resetMealPlanner(userId: string): void {
  instances.delete(userId);
}
