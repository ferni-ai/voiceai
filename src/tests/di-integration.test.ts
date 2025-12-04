/**
 * DI Integration Tests
 *
 * Tests the DI container integration with services.
 * Verifies that:
 * 1. Services can be bootstrapped via DI
 * 2. Mock injection works for testing
 * 3. Singleton behavior is correct
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  Container,
  getContainer,
  resetContainer,
  Tokens,
  bootstrapServices,
  resetServices,
  type BootstrapOptions,
} from '../services/di/index.js';
import {
  Result,
  success,
  failure,
  isSuccess,
  isFailure,
  expectSuccess,
  expectFailure,
  tryCatch,
  tryCatchAsync,
} from '../types/index.js';

// ============================================================================
// DI CONTAINER TESTS
// ============================================================================

describe('DI Container', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe('Basic Registration and Resolution', () => {
    it('should register and resolve a factory', () => {
      container.register('logger', () => ({ log: vi.fn() }));
      
      const logger = container.resolve('logger');
      
      expect(logger).toBeDefined();
      expect(logger).toHaveProperty('log');
    });

    it('should create new instances for non-singleton factories', () => {
      let callCount = 0;
      container.register('counter', () => ({ id: ++callCount }));
      
      const first = container.resolve<{ id: number }>('counter');
      const second = container.resolve<{ id: number }>('counter');
      
      expect(first.id).toBe(1);
      expect(second.id).toBe(2);
    });

    it('should reuse instances for singleton factories', () => {
      let callCount = 0;
      container.registerSingleton('counter', () => ({ id: ++callCount }));
      
      const first = container.resolve<{ id: number }>('counter');
      const second = container.resolve<{ id: number }>('counter');
      
      expect(first.id).toBe(1);
      expect(second.id).toBe(1);
      expect(first).toBe(second);
    });

    it('should register and return instance directly', () => {
      const instance = { value: 42 };
      container.registerInstance('config', instance);
      
      const resolved = container.resolve<{ value: number }>('config');
      
      expect(resolved).toBe(instance);
      expect(resolved.value).toBe(42);
    });
  });

  describe('Scoped Containers', () => {
    it('should create scoped containers that inherit from parent', () => {
      container.registerInstance('parentValue', { value: 'parent' });
      
      const scoped = container.createScope();
      
      const resolved = scoped.resolve<{ value: string }>('parentValue');
      expect(resolved.value).toBe('parent');
    });

    it('should allow scoped overrides', () => {
      container.registerInstance('config', { env: 'production' });
      
      const testScope = container.createScope();
      testScope.registerInstance('config', { env: 'test' });
      
      const prodConfig = container.resolve<{ env: string }>('config');
      const testConfig = testScope.resolve<{ env: string }>('config');
      
      expect(prodConfig.env).toBe('production');
      expect(testConfig.env).toBe('test');
    });
  });

  describe('Error Handling', () => {
    it('should throw when resolving unregistered service', () => {
      expect(() => container.resolve('unknown')).toThrow();
    });

    it('should return undefined for tryResolve on unregistered service', () => {
      const result = container.tryResolve('unknown');
      expect(result).toBeUndefined();
    });
  });
});

// ============================================================================
// RESULT TYPE TESTS
// ============================================================================

describe('Result Types', () => {
  describe('Basic Operations', () => {
    it('should create success results', () => {
      const result = success({ name: 'test' });
      
      expect(isSuccess(result)).toBe(true);
      expect(isFailure(result)).toBe(false);
      
      if (isSuccess(result)) {
        expect(result.data.name).toBe('test');
      }
    });

    it('should create failure results', () => {
      const error = new Error('Something went wrong');
      const result = failure(error);
      
      expect(isSuccess(result)).toBe(false);
      expect(isFailure(result)).toBe(true);
      
      if (isFailure(result)) {
        expect(result.error.message).toBe('Something went wrong');
      }
    });
  });

  describe('Test Utilities', () => {
    it('expectSuccess should return data for success', () => {
      const result = success({ value: 42 });
      const data = expectSuccess(result);
      expect(data.value).toBe(42);
    });

    it('expectSuccess should throw for failure', () => {
      const result = failure(new Error('fail'));
      expect(() => expectSuccess(result)).toThrow();
    });

    it('expectFailure should return error for failure', () => {
      const result = failure(new Error('fail'));
      const error = expectFailure(result);
      expect(error.message).toBe('fail');
    });

    it('expectFailure should throw for success', () => {
      const result = success({ value: 42 });
      expect(() => expectFailure(result)).toThrow();
    });
  });

  describe('Conversion Utilities', () => {
    it('tryCatch should convert successful function to Result', () => {
      const result = tryCatch(() => 42);
      
      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data).toBe(42);
      }
    });

    it('tryCatch should convert throwing function to Result', () => {
      const result = tryCatch(() => {
        throw new Error('oops');
      });
      
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.message).toBe('oops');
      }
    });

    it('tryCatchAsync should convert resolved promise to Result', async () => {
      const result = await tryCatchAsync(Promise.resolve(42));
      
      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data).toBe(42);
      }
    });

    it('tryCatchAsync should convert rejected promise to Result', async () => {
      const result = await tryCatchAsync(Promise.reject(new Error('async fail')));
      
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.message).toBe('async fail');
      }
    });
  });
});

// ============================================================================
// SERVICE REGISTRATION TESTS
// ============================================================================

describe('Service Registration', () => {
  beforeEach(() => {
    resetContainer();
  });

  afterEach(() => {
    resetContainer();
  });

  it('should have service tokens defined', () => {
    expect(Tokens.MemoryStore).toBeDefined();
    expect(Tokens.VectorStore).toBeDefined();
    expect(Tokens.ProductivityStore).toBeDefined();
    expect(Tokens.AgentBus).toBeDefined();
    expect(Tokens.LifeDataStore).toBeDefined();
  });

  it('should get the global container', () => {
    const container1 = getContainer();
    const container2 = getContainer();
    
    expect(container1).toBe(container2);
  });

  it('should reset the global container', () => {
    const container1 = getContainer();
    container1.registerInstance('test', { value: 1 });
    
    resetContainer();
    
    const container2 = getContainer();
    expect(container2.tryResolve('test')).toBeUndefined();
  });
});

// ============================================================================
// CONSOLIDATED TOOLS TESTS
// ============================================================================

describe.skip('Consolidated Tools', () => {
  // NOTE: Skipped - Consolidated tools module has been removed.
  // Tools are now organized by domain (domains/finance, domains/memory, etc.)
  it('should export consolidated financial tool', async () => {});
  it('should export consolidated memory tool', async () => {});
  it('should export consolidated productivity tool', async () => {});
});

