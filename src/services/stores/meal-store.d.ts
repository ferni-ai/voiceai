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
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert';
export type DietaryTag = 'vegetarian' | 'vegan' | 'gluten_free' | 'dairy_free' | 'nut_free' | 'low_carb' | 'keto' | 'paleo' | 'halal' | 'kosher' | 'pescatarian' | 'low_sodium' | 'low_fat' | 'high_protein';
export type CuisineType = 'american' | 'italian' | 'mexican' | 'chinese' | 'japanese' | 'indian' | 'thai' | 'mediterranean' | 'french' | 'korean' | 'vietnamese' | 'middle_eastern' | 'african' | 'greek' | 'spanish' | 'other';
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
    protein?: number;
    carbohydrates?: number;
    fat?: number;
    fiber?: number;
    sugar?: number;
    sodium?: number;
    servingSize?: string;
}
export interface Recipe {
    id: string;
    userId: string;
    name: string;
    description?: string;
    mealTypes: MealType[];
    cuisineType?: CuisineType;
    dietaryTags: DietaryTag[];
    difficulty: DifficultyLevel;
    prepTimeMinutes: number;
    cookTimeMinutes: number;
    totalTimeMinutes: number;
    servings: number;
    ingredients: Ingredient[];
    instructions: string[];
    tips?: string[];
    nutrition?: NutritionInfo;
    imageUrl?: string;
    sourceUrl?: string;
    sourceName?: string;
    rating?: number;
    timesCooked: number;
    lastCookedAt?: string;
    notes?: string;
    tags: string[];
    isFavorite: boolean;
    createdAt: string;
    updatedAt: string;
}
export interface MealPlanEntry {
    id: string;
    date: string;
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
    shoppingListGenerated: boolean;
    shoppingListId?: string;
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
/**
 * Get meal data for a user
 * Uses Firestore if available, falls back to in-memory
 */
export declare function getMealData(userId: string): Promise<MealData>;
/**
 * Save meal data for a user
 * Saves to Firestore if available, always saves to in-memory as fallback
 */
export declare function saveMealData(userId: string, data: Partial<MealData>): Promise<void>;
/**
 * Add a new recipe
 */
export declare function addRecipe(userId: string, recipe: Omit<Recipe, 'id' | 'userId' | 'timesCooked' | 'isFavorite' | 'createdAt' | 'updatedAt'>): Promise<Recipe>;
/**
 * Update a recipe
 */
export declare function updateRecipe(userId: string, recipeId: string, updates: Partial<Recipe>): Promise<Recipe | null>;
/**
 * Delete a recipe
 */
export declare function deleteRecipe(userId: string, recipeId: string): Promise<boolean>;
/**
 * Toggle recipe favorite
 */
export declare function toggleFavorite(userId: string, recipeId: string): Promise<boolean>;
/**
 * Record cooking a recipe
 */
export declare function recordCooking(userId: string, recipeId: string, rating?: number, notes?: string): Promise<void>;
/**
 * Get recipe by ID
 */
export declare function getRecipe(userId: string, recipeId: string): Promise<Recipe | null>;
/**
 * Search recipes
 */
export declare function searchRecipes(userId: string, query: string): Promise<Recipe[]>;
/**
 * Get recipes by meal type
 */
export declare function getRecipesByMealType(userId: string, mealType: MealType): Promise<Recipe[]>;
/**
 * Get recipes by cuisine
 */
export declare function getRecipesByCuisine(userId: string, cuisine: CuisineType): Promise<Recipe[]>;
/**
 * Get recipes matching dietary restrictions
 */
export declare function getRecipesForDiet(userId: string): Promise<Recipe[]>;
/**
 * Get quick recipes (under specified minutes)
 */
export declare function getQuickRecipes(userId: string, maxMinutes?: number): Promise<Recipe[]>;
/**
 * Suggest recipes based on available ingredients
 */
export declare function suggestRecipesByIngredients(userId: string, availableIngredients: string[]): Promise<Array<{
    recipe: Recipe;
    matchPercentage: number;
    missingIngredients: string[];
}>>;
/**
 * Create a meal plan
 */
export declare function createMealPlan(userId: string, plan: Omit<MealPlan, 'id' | 'userId' | 'shoppingListGenerated' | 'createdAt' | 'updatedAt'>): Promise<MealPlan>;
/**
 * Add entry to meal plan
 */
export declare function addMealPlanEntry(userId: string, planId: string, entry: Omit<MealPlanEntry, 'id' | 'completed'>): Promise<MealPlanEntry | null>;
/**
 * Get current or upcoming meal plan
 */
export declare function getCurrentMealPlan(userId: string): Promise<MealPlan | null>;
/**
 * Get meals for a specific date
 */
export declare function getMealsForDate(userId: string, date: string): Promise<Array<MealPlanEntry & {
    recipe?: Recipe;
}>>;
/**
 * Generate shopping list from meal plan
 */
export declare function generateShoppingList(userId: string, planId: string): Promise<Array<{
    ingredient: string;
    amount: number;
    unit: string;
    recipes: string[];
}>>;
/**
 * Update dietary preferences
 */
export declare function updatePreferences(userId: string, preferences: Partial<DietaryPreferences>): Promise<DietaryPreferences>;
/**
 * Add dietary restriction
 */
export declare function addRestriction(userId: string, restriction: DietaryTag): Promise<void>;
/**
 * Add allergy
 */
export declare function addAllergy(userId: string, allergy: string): Promise<void>;
/**
 * Migrate in-memory data to Firestore (for existing users)
 */
export declare function migrateUserToFirestore(userId: string): Promise<boolean>;
//# sourceMappingURL=meal-store.d.ts.map