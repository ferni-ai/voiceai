/**
 * Hook Generator Unit Tests
 *
 * Tests for the domain hook factory pattern.
 *
 * @module tests/data-layer/hook-generator.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createDomainHook,
  joinNonEmpty,
  formatField,
  formatDate,
  formatCurrency,
  createContentBuilder,
} from '../../services/data-layer/hook-generator.js';
import * as storeHooks from '../../services/data-layer/store-hooks.js';
import type { StoreType, EntityType } from '../../services/data-layer/types.js';

// Mock the store hooks
vi.mock('../../services/data-layer/store-hooks.js', () => ({
  onStoreChange: vi.fn(),
}));

describe('Hook Generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createDomainHook', () => {
    it('should create a hook that calls onStoreChange with correct params', () => {
      interface TestEntity {
        name: string;
        status: string;
      }

      const hook = createDomainHook<TestEntity>({
        storeType: 'trust' as StoreType,
        entityType: 'commitment' as EntityType,
        contentBuilder: (e) => `Test: ${e.name}. Status: ${e.status}.`,
        metadataExtractor: (e) => ({ status: e.status }),
      });

      const entity = { name: 'My Commitment', status: 'active' };
      hook('user123', 'entity456', entity, 'create');

      expect(storeHooks.onStoreChange).toHaveBeenCalledWith({
        storeType: 'trust',
        changeType: 'create',
        userId: 'user123',
        entityType: 'commitment',
        entityId: 'entity456',
        content: 'Test: My Commitment. Status: active.',
        metadata: { status: 'active' },
      });
    });

    it('should default changeType to update', () => {
      interface TestEntity {
        value: number;
      }

      const hook = createDomainHook<TestEntity>({
        storeType: 'financial' as StoreType,
        entityType: 'budget' as EntityType,
        contentBuilder: (e) => `Value: ${e.value}`,
      });

      hook('user123', 'entity456', { value: 100 });

      expect(storeHooks.onStoreChange).toHaveBeenCalledWith(
        expect.objectContaining({
          changeType: 'update',
        })
      );
    });

    it('should skip indexing when shouldSkip returns true', () => {
      interface TestEntity {
        status: string;
      }

      const hook = createDomainHook<TestEntity>({
        storeType: 'productivity' as StoreType,
        entityType: 'task' as EntityType,
        contentBuilder: (e) => `Status: ${e.status}`,
        shouldSkip: (e) => e.status === 'cancelled',
      });

      hook('user123', 'entity456', { status: 'cancelled' }, 'update');

      expect(storeHooks.onStoreChange).not.toHaveBeenCalled();
    });

    it('should NOT skip when shouldSkip returns false', () => {
      interface TestEntity {
        status: string;
      }

      const hook = createDomainHook<TestEntity>({
        storeType: 'productivity' as StoreType,
        entityType: 'task' as EntityType,
        contentBuilder: (e) => `Status: ${e.status}`,
        shouldSkip: (e) => e.status === 'cancelled',
      });

      hook('user123', 'entity456', { status: 'active' }, 'create');

      expect(storeHooks.onStoreChange).toHaveBeenCalled();
    });

    it('should handle entities without metadataExtractor', () => {
      interface TestEntity {
        name: string;
      }

      const hook = createDomainHook<TestEntity>({
        storeType: 'life-data' as StoreType,
        entityType: 'milestone' as EntityType,
        contentBuilder: (e) => `Name: ${e.name}`,
      });

      hook('user123', 'entity456', { name: 'Test' }, 'create');

      expect(storeHooks.onStoreChange).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {},
        })
      );
    });
  });

  describe('Helper Functions', () => {
    describe('joinNonEmpty', () => {
      it('should join non-empty strings with default separator', () => {
        const result = joinNonEmpty(['Hello', 'World', 'Test']);
        expect(result).toBe('Hello World Test');
      });

      it('should filter out empty and undefined values', () => {
        const result = joinNonEmpty(['Hello', '', undefined, null, 'World', '  ', 'Test']);
        expect(result).toBe('Hello World Test');
      });

      it('should use custom separator', () => {
        const result = joinNonEmpty(['A', 'B', 'C'], ', ');
        expect(result).toBe('A, B, C');
      });

      it('should return empty string for all empty values', () => {
        const result = joinNonEmpty(['', undefined, null, '   ']);
        expect(result).toBe('');
      });
    });

    describe('formatField', () => {
      it('should format a field with label', () => {
        const result = formatField('Status', 'active');
        expect(result).toBe('Status: active.');
      });

      it('should return empty for undefined', () => {
        const result = formatField('Status', undefined);
        expect(result).toBe('');
      });

      it('should return empty for null', () => {
        const result = formatField('Status', null);
        expect(result).toBe('');
      });

      it('should return empty for empty string', () => {
        const result = formatField('Status', '');
        expect(result).toBe('');
      });

      it('should format array values', () => {
        const result = formatField('Tags', ['work', 'important', 'urgent']);
        expect(result).toBe('Tags: work, important, urgent.');
      });

      it('should return empty for empty array', () => {
        const result = formatField('Tags', []);
        expect(result).toBe('');
      });
    });

    describe('formatDate', () => {
      it('should format a date string', () => {
        const result = formatDate('2024-12-25');
        // Format varies by timezone, just check it contains the year and month
        expect(result).toContain('2024');
        expect(result).toContain('Dec');
      });

      it('should format a Date object', () => {
        // Use UTC to avoid timezone issues
        const date = new Date(Date.UTC(2024, 0, 15, 12, 0, 0));
        const result = formatDate(date);
        expect(result).toContain('2024');
        expect(result).toContain('Jan');
      });

      it('should return empty for undefined', () => {
        const result = formatDate(undefined);
        expect(result).toBe('');
      });
    });

    describe('formatCurrency', () => {
      it('should format a number as currency', () => {
        const result = formatCurrency(1234);
        expect(result).toBe('$1,234');
      });

      it('should format large numbers', () => {
        const result = formatCurrency(1000000);
        expect(result).toBe('$1,000,000');
      });

      it('should return empty for undefined', () => {
        const result = formatCurrency(undefined);
        expect(result).toBe('');
      });
    });

    describe('createContentBuilder', () => {
      it('should create a content builder from config', () => {
        interface Product {
          name: string;
          price: number;
          category: string;
        }

        const builder = createContentBuilder<Product>('Product', [
          { key: 'name' },
          { key: 'price', label: 'Price', formatter: (v) => `$${v}` },
          { key: 'category', label: 'Category' },
        ]);

        const result = builder({ name: 'Widget', price: 99, category: 'Tools' });
        expect(result).toBe('Product: Widget Price: $99. Category: Tools.');
      });

      it('should skip undefined fields', () => {
        interface Item {
          name: string;
          description?: string;
        }

        const builder = createContentBuilder<Item>('Item', [
          { key: 'name' },
          { key: 'description', label: 'Description' },
        ]);

        const result = builder({ name: 'Test' });
        expect(result).toBe('Item: Test');
      });
    });
  });
});
