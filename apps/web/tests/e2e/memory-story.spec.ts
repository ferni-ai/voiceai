/**
 * E2E: "Your story" tab (life story + values) and the Faith & beliefs section
 * of the Sensitive tab, shown only while Beliefs is on. APIs are mocked
 * statefully, so this runs offline.
 */

import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { freshState, mockMemoryApi } from './memory-api-mock';
import { freshSensitiveState, mockSensitiveApi, type SensitiveState } from './sensitive-api-mock';
import { freshStoryState, mockStoryApi, type StoryState } from './story-api-mock';

async function openPanel(page: Page) {
  await page.goto('/');
  await page.locator('#teamRoster .team-member[data-persona-id]').first().waitFor();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('ferni:open-memories')));
  const dialog = page.getByRole('dialog', { name: 'What I remember' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('What I remember: your story', () => {
  let story: StoryState;
  let sensitive: SensitiveState;

  test.beforeEach(async ({ page }) => {
    story = freshStoryState();
    sensitive = freshSensitiveState();
    await mockMemoryApi(page, freshState());
    await mockSensitiveApi(page, sensitive);
    await mockStoryApi(page, story, () => sensitive.enabled.beliefs);
  });

  test('shows the story, adds a value, corrects a chapter and forgets a story', async ({
    page,
  }) => {
    const dialog = await openPanel(page);
    await dialog.getByRole('tab', { name: 'Your story' }).click();

    await expect(dialog.getByRole('heading', { name: 'Where you come from' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: "Stories you've told me" })).toBeVisible();
    await expect(dialog.locator('[data-story-id="story_tree"]')).toContainText('age 9 · with Sam');
    await expect(dialog.locator('[data-story-id="story_tree"]')).toContainText(
      'From 2 conversations'
    );
    await expect(dialog.getByRole('heading', { name: 'What matters to you' })).toBeVisible();

    // Add a value
    await dialog.locator('[data-action="start-add"]').click();
    await dialog.locator('[data-role="add-kind"]').selectOption('value');
    await dialog.locator('[data-role="add-title"]').fill('Honesty');
    await dialog.locator('[data-action="save-add"]').click();
    await expect(dialog.locator('[data-story-id="value_honesty"]')).toBeVisible();
    await expect
      .poll(() => story.requests.find((r) => r.method === 'POST' && r.path === '/story')?.body)
      .toEqual({ kind: 'value', title: 'Honesty' });

    // Correct the chapter
    await dialog.getByRole('button', { name: 'Correct: My Berlin years' }).click();
    await dialog.locator('[data-role="edit-period"]').fill('2011-2016');
    await dialog.locator('[data-action="save-edit"]').click();
    await expect(dialog.locator('[data-story-id="story_berlin"]')).toContainText('2011-2016');
    await expect(dialog.locator('[data-story-id="story_berlin"]')).toContainText(
      'You corrected this'
    );

    // Forget the treehouse story
    await dialog.getByRole('button', { name: 'Forget: Building a treehouse with Sam' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Forget' }).click();
    await expect(dialog.locator('[data-story-id="story_tree"]')).toHaveCount(0);
    await expect
      .poll(() =>
        story.requests.some((r) => r.method === 'DELETE' && r.path === '/story/story_tree')
      )
      .toBe(true);
  });

  test('Faith & beliefs appears in Sensitive only while Beliefs is on', async ({ page }) => {
    const dialog = await openPanel(page);
    await dialog.getByRole('tab', { name: 'Sensitive' }).click();
    await expect(dialog.getByRole('switch', { name: 'Faith & beliefs' })).toBeVisible();
    await expect(dialog.locator('[data-role="beliefs-section"]')).toHaveCount(0);

    await dialog.getByRole('switch', { name: 'Faith & beliefs' }).click();
    const section = dialog.locator('[data-role="beliefs-section"]');
    await expect(section).toContainText('Goes to mass on Sundays');
    await expect(section).toContainText('I never bring faith up first');

    // Correct, then forget
    await section.getByRole('button', { name: 'Correct: Goes to mass on Sundays' }).click();
    await section.locator('[data-role="belief-edit"]').fill('Goes to mass most Sundays');
    await section.locator('[data-action="belief-save"]').click();
    await expect(section).toContainText('You corrected this');
    await section.getByRole('button', { name: 'Forget: Goes to mass most Sundays' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Forget' }).click();
    await expect(section).toContainText('Nothing yet');
    await expect
      .poll(() =>
        story.requests.some((r) => r.method === 'DELETE' && r.path === '/beliefs/belief_mass')
      )
      .toBe(true);

    // Switching it off hides the section again
    await dialog.getByRole('switch', { name: 'Faith & beliefs' }).click();
    await expect(dialog.locator('[data-role="beliefs-section"]')).toHaveCount(0);
  });
});
