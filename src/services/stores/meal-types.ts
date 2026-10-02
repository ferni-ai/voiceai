/**
 * Meal Data Types
 *
 * Type definitions for meal planning (meal-store.ts): recipes, meal plans,
 * dietary preferences and cooking history.
 *
 * @module services/stores/meal-types
 */

// ============================================================================
// TYPES
// ============================================================================

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert';
export type DietaryTag =
  | 'vegetarian'
  | 'vegan'
  | 'gluten_free'
  | 'dairy_free'
  | 'nut_free'
  | 'low_carb'
  | 'keto'
  | 'paleo'
  | 'halal'
  | 'kosher'
  | 'pescatarian'
  | 'low_sodium'
  | 'low_fat'
  | 'high_protein';

export type CuisineType =
  | 'american'
  | 'italian'
  | 'mexican'
  | 'chinese'
  | 'japanese'
  | 'indian'
  | 'thai'
  | 'mediterranean'
  | 'french'
  | 'korean'
  | 'vietnamese'
  | 'middle_eastern'
  | 'african'
  | 'greek'
  | 'spanish'
  | 'other';

export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'expert';

export interface Ingredient {
  name: string;
  amount: number;
  unit: string;
  notes?: string;
  optional: boolean;
  category?: 'produce' | 'meat' | 'dairy' | 'pantry' | 'frozen' | 'bakery' | 'other';
}

export interface NutritionInfo {
  calories?: number;
  protein?: number; // grams
  carbohydrates?: number; // grams
  fat?: number; // grams
  fiber?: number; // grams
  sugar?: number; // grams
  sodium?: number; // mg
  servingSize?: string;
}

export interface Recipe {
  id: string;
  userId: string;
  name: string;
  description?: string;

  // Categorization
  mealTypes: MealType[];
  cuisineType?: CuisineType;
  dietaryTags: DietaryTag[];
  difficulty: DifficultyLevel;

  // Time
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  totalTimeMinutes: number;

  // Servings
  servings: number;

  // Ingredients
  ingredients: Ingredient[];

  // Instructions
  instructions: string[];
  tips?: string[];

  // Nutrition
  nutrition?: NutritionInfo;

  // Media
  imageUrl?: string;
  sourceUrl?: string;
  sourceName?: string;

  // User data
  rating?: number; // 1-5
  timesCooked: number;
  lastCookedAt?: string;
  notes?: string;
  tags: string[];
  isFavorite: boolean;

  // Audit
  createdAt: string;
  updatedAt: string;
}

export interface MealPlanEntry {
  id: string;
  date: string; // ISO date (YYYY-MM-DD)
  mealType: MealType;
  recipeId?: string;
  customMealName?: string;
  servings: number;
  notes?: string;
  completed: boolean;
}

export interface MealPlan {
  id: string;
  userId: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  entries: MealPlanEntry[];

  // Generated shopping list
  shoppingListGenerated: boolean;
  shoppingListId?: string;

  // Audit
  createdAt: string;
  updatedAt: string;
}

export interface DietaryPreferences {
  restrictions: DietaryTag[];
  allergies: string[];
  dislikedIngredients: string[];
  preferredCuisines: CuisineType[];
  maxPrepTimeMinutes?: number;
  servingsDefault: number;
  calorieTarget?: number;
  proteinTarget?: number;
}

export interface MealHistory {
  recipeId: string;
  cookedAt: string;
  rating?: number;
  notes?: string;
}

export interface MealData {
  userId: string;
  lastUpdated: Date | string;
  recipes: Recipe[];
  mealPlans: MealPlan[];
  history: MealHistory[];
  preferences: DietaryPreferences;
  favoriteRecipeIds: string[];
}
