/**
 * Food & cooking: dietary safety (allergies always honoured), health consent,
 * capture, tastes/cooking profile, follow-ups, and tool-facing helpers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeFirestore, type FakeFirestore } from './fake-firestore.js';

let fake: FakeFirestore;
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => fake,
}));

const store = await import('../store.js');
const food = await import('../food.js');
const { parseFoodStatements } = await import('../food-capture.js');
const { recordUserTurnPreferences, onConversationSummarized } = await import('../inference.js');
const { setPreferenceFromVoice } = await import('../voice.js');
const { buildPreferenceBlock, loadPreferenceBlock } = await import('../context-block.js');

const U = 'user-f';

beforeEach(() => {
  fake = createFakeFirestore();
  store.clearPreferenceCache();
});
afterEach(() => food.setHealthConsentCheck(async () => true));

describe('dietary needs (safety-critical)', () => {
  it('captures allergies with severity, intolerances, diets and medical advice', () => {
    const k = (t: string) =>
      parseFoodStatements(t, 'explicit', 1).map(
        (p) => `${p.key}${p.details?.severity ? `[${p.details.severity}]` : ''}`
      );
    expect(k("I'm severely allergic to peanuts")).toEqual(['allergy:peanuts[severe]']);
    expect(k('I have a shellfish allergy, I carry an EpiPen')).toEqual([
      'allergy:shellfish[anaphylactic]',
    ]);
    expect(k("I'm lactose intolerant")).toEqual(['intolerance:lactose']);
    expect(k("I'm vegetarian")).toEqual(['diet:vegetarian']);
    expect(k('I keep kosher')).toEqual(['diet:kosher']);
    expect(k('My doctor told me to avoid salt')).toEqual(['medical:salt']);
    expect(
      parseFoodStatements('My doctor told me to avoid salt', 'explicit', 1, {
        healthEnabled: false,
      })
    ).toEqual([]);
  });

  it('a stored allergy is honoured even when tentative (no evidence threshold)', async () => {
    await store.upsertPreference(U, {
      domain: 'food',
      key: 'allergy:peanut',
      value: 'peanut',
      source: 'inferred',
      confidence: 0.3,
      conversationId: 'c1',
    });
    const c = await food.getDietaryConstraints(U);
    expect(c.allergies).toEqual([{ item: 'peanut' }]);
    expect(
      food.violationOf({ name: 'Satay noodles', ingredients: [{ name: 'peanut butter' }] }, c)
    ).toContain('peanut');
    expect(
      food.violationOf({ name: 'Pad see ew', ingredients: ['rice noodles', 'soy sauce'] }, c)
    ).toBeNull();
  });

  it('allergen families and diets filter suggestions', () => {
    const c = food.constraintsFrom(
      [
        {
          id: '1',
          domain: 'food',
          key: 'allergy:tree nuts',
          value: 'nut',
          source: 'explicit',
          confidence: 1,
          userEdited: true,
          sourceConversationIds: [],
          createdAt: '',
          updatedAt: '',
        },
        {
          id: '2',
          domain: 'food',
          key: 'diet:vegetarian',
          value: 'vegetarian',
          source: 'explicit',
          confidence: 1,
          userEdited: true,
          sourceConversationIds: [],
          createdAt: '',
          updatedAt: '',
        },
      ],
      true
    );
    const recipes = [
      {
        name: 'Pesto pasta',
        ingredients: [{ name: 'basil' }, { name: 'pine nuts' }, { name: 'walnut' }],
      },
      { name: 'Chicken curry', ingredients: [{ name: 'chicken' }] },
      { name: 'Coconut dal', ingredients: [{ name: 'lentils' }, { name: 'coconut milk' }] },
      { name: 'Veggie lasagna', ingredients: [{ name: 'pasta' }], dietaryTags: ['vegetarian'] },
    ];
    expect(food.filterSafe(recipes, c).map((r) => r.name)).toEqual([
      'Coconut dal',
      'Veggie lasagna',
    ]);
    expect(food.dietaryRequestsFor(c, ['window seat'])).toEqual([
      'window seat',
      'nut allergy',
      'vegetarian',
    ]);
  });

  it('medical restrictions follow the health consent switch; allergies do not', async () => {
    await store.upsertPreference(U, {
      domain: 'food',
      key: 'medical:salt',
      value: 'salt',
      source: 'explicit',
      confidence: 1,
      details: {},
    });
    await store.upsertPreference(U, {
      domain: 'food',
      key: 'allergy:shellfish',
      value: 'shellfish',
      source: 'explicit',
      confidence: 1,
      details: { severity: 'severe' },
    });
    food.setHealthConsentCheck(async () => false);
    let c = await food.getDietaryConstraints(U);
    expect(c.medical).toEqual([]);
    expect(c.allergies).toEqual([{ item: 'shellfish', severity: 'severe' }]);
    expect(await setPreferenceFromVoice(U, { type: 'medical', value: 'sugar' })).toContain(
      'switched off'
    );
    expect(await loadPreferenceBlock(U)).not.toContain('doctor says');
    food.setHealthConsentCheck(async () => true);
    c = await food.getDietaryConstraints(U);
    expect(c.medical).toEqual(['salt']);
    expect(c.hardAvoid).toEqual(['shellfish', 'salt']);
  });

  it('a failing consent check is treated as disabled', async () => {
    food.setHealthConsentCheck(async () => {
      throw new Error('down');
    });
    expect(await food.isHealthCategoryEnabled(U)).toBe(false);
  });

  it('dietary needs lead the session block', async () => {
    await recordUserTurnPreferences(U, "I'm severely allergic to peanuts", 'c1');
    await recordUserTurnPreferences(U, "I'm vegan", 'c1');
    const block = buildPreferenceBlock(await store.listPreferences(U));
    expect(block).toContain(
      'Food needs (never suggest anything that breaks these): allergic to peanut (severe); vegan.'
    );
  });

  it('settings from the meal-planning tool become user-set profile entries', async () => {
    expect(
      await food.recordDietarySettings(U, {
        allergies: ['Sesame'],
        restrictions: ['gluten_free'],
        disliked: ['olives'],
      })
    ).toBe(3);
    const c = await food.getDietaryConstraints(U);
    expect(c).toMatchObject({
      allergies: [{ item: 'sesame' }],
      diets: ['gluten-free'],
      dislikes: ['olives'],
    });
    expect((await store.listPreferences(U)).every((p) => p.userEdited)).toBe(true);
  });
});

describe('tastes and cooking', () => {
  it('captures tastes, cooking skill, recipes with outcomes, goals, equipment and who they cook for', async () => {
    const lines = [
      'I love thai food',
      'I hate cilantro',
      "I can't handle spicy food",
      'My comfort food is mac and cheese',
      'My favorite restaurant is Nopa',
      "I'm a decent cook",
      'I made the lasagna last night and it came out too salty',
      'I want to learn to make sourdough bread',
      'I just got an air fryer',
      'I cook for my wife and kids',
      'I meal prep on Sundays',
    ];
    for (const line of lines) await recordUserTurnPreferences(U, line, 'c1');
    const p = await food.getFoodProfile(U);
    expect(p.tastes).toMatchObject({
      cuisines: ['thai'],
      comfortFoods: ['mac and cheese'],
      restaurants: ['Nopa'],
      dislikes: ['cilantro'],
      spiceTolerance: 'mild',
    });
    expect(p.cooking.skill).toBe('intermediate');
    expect(p.cooking.recipes).toEqual([
      expect.objectContaining({ name: 'lasagna', outcome: 'too salty' }),
    ]);
    expect(p.cooking.goals).toEqual(['sourdough bread']);
    expect(p.cooking.equipment).toEqual(['air fryer']);
    expect(p.cooking.routines).toEqual(['meal prep sundays']);
    expect(p.cooking.cooksFor.map((x) => x.name)).toEqual(['wife', 'kids']);
    expect(p.followUps.map((r) => r.name)).toEqual(['sourdough bread']);
  });

  it('later outcome closes the follow-up ("How did the sourdough turn out?")', async () => {
    await recordUserTurnPreferences(U, "I'm going to make focaccia this weekend", 'c1');
    expect((await food.getFoodProfile(U)).followUps.map((r) => r.name)).toEqual(['focaccia']);
    await recordUserTurnPreferences(U, 'I made the focaccia and it turned out perfect', 'c2');
    const p = await food.getFoodProfile(U);
    expect(p.followUps).toEqual([]);
    expect(p.cooking.recipes[0]).toMatchObject({
      name: 'focaccia',
      outcome: 'perfect',
      status: 'finished',
    });
  });

  it('allergy facts from extraction are captured; cascade and tombstones apply to food too', async () => {
    fake.store.set(`bogle_users/${U}/dynamic_facts/f9`, {
      text: 'User is allergic to shellfish',
      category: 'allergy',
      confidence: 0.9,
      sourceConversationIds: ['c7'],
    });
    await onConversationSummarized(U, 'c7', '', []);
    expect((await food.getDietaryConstraints(U)).allergies).toEqual([{ item: 'shellfish' }]);
    await store.deletePreferencesDerivedFromFact(U, 'f9');
    // still backed by the conversation it came from
    expect((await food.getDietaryConstraints(U)).allergies).toEqual([{ item: 'shellfish' }]);
    await store.deletePreferencesFor(U, 'c7');
    expect((await food.getDietaryConstraints(U)).allergies).toEqual([]);
  });

  it('voice: allergy with severity and "forget" work for food', async () => {
    expect(
      await setPreferenceFromVoice(U, { type: 'allergy', value: 'Peanuts', detail: 'severe' })
    ).toContain('allergic to peanut');
    expect((await food.getDietaryConstraints(U)).allergies).toEqual([
      { item: 'peanut', severity: 'severe' },
    ]);
    expect(await setPreferenceFromVoice(U, { action: 'forget', value: 'peanuts' })).toContain(
      'forgotten'
    );
    expect((await food.getDietaryConstraints(U)).allergies).toEqual([]);
  });
});
