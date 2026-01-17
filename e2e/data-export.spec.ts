/**
 * Data Export E2E Tests
 *
 * Tests the complete "Your Data" feature:
 * - View exportable categories
 * - Export data in JSON and CSV formats
 * - Delete all data (GDPR)
 */

import { test, expect } from '@playwright/test';

// Test user ID for consistent testing
const TEST_USER_ID = 'e2e-test-user-data-export';

test.describe('Data Export Feature', () => {
  test.describe('Categories API', () => {
    test('GET /api/export/categories returns all categories', async ({ request }) => {
      const response = await request.get(`/api/export/categories?userId=${TEST_USER_ID}`);

      // Should return 200 even for new users (with empty counts)
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.categories).toBeDefined();
      expect(Array.isArray(data.categories)).toBe(true);

      // Verify all expected categories are present
      const categoryNames = data.categories.map((c: { category: string }) => c.category);
      expect(categoryNames).toContain('Conversations');
      expect(categoryNames).toContain('Insights');
      expect(categoryNames).toContain('Rituals');
      expect(categoryNames).toContain('Predictions');
      expect(categoryNames).toContain('Mood History');
      expect(categoryNames).toContain('Profile');
      expect(categoryNames).toContain('Contacts');
      expect(categoryNames).toContain('Trust Journey');
      expect(categoryNames).toContain('Wellbeing');
      expect(categoryNames).toContain('Habits');
      expect(categoryNames).toContain('Productivity');

      // Verify category structure
      const firstCategory = data.categories[0];
      expect(firstCategory).toHaveProperty('category');
      expect(firstCategory).toHaveProperty('description');
      expect(firstCategory).toHaveProperty('itemCount');
      expect(firstCategory).toHaveProperty('exportable');
      expect(typeof firstCategory.itemCount).toBe('number');
      expect(typeof firstCategory.exportable).toBe('boolean');
    });
  });

  test.describe('Export API', () => {
    test('POST /api/export returns JSON data', async ({ request }) => {
      const response = await request.post('/api/export', {
        data: {
          userId: TEST_USER_ID,
          format: 'json',
          categories: ['Conversations', 'Insights'],
        },
      });

      expect(response.status()).toBe(200);

      // Check content type
      const contentType = response.headers()['content-type'];
      expect(contentType).toContain('application/json');

      // Check content disposition (download)
      const contentDisposition = response.headers()['content-disposition'];
      expect(contentDisposition).toContain('attachment');
      expect(contentDisposition).toContain('.json');

      // Parse and verify structure
      const data = await response.json();
      expect(data).toHaveProperty('exportedAt');
      expect(data).toHaveProperty('userId', TEST_USER_ID);
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('categories');
    });

    test('POST /api/export returns CSV data', async ({ request }) => {
      const response = await request.post('/api/export', {
        data: {
          userId: TEST_USER_ID,
          format: 'csv',
          categories: ['Mood History'],
        },
      });

      expect(response.status()).toBe(200);

      // Check content type
      const contentType = response.headers()['content-type'];
      expect(contentType).toContain('text/csv');

      // Check content disposition
      const contentDisposition = response.headers()['content-disposition'];
      expect(contentDisposition).toContain('.csv');

      // Verify CSV structure
      const text = await response.text();
      expect(text).toContain('# Ferni Data Export');
      expect(text).toContain('# User:');
    });

    test('POST /api/export handles empty categories gracefully', async ({ request }) => {
      const response = await request.post('/api/export', {
        data: {
          userId: TEST_USER_ID,
          format: 'json',
          categories: [],
        },
      });

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.categories).toEqual({});
    });

    test('POST /api/export handles all categories', async ({ request }) => {
      const allCategories = [
        'Conversations',
        'Insights',
        'Rituals',
        'Predictions',
        'Mood History',
        'Profile',
        'Contacts',
        'Trust Journey',
        'Wellbeing',
        'Habits',
        'Productivity',
      ];

      const response = await request.post('/api/export', {
        data: {
          userId: TEST_USER_ID,
          format: 'json',
          categories: allCategories,
        },
      });

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('categories');

      // All categories should be present (even if empty)
      const exportedKeys = Object.keys(data.categories);
      expect(exportedKeys.length).toBeGreaterThan(0);
    });
  });

  test.describe('Delete API', () => {
    test('DELETE /api/export/all requires confirmation', async ({ request }) => {
      // Without confirmDelete, should fail
      const response = await request.delete('/api/export/all', {
        data: {
          userId: TEST_USER_ID,
          confirmDelete: false,
        },
      });

      expect(response.status()).toBe(400);
    });

    test('DELETE /api/export/all deletes user data', async ({ request }) => {
      // Create a separate test user for deletion test
      const deleteTestUserId = 'e2e-delete-test-user';

      // First delete the data
      const response = await request.delete('/api/export/all', {
        data: {
          userId: deleteTestUserId,
          confirmDelete: true,
        },
      });

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify data is deleted by fetching categories
      const categoriesResponse = await request.get(`/api/export/categories?userId=${deleteTestUserId}`);
      expect(categoriesResponse.status()).toBe(200);

      const categories = await categoriesResponse.json();
      // After deletion, all counts should be 0
      for (const category of categories.categories) {
        expect(category.itemCount).toBe(0);
      }
    });
  });

  test.describe('UI Integration', () => {
    test.skip('Data Export modal shows all categories', async ({ page }) => {
      // Navigate to app
      await page.goto('/');

      // Wait for app to load
      await page.waitForSelector('[data-testid="settings-button"]', { timeout: 10000 });

      // Open settings
      await page.click('[data-testid="settings-button"]');

      // Click on "Download Your Story" / Export option
      await page.click('text=Your Data');

      // Verify modal opens
      await expect(page.locator('.data-export')).toBeVisible();

      // Verify categories are shown
      await expect(page.locator('.data-export__category')).toHaveCount(11);

      // Verify format options
      await expect(page.locator('[data-format="json"]')).toBeVisible();
      await expect(page.locator('[data-format="csv"]')).toBeVisible();

      // Verify action buttons
      await expect(page.locator('.data-export__btn--primary')).toBeVisible();
      await expect(page.locator('.data-export__btn--danger')).toBeVisible();

      // Close modal
      await page.click('.data-export__close');
      await expect(page.locator('.data-export')).not.toBeVisible();
    });
  });
});

