/**
 * Meal Data Store
 *
 * Persistent storage for meal planning:
 * - Recipes (saved, imported)
 * - Meal plans
 * - Dietary preferences
 * - Shopping list integration
 *
 * Storage: Firestore (primary) with in-memory fallback
 * Document: /users/{userId}/life_automation/meals
 *
 * @module services/stores/meal-store
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getLifeAutomationData,
  saveLifeAutomationData,
  isFirestoreAvailable,
} from './firestore-life-adapter.js';

const log = createLogger({ module: 'meal-store' });

// In-memory fallback when Firestore is unavailable
const mealStorage: Map<string, MealData> = new Map();

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

// ============================================================================
// DEFAULT DATA
// ============================================================================

function createDefaultMealData(userId: string): MealData {
  return {
    userId,
    lastUpdated: new Date(),
    recipes: [],
    mealPlans: [],
    history: [],
    preferences: {
      restrictions: [],
      allergies: [],
      dislikedIngredients: [],
      preferredCuisines: [],
      servingsDefault: 2,
    },
    favoriteRecipeIds: [],
  };
}

// ============================================================================
// STORE OPERATIONS
// ============================================================================

/**
 * Get meal data for a user
 * Uses Firestore if available, falls back to in-memory
 */
export async function getMealData(userId: string): Promise<MealData> {
  try {
    // Try Firestore first
    if (isFirestoreAvailable()) {
      const firestoreData = await getLifeAutomationData<MealData>(userId, 'meals');
      if (firestoreData) {
        return {
          ...createDefaultMealData(userId),
          ...firestoreData,
          lastUpdated:
            typeof firestoreData.lastUpdated === 'string'
              ? new Date(firestoreData.lastUpdated)
              : firestoreData.lastUpdated || new Date(),
        };
      }
    }

    // Fall back to in-memory
    const data = mealStorage.get(userId);
    if (!data) {
      return createDefaultMealData(userId);
    }
    return {
      ...createDefaultMealData(userId),
      ...data,
      lastUpdated:
        typeof data.lastUpdated === 'string'
          ? new Date(data.lastUpdated)
          : data.lastUpdated || new Date(),
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get meal data');
    return createDefaultMealData(userId);
  }
}

/**
 * Save meal data for a user
 * Saves to Firestore if available, always saves to in-memory as fallback
 */
export async function saveMealData(userId: string, data: Partial<MealData>): Promise<void> {
  try {
    const existing = await getMealData(userId);
    const updated: MealData = {
      ...existing,
      ...data,
      lastUpdated: new Date(),
    };

    // Always save to in-memory for fast access
    mealStorage.set(userId, updated);

    // Save to Firestore if available
    if (isFirestoreAvailable()) {
      const firestoreData = {
        ...updated,
        lastUpdated: (updated.lastUpdated as Date).toISOString(),
      };
      const result = await saveLifeAutomationData(userId, 'meals', firestoreData);
      if (!result.success) {
        log.warn({ userId, error: result.error }, 'Failed to save to Firestore, data in memory only');
      }
    }

    log.debug({ userId }, 'Meal data saved');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to save meal data');
    throw error;
  }
}

// ============================================================================
// RECIPE CRUD
// ============================================================================

/**
 * Add a new recipe
 */
export async function addRecipe(
  userId: string,
  recipe: Omit<Recipe, 'id' | 'userId' | 'timesCooked' | 'isFavorite' | 'createdAt' | 'updatedAt'>
): Promise<Recipe> {
  const data = await getMealData(userId);
  const now = new Date().toISOString();

  const newRecipe: Recipe = {
    ...recipe,
    id: `recipe_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    userId,
    timesCooked: 0,
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
  };

  data.recipes.push(newRecipe);
  await saveMealData(userId, data);

  log.info({ userId, recipeId: newRecipe.id, name: newRecipe.name }, 'Recipe added');
  return newRecipe;
}

/**
 * Update a recipe
 */
export async function updateRecipe(
  userId: string,
  recipeId: string,
  updates: Partial<Recipe>
): Promise<Recipe | null> {
  const data = await getMealData(userId);
  const index = data.recipes.findIndex((r) => r.id === recipeId);

  if (index === -1) {
    return null;
  }

  data.recipes[index] = {
    ...data.recipes[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await saveMealData(userId, data);
  return data.recipes[index];
}

/**
 * Delete a recipe
 */
export async function deleteRecipe(userId: string, recipeId: string): Promise<boolean> {
  const data = await getMealData(userId);
  const index = data.recipes.findIndex((r) => r.id === recipeId);

  if (index === -1) {
    return false;
  }

  data.recipes.splice(index, 1);
  data.favoriteRecipeIds = data.favoriteRecipeIds.filter((id) => id !== recipeId);

  await saveMealData(userId, data);
  return true;
}

/**
 * Toggle recipe favorite
 */
export async function toggleFavorite(userId: string, recipeId: string): Promise<boolean> {
  const data = await getMealData(userId);
  const recipe = data.recipes.find((r) => r.id === recipeId);

  if (!recipe) {
    return false;
  }

  recipe.isFavorite = !recipe.isFavorite;

  if (recipe.isFavorite) {
    if (!data.favoriteRecipeIds.includes(recipeId)) {
      data.favoriteRecipeIds.push(recipeId);
    }
  } else {
    data.favoriteRecipeIds = data.favoriteRecipeIds.filter((id) => id !== recipeId);
  }

  await saveMealData(userId, data);
  return recipe.isFavorite;
}

/**
 * Record cooking a recipe
 */
export async function recordCooking(
  userId: string,
  recipeId: string,
  rating?: number,
  notes?: string
): Promise<void> {
  const data = await getMealData(userId);
  const recipe = data.recipes.find((r) => r.id === recipeId);

  if (recipe) {
    recipe.timesCooked++;
    recipe.lastCookedAt = new Date().toISOString();
    if (rating) recipe.rating = rating;
  }

  data.history.push({
    recipeId,
    cookedAt: new Date().toISOString(),
    rating,
    notes,
  });

  await saveMealData(userId, data);
}

// ============================================================================
// RECIPE QUERIES
// ============================================================================

/**
 * Get recipe by ID
 */
export async function getRecipe(userId: string, recipeId: string): Promise<Recipe | null> {
  const data = await getMealData(userId);
  return data.recipes.find((r) => r.id === recipeId) || null;
}

/**
 * Search recipes
 */
export async function searchRecipes(userId: string, query: string): Promise<Recipe[]> {
  const data = await getMealData(userId);
  const lowerQuery = query.toLowerCase();

  return data.recipes.filter((r) => {
    return (
      r.name.toLowerCase().includes(lowerQuery) ||
      r.description?.toLowerCase().includes(lowerQuery) ||
      r.ingredients.some((i) => i.name.toLowerCase().includes(lowerQuery)) ||
      r.tags.some((t) => t.toLowerCase().includes(lowerQuery))
    );
  });
}

/**
 * Get recipes by meal type
 */
export async function getRecipesByMealType(userId: string, mealType: MealType): Promise<Recipe[]> {
  const data = await getMealData(userId);
  return data.recipes.filter((r) => r.mealTypes.includes(mealType));
}

/**
 * Get recipes by cuisine
 */
export async function getRecipesByCuisine(userId: string, cuisine: CuisineType): Promise<Recipe[]> {
  const data = await getMealData(userId);
  return data.recipes.filter((r) => r.cuisineType === cuisine);
}

/**
 * Get recipes matching dietary restrictions
 */
export async function getRecipesForDiet(userId: string): Promise<Recipe[]> {
  const data = await getMealData(userId);
  const { restrictions, allergies, dislikedIngredients } = data.preferences;

  return data.recipes.filter((r) => {
    // Check dietary restrictions
    for (const restriction of restrictions) {
      if (!r.dietaryTags.includes(restriction)) {
        return false;
      }
    }

    // Check allergies and disliked ingredients
    for (const ingredient of r.ingredients) {
      const lowerName = ingredient.name.toLowerCase();
      if (allergies.some((a) => lowerName.includes(a.toLowerCase()))) {
        return false;
      }
      if (dislikedIngredients.some((d) => lowerName.includes(d.toLowerCase()))) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Get quick recipes (under specified minutes)
 */
export async function getQuickRecipes(userId: string, maxMinutes: number = 30): Promise<Recipe[]> {
  const data = await getMealData(userId);
  return data.recipes.filter((r) => r.totalTimeMinutes <= maxMinutes);
}

/**
 * Suggest recipes based on available ingredients
 */
export async function suggestRecipesByIngredients(
  userId: string,
  availableIngredients: string[]
): Promise<Array<{ recipe: Recipe; matchPercentage: number; missingIngredients: string[] }>> {
  const data = await getMealData(userId);
  const lowerIngredients = availableIngredients.map((i) => i.toLowerCase());

  const suggestions = data.recipes.map((recipe) => {
    const requiredIngredients = recipe.ingredients.filter((i) => !i.optional);
    const matchedCount = requiredIngredients.filter((i) =>
      lowerIngredients.some((available) => i.name.toLowerCase().includes(available))
    ).length;

    const matchPercentage = (matchedCount / requiredIngredients.length) * 100;
    const missingIngredients = requiredIngredients
      .filter(
        (i) => !lowerIngredients.some((available) => i.name.toLowerCase().includes(available))
      )
      .map((i) => i.name);

    return { recipe, matchPercentage, missingIngredients };
  });

  return suggestions
    .filter((s) => s.matchPercentage > 0)
    .sort((a, b) => b.matchPercentage - a.matchPercentage);
}

// ============================================================================
// MEAL PLANS
// ============================================================================

/**
 * Create a meal plan
 */
export async function createMealPlan(
  userId: string,
  plan: Omit<MealPlan, 'id' | 'userId' | 'shoppingListGenerated' | 'createdAt' | 'updatedAt'>
): Promise<MealPlan> {
  const data = await getMealData(userId);
  const now = new Date().toISOString();

  const newPlan: MealPlan = {
    ...plan,
    id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    userId,
    shoppingListGenerated: false,
    createdAt: now,
    updatedAt: now,
  };

  data.mealPlans.push(newPlan);
  await saveMealData(userId, data);

  log.info({ userId, planId: newPlan.id, name: newPlan.name }, 'Meal plan created');
  return newPlan;
}

/**
 * Add entry to meal plan
 */
export async function addMealPlanEntry(
  userId: string,
  planId: string,
  entry: Omit<MealPlanEntry, 'id' | 'completed'>
): Promise<MealPlanEntry | null> {
  const data = await getMealData(userId);
  const plan = data.mealPlans.find((p) => p.id === planId);

  if (!plan) {
    return null;
  }

  const newEntry: MealPlanEntry = {
    ...entry,
    id: `entry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    completed: false,
  };

  plan.entries.push(newEntry);
  plan.updatedAt = new Date().toISOString();
  plan.shoppingListGenerated = false; // Mark as needing regeneration

  await saveMealData(userId, data);
  return newEntry;
}

/**
 * Get current or upcoming meal plan
 */
export async function getCurrentMealPlan(userId: string): Promise<MealPlan | null> {
  const data = await getMealData(userId);
  const today = new Date().toISOString().split('T')[0];

  // Find plan that includes today
  const current = data.mealPlans.find((p) => p.startDate <= today && p.endDate >= today);

  if (current) return current;

  // Find next upcoming plan
  const upcoming = data.mealPlans
    .filter((p) => p.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

  return upcoming || null;
}

/**
 * Get meals for a specific date
 */
export async function getMealsForDate(
  userId: string,
  date: string
): Promise<Array<MealPlanEntry & { recipe?: Recipe }>> {
  const data = await getMealData(userId);

  const entries: Array<MealPlanEntry & { recipe?: Recipe }> = [];

  for (const plan of data.mealPlans) {
    const dayEntries = plan.entries.filter((e) => e.date === date);
    for (const entry of dayEntries) {
      const recipe = entry.recipeId
        ? data.recipes.find((r) => r.id === entry.recipeId)
        : undefined;
      entries.push({ ...entry, recipe });
    }
  }

  return entries;
}

/**
 * Generate shopping list from meal plan
 */
export async function generateShoppingList(
  userId: string,
  planId: string
): Promise<Array<{ ingredient: string; amount: number; unit: string; recipes: string[] }>> {
  const data = await getMealData(userId);
  const plan = data.mealPlans.find((p) => p.id === planId);

  if (!plan) {
    return [];
  }

  const ingredientMap = new Map<string, { amount: number; unit: string; recipes: string[] }>();

  for (const entry of plan.entries) {
    if (!entry.recipeId) continue;

    const recipe = data.recipes.find((r) => r.id === entry.recipeId);
    if (!recipe) continue;

    // Scale ingredients by servings ratio
    const scaleFactor = entry.servings / recipe.servings;

    for (const ingredient of recipe.ingredients) {
      const key = `${ingredient.name.toLowerCase()}|${ingredient.unit}`;
      const existing = ingredientMap.get(key);

      if (existing) {
        existing.amount += ingredient.amount * scaleFactor;
        if (!existing.recipes.includes(recipe.name)) {
          existing.recipes.push(recipe.name);
        }
      } else {
        ingredientMap.set(key, {
          amount: ingredient.amount * scaleFactor,
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

// ============================================================================
// PREFERENCES
// ============================================================================

/**
 * Update dietary preferences
 */
export async function updatePreferences(
  userId: string,
  preferences: Partial<DietaryPreferences>
): Promise<DietaryPreferences> {
  const data = await getMealData(userId);
  data.preferences = { ...data.preferences, ...preferences };
  await saveMealData(userId, data);
  return data.preferences;
}

/**
 * Add dietary restriction
 */
export async function addRestriction(userId: string, restriction: DietaryTag): Promise<void> {
  const data = await getMealData(userId);
  if (!data.preferences.restrictions.includes(restriction)) {
    data.preferences.restrictions.push(restriction);
    await saveMealData(userId, data);
  }
}

/**
 * Add allergy
 */
export async function addAllergy(userId: string, allergy: string): Promise<void> {
  const data = await getMealData(userId);
  if (!data.preferences.allergies.includes(allergy)) {
    data.preferences.allergies.push(allergy);
    await saveMealData(userId, data);
  }
}

// ============================================================================
// MIGRATION HELPER
// ============================================================================

/**
 * Migrate in-memory data to Firestore (for existing users)
 */
export async function migrateUserToFirestore(userId: string): Promise<boolean> {
  const inMemoryData = mealStorage.get(userId);
  if (!inMemoryData) {
    return false;
  }

  if (!isFirestoreAvailable()) {
    log.warn({ userId }, 'Cannot migrate: Firestore unavailable');
    return false;
  }

  const firestoreData = {
    ...inMemoryData,
    lastUpdated:
      inMemoryData.lastUpdated instanceof Date
        ? inMemoryData.lastUpdated.toISOString()
        : inMemoryData.lastUpdated,
  };

  const result = await saveLifeAutomationData(userId, 'meals', firestoreData);
  if (result.success) {
    log.info({ userId }, 'Successfully migrated meal data to Firestore');
  }

  return result.success;
}
