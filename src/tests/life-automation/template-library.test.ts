/**
 * Template Library Tests
 *
 * Tests for workflow template management:
 * - Template querying
 * - Template instantiation
 * - Variable interpolation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTemplateLibrary,
  resetTemplateLibrary,
  type TemplateCategory,
} from '../../services/workflows/templates/template-library.js';

// ============================================================================
// TEMPLATE LIBRARY TESTS
// ============================================================================

describe('TemplateLibrary', () => {
  beforeEach(() => {
    resetTemplateLibrary();
  });

  describe('getTemplateLibrary', () => {
    it('should return singleton instance', () => {
      const lib1 = getTemplateLibrary();
      const lib2 = getTemplateLibrary();
      expect(lib1).toBe(lib2);
    });
  });

  describe('getAll', () => {
    it('should return all templates', () => {
      const library = getTemplateLibrary();
      const templates = library.getAll();

      expect(templates).toBeDefined();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
    });
  });

  describe('getById', () => {
    it('should return template by ID', () => {
      const library = getTemplateLibrary();
      const templates = library.getAll();
      const firstTemplate = templates[0];

      const template = library.getById(firstTemplate.id);
      expect(template).toBeDefined();
      expect(template?.id).toBe(firstTemplate.id);
    });

    it('should return undefined for non-existent ID', () => {
      const library = getTemplateLibrary();
      const template = library.getById('non-existent-id');
      expect(template).toBeUndefined();
    });
  });

  describe('getByCategory', () => {
    it('should filter templates by category', () => {
      const library = getTemplateLibrary();
      const morningTemplates = library.getByCategory('morning_routine');

      expect(morningTemplates).toBeDefined();
      expect(Array.isArray(morningTemplates)).toBe(true);
      morningTemplates.forEach((t) => {
        expect(t.category).toBe('morning_routine');
      });
    });
  });

  describe('getFeatured', () => {
    it('should return featured templates sorted by popularity', () => {
      const library = getTemplateLibrary();
      const featured = library.getFeatured();

      expect(featured).toBeDefined();
      expect(Array.isArray(featured)).toBe(true);

      // All featured templates should have featured=true
      featured.forEach((t) => {
        expect(t.featured).toBe(true);
      });

      // Should be sorted by popularity (descending)
      for (let i = 1; i < featured.length; i++) {
        expect(featured[i - 1].popularity).toBeGreaterThanOrEqual(featured[i].popularity);
      }
    });
  });

  describe('search', () => {
    it('should search templates by name', () => {
      const library = getTemplateLibrary();
      const results = library.search('morning');

      expect(results).toBeDefined();
      results.forEach((t) => {
        expect(
          t.name.toLowerCase().includes('morning') ||
            t.description.toLowerCase().includes('morning') ||
            t.tags.some((tag) => tag.toLowerCase().includes('morning'))
        ).toBe(true);
      });
    });

    it('should return empty array for no matches', () => {
      const library = getTemplateLibrary();
      const results = library.search('xyznonexistent');

      expect(results).toEqual([]);
    });
  });

  describe('getPopular', () => {
    it('should return top N templates by popularity', () => {
      const library = getTemplateLibrary();
      const popular = library.getPopular(5);

      expect(popular).toBeDefined();
      expect(popular.length).toBeLessThanOrEqual(5);

      // Should be sorted by popularity (descending)
      for (let i = 1; i < popular.length; i++) {
        expect(popular[i - 1].popularity).toBeGreaterThanOrEqual(popular[i].popularity);
      }
    });
  });

  describe('createFromTemplate', () => {
    it('should create workflow from template', () => {
      const library = getTemplateLibrary();
      const templates = library.getAll();
      const template = templates.find((t) => t.variables.length > 0) || templates[0];

      const workflow = library.createFromTemplate(template.id, 'test-user');

      expect(workflow).toBeDefined();
      expect(workflow?.userId).toBe('test-user');
      expect(workflow?.name).toBe(template.name);
      expect(workflow?.templateId).toBe(template.id);
      expect(workflow?.status).toBe('paused'); // Starts paused
    });

    it('should apply custom variables', () => {
      const library = getTemplateLibrary();
      const templates = library.getAll();
      const template = templates.find((t) => t.variables.length > 0);

      if (!template) {
        // Skip test if no template with variables
        return;
      }

      const customVars = { [template.variables[0].name]: 'custom-value' };
      const workflow = library.createFromTemplate(template.id, 'test-user', customVars);

      expect(workflow).toBeDefined();
      expect(workflow?.variables[template.variables[0].name]).toBe('custom-value');
    });

    it('should return null for non-existent template', () => {
      const library = getTemplateLibrary();
      const workflow = library.createFromTemplate('non-existent', 'test-user');
      expect(workflow).toBeNull();
    });
  });

  describe('getCategories', () => {
    it('should return all categories with counts', () => {
      const library = getTemplateLibrary();
      const categories = library.getCategories();

      expect(categories).toBeDefined();
      expect(Array.isArray(categories)).toBe(true);

      categories.forEach((cat) => {
        expect(cat.category).toBeDefined();
        expect(cat.count).toBeGreaterThanOrEqual(0);
        expect(cat.label).toBeDefined();
      });
    });
  });
});
