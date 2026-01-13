/**
 * Life Automation Stores Tests
 *
 * Tests for the in-memory store implementations:
 * - subscription-store
 * - document-store
 * - meal-store
 * - workflow-store
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSubscriptionData,
  saveSubscriptionData,
  addSubscription,
  getSubscriptionSummary,
  getUpcomingRenewals,
  cancelSubscription,
} from '../../services/stores/subscription-store.js';
import {
  getDocumentData,
  saveDocumentData,
  addDocument,
  searchDocuments,
  getExpiringDocuments,
  getWarrantyStatus,
} from '../../services/stores/document-store.js';
import {
  getMealData,
  saveMealData,
  addRecipe,
  searchRecipes,
  recordCooking,
  updatePreferences,
  getRecipesForDiet,
  getQuickRecipes,
  suggestRecipesByIngredients,
} from '../../services/stores/meal-store.js';
import {
  getWorkflowData,
  saveWorkflowData,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  getActiveWorkflows,
} from '../../services/stores/workflow-store.js';

// ============================================================================
// SUBSCRIPTION STORE TESTS
// ============================================================================

describe('Subscription Store', () => {
  const testUserId = 'test-user-subscription';

  beforeEach(async () => {
    // Reset user data by saving empty state
    await saveSubscriptionData(testUserId, {
      subscriptions: [],
      alerts: [],
    });
  });

  describe('getSubscriptionData', () => {
    it('should return default data for new user', async () => {
      const data = await getSubscriptionData('new-user-sub');
      expect(data).toBeDefined();
      expect(data.subscriptions).toEqual([]);
      expect(data.alerts).toEqual([]);
    });
  });

  describe('addSubscription', () => {
    it('should add a subscription', async () => {
      const subscription = await addSubscription(testUserId, {
        name: 'Netflix',
        amount: 15.99,
        category: 'streaming',
        billingCycle: 'monthly',
        nextBillingDate: '2024-02-15',
        status: 'active',
      });

      expect(subscription.id).toBeDefined();
      expect(subscription.name).toBe('Netflix');
      expect(subscription.amount).toBe(15.99);

      const data = await getSubscriptionData(testUserId);
      expect(data.subscriptions).toHaveLength(1);
    });
  });

  describe('getSubscriptionSummary', () => {
    it('should calculate monthly and yearly spend', async () => {
      // Fixed: Use correct field names (frequency instead of billingCycle)
      await addSubscription(testUserId, {
        name: 'Netflix',
        amount: 15.99,
        category: 'streaming',
        frequency: 'monthly',
        currency: 'USD',
        startDate: '2024-01-15',
        nextBillingDate: '2024-02-15',
        status: 'active',
        detectedFrom: 'manual',
        autoRenew: true,
        tags: [],
      });

      await addSubscription(testUserId, {
        name: 'Spotify',
        amount: 9.99,
        category: 'streaming',
        frequency: 'monthly',
        currency: 'USD',
        startDate: '2024-01-20',
        nextBillingDate: '2024-02-20',
        status: 'active',
        detectedFrom: 'manual',
        autoRenew: true,
        tags: [],
      });

      const summary = await getSubscriptionSummary(testUserId);
      expect(summary.totalActive).toBe(2);
      expect(summary.monthlySpend).toBeCloseTo(25.98, 2);
      expect(summary.yearlySpend).toBeCloseTo(311.76, 2);
    });
  });

  describe('cancelSubscription', () => {
    it('should mark subscription as cancelled', async () => {
      const sub = await addSubscription(testUserId, {
        name: 'Test Service',
        amount: 10.00,
        category: 'other',
        frequency: 'monthly',
        currency: 'USD',
        startDate: '2024-01-15',
        nextBillingDate: '2024-02-15',
        status: 'active',
        detectedFrom: 'manual',
        autoRenew: true,
        tags: [],
      });

      await cancelSubscription(testUserId, sub.id, 'Testing');
      
      const data = await getSubscriptionData(testUserId);
      const cancelled = data.subscriptions.find((s) => s.id === sub.id);
      expect(cancelled?.status).toBe('cancelled');
    });
  });
});

// ============================================================================
// DOCUMENT STORE TESTS
// ============================================================================

describe('Document Store', () => {
  const testUserId = 'test-user-document';

  beforeEach(async () => {
    await saveDocumentData(testUserId, {
      documents: [],
      categories: [],
    });
  });

  describe('getDocumentData', () => {
    it('should return default data for new user', async () => {
      const data = await getDocumentData('new-user-doc');
      expect(data).toBeDefined();
      expect(data.documents).toEqual([]);
    });
  });

  describe('addDocument', () => {
    it('should add a document', async () => {
      const doc = await addDocument(testUserId, {
        name: 'Car Insurance',
        type: 'insurance',
        status: 'active',
        hasExpiration: true,
        expirationDate: '2024-12-31',
        tags: ['car', 'insurance'],
      });

      expect(doc.id).toBeDefined();
      expect(doc.name).toBe('Car Insurance');
      expect(doc.type).toBe('insurance');

      const data = await getDocumentData(testUserId);
      expect(data.documents).toHaveLength(1);
    });
  });

  describe('searchDocuments', () => {
    it('should find documents by name', async () => {
      await addDocument(testUserId, {
        name: 'Car Insurance Policy',
        type: 'insurance',
        status: 'active',
        hasExpiration: false,
        tags: [],
      });

      await addDocument(testUserId, {
        name: 'Home Warranty',
        type: 'warranty',
        status: 'active',
        hasExpiration: false,
        tags: [],
      });

      const results = await searchDocuments(testUserId, 'insurance');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Car Insurance Policy');
    });
  });

  describe('getExpiringDocuments', () => {
    it('should return documents expiring within days', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      await addDocument(testUserId, {
        name: 'Expiring Soon',
        type: 'insurance',
        status: 'active',
        hasExpiration: true,
        expirationDate: futureDate.toISOString().split('T')[0],
        tags: [],
      });

      const expiring = await getExpiringDocuments(testUserId, 30);
      expect(expiring).toHaveLength(1);
      expect(expiring[0].name).toBe('Expiring Soon');
    });
  });
});

// ============================================================================
// MEAL STORE TESTS
// ============================================================================

describe('Meal Store', () => {
  const testUserId = 'test-user-meal';

  beforeEach(async () => {
    await saveMealData(testUserId, {
      recipes: [],
      mealPlans: [],
      preferences: {
        restrictions: [],
        allergies: [],
        preferredCuisines: [],
        dislikedIngredients: [],
        defaultServings: 4,
      },
    });
  });

  describe('getMealData', () => {
    it('should return default data for new user', async () => {
      const data = await getMealData('new-user-meal');
      expect(data).toBeDefined();
      expect(data.recipes).toEqual([]);
      expect(data.preferences).toBeDefined();
    });
  });

  describe('addRecipe', () => {
    it('should add a recipe', async () => {
      const recipe = await addRecipe(testUserId, {
        name: 'Pasta Carbonara',
        ingredients: [
          { name: 'pasta', amount: 400, unit: 'g', optional: false },
          { name: 'eggs', amount: 4, unit: 'unit', optional: false },
        ],
        instructions: ['Boil pasta', 'Mix eggs', 'Combine'],
        prepTimeMinutes: 10,
        cookTimeMinutes: 20,
        totalTimeMinutes: 30,
        servings: 4,
        mealTypes: ['dinner'],
        difficulty: 'medium',
        dietaryTags: [],
        tags: ['italian'],
      });

      expect(recipe.id).toBeDefined();
      expect(recipe.name).toBe('Pasta Carbonara');

      const data = await getMealData(testUserId);
      expect(data.recipes).toHaveLength(1);
    });
  });

  describe('searchRecipes', () => {
    it('should find recipes by name', async () => {
      await addRecipe(testUserId, {
        name: 'Chicken Stir Fry',
        ingredients: [{ name: 'chicken', amount: 500, unit: 'g', optional: false }],
        instructions: ['Cook chicken'],
        prepTimeMinutes: 15,
        cookTimeMinutes: 15,
        totalTimeMinutes: 30,
        servings: 4,
        mealTypes: ['dinner'],
        difficulty: 'easy',
        dietaryTags: [],
        tags: [],
      });

      const results = await searchRecipes(testUserId, 'chicken');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Chicken Stir Fry');
    });
  });

  describe('getQuickRecipes', () => {
    it('should return recipes under max time', async () => {
      await addRecipe(testUserId, {
        name: 'Quick Salad',
        ingredients: [{ name: 'lettuce', amount: 1, unit: 'head', optional: false }],
        instructions: ['Wash and chop'],
        prepTimeMinutes: 5,
        cookTimeMinutes: 0,
        totalTimeMinutes: 5,
        servings: 2,
        mealTypes: ['lunch'],
        difficulty: 'easy',
        dietaryTags: ['vegetarian'],
        tags: [],
      });

      await addRecipe(testUserId, {
        name: 'Slow Roast',
        ingredients: [{ name: 'beef', amount: 2, unit: 'kg', optional: false }],
        instructions: ['Roast for 6 hours'],
        prepTimeMinutes: 30,
        cookTimeMinutes: 360,
        totalTimeMinutes: 390,
        servings: 8,
        mealTypes: ['dinner'],
        difficulty: 'hard',
        dietaryTags: [],
        tags: [],
      });

      const quick = await getQuickRecipes(testUserId, 30);
      expect(quick).toHaveLength(1);
      expect(quick[0].name).toBe('Quick Salad');
    });
  });
});

// ============================================================================
// WORKFLOW STORE TESTS
// ============================================================================

describe('Workflow Store', () => {
  const testUserId = 'test-user-workflow';

  beforeEach(async () => {
    await saveWorkflowData(testUserId, {
      workflows: [],
      executions: [],
      settings: {
        maxConcurrentWorkflows: 5,
        executionHistoryDays: 30,
        defaultTimezone: 'America/New_York',
      },
    });
  });

  describe('getWorkflowData', () => {
    it('should return default data for new user', async () => {
      const data = await getWorkflowData('new-user-workflow');
      expect(data).toBeDefined();
      expect(data.workflows).toEqual([]);
      expect(data.settings).toBeDefined();
    });
  });

  describe('createWorkflow', () => {
    it('should create a workflow', async () => {
      const workflow = await createWorkflow(testUserId, {
        name: 'Morning Routine',
        description: 'Start the day right',
        status: 'active',
        trigger: {
          type: 'time',
          schedule: '07:00',
        },
        conditions: [],
        actions: [],
        tags: ['morning'],
        variables: {},
        isTemplate: false,
      });

      expect(workflow.id).toBeDefined();
      expect(workflow.name).toBe('Morning Routine');
      expect(workflow.runCount).toBe(0);

      const data = await getWorkflowData(testUserId);
      expect(data.workflows).toHaveLength(1);
    });
  });

  describe('updateWorkflow', () => {
    it('should update workflow status', async () => {
      const workflow = await createWorkflow(testUserId, {
        name: 'Test Workflow',
        status: 'active',
        trigger: { type: 'phrase', phrases: ['test'], requireExactMatch: false },
        conditions: [],
        actions: [],
        tags: [],
        variables: {},
        isTemplate: false,
      });

      await updateWorkflow(testUserId, workflow.id, { status: 'paused' });

      const data = await getWorkflowData(testUserId);
      const updated = data.workflows.find((w) => w.id === workflow.id);
      expect(updated?.status).toBe('paused');
    });
  });

  describe('deleteWorkflow', () => {
    it('should delete a workflow', async () => {
      const workflow = await createWorkflow(testUserId, {
        name: 'To Delete',
        status: 'active',
        trigger: { type: 'phrase', phrases: ['delete me'], requireExactMatch: true },
        conditions: [],
        actions: [],
        tags: [],
        variables: {},
        isTemplate: false,
      });

      await deleteWorkflow(testUserId, workflow.id);

      const data = await getWorkflowData(testUserId);
      expect(data.workflows).toHaveLength(0);
    });
  });

  describe('getActiveWorkflows', () => {
    it('should return only active workflows', async () => {
      await createWorkflow(testUserId, {
        name: 'Active One',
        status: 'active',
        trigger: { type: 'phrase', phrases: ['active'], requireExactMatch: false },
        conditions: [],
        actions: [],
        tags: [],
        variables: {},
        isTemplate: false,
      });

      await createWorkflow(testUserId, {
        name: 'Paused One',
        status: 'paused',
        trigger: { type: 'phrase', phrases: ['paused'], requireExactMatch: false },
        conditions: [],
        actions: [],
        tags: [],
        variables: {},
        isTemplate: false,
      });

      const active = await getActiveWorkflows(testUserId);
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe('Active One');
    });
  });
});