test.describe('GDPR Compliance', () => {
  test('Export includes all user data categories', async ({ request }) => {
    const response = await request.get(`/api/export/categories?userId=${TEST_USER_ID}`);
    const data = await response.json();

    // GDPR requires ability to export all personal data
    // Verify we have categories for all data types
    const requiredCategories = [
      'Conversations', // Chat history
      'Insights', // Cognitive data
      'Profile', // Personal profile
      'Contacts', // Relationship data
      'Wellbeing', // Health-related data
    ];

    const categoryNames = data.categories.map((c: { category: string }) => c.category);
    for (const required of requiredCategories) {
      expect(categoryNames).toContain(required);
    }
  });

  test('Delete removes all user data', async ({ request }) => {
    const gdprTestUserId = 'e2e-gdpr-test-user';

    // Delete all data
    const deleteResponse = await request.delete('/api/export/all', {
      data: {
        userId: gdprTestUserId,
        confirmDelete: true,
      },
    });

    expect(deleteResponse.status()).toBe(200);

    // Verify no data remains
    const categoriesResponse = await request.get(`/api/export/categories?userId=${gdprTestUserId}`);
    const categories = await categoriesResponse.json();

    // All categories should have 0 items
    const totalItems = categories.categories.reduce(
      (sum: number, c: { itemCount: number }) => sum + c.itemCount,
      0
    );
    expect(totalItems).toBe(0);
  });
});
