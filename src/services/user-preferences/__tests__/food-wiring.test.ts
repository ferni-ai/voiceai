/**
 * Dietary constraints reach the existing food tools: meal-store recipe
 * suggestions filter on them, restaurant bookings carry them.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeFirestore, type FakeFirestore } from './fake-firestore.js';

let fake: FakeFirestore;
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => fake,
}));
vi.mock('../../stores/firestore-life-adapter.js', () => ({
  isFirestoreAvailable: () => false,
  getLifeAutomationData: async () => null,
  saveLifeAutomationData: async () => undefined,
}));

const store = await import('../store.js');
const meals = await import('../../stores/meal-store.js');

const U = 'user-w';

function recipe(name: string, ingredients: string[]) {
  return {
    name,
    ingredients: ingredients.map((i) => ({ name: i, amount: 1, unit: 'cup' })),
    instructions: [],
    mealTypes: ['dinner'],
    dietaryTags: [],
    prepTimeMinutes: 10,
    cookTimeMinutes: 10,
    totalTimeMinutes: 20,
    servings: 2,
  } as unknown as Parameters<typeof meals.addRecipe>[1];
}

beforeEach(() => {
  fake = createFakeFirestore();
  store.clearPreferenceCache();
});

describe('food tool wiring', () => {
  it('meal-store suggestions never include an allergen from the profile', async () => {
    await meals.addRecipe(U, recipe('Peanut noodles', ['noodles', 'peanut butter']));
    await meals.addRecipe(U, recipe('Tomato soup', ['tomato', 'onion']));
    await store.upsertPreference(U, {
      domain: 'food',
      key: 'allergy:peanuts',
      value: 'peanuts',
      source: 'explicit',
      confidence: 1,
      details: {},
    });

    expect((await meals.getRecipesForDiet(U)).map((r) => r.name)).toEqual(['Tomato soup']);
    const byIngredients = await meals.suggestRecipesByIngredients(U, ['noodles', 'tomato']);
    expect(byIngredients.map((s) => s.recipe.name)).toEqual(['Tomato soup']);
  });
});
