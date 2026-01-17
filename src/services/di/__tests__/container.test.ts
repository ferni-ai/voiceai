/**
 * Dependency Injection Container Tests
 *
 * Tests for DI container registration, resolution, scoping, and tokens.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the logger
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import {
  Container,
  type Factory,
  type ServiceId,
  getContainer,
  resetContainer,
  Tokens,
} from '../container.js';

describe('DI Container', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
    resetContainer();
  });

  afterEach(() => {
    resetContainer();
  });

  describe('Container class', () => {
    describe('register()', () => {
      it('should register a factory', () => {
        container.register('test', () => ({ value: 42 }));
        expect(container.has('test')).toBe(true);
      });

      it('should return this for chaining', () => {
        const result = container.register('a', () => 1);
        expect(result).toBe(container);
      });

      it('should allow chained registration', () => {
        container
          .register('a', () => 1)
          .register('b', () => 2)
          .register('c', () => 3);

        expect(container.has('a')).toBe(true);
        expect(container.has('b')).toBe(true);
        expect(container.has('c')).toBe(true);
      });

      it('should create new instance each time', () => {
        container.register('counter', () => ({ count: Math.random() }));

        const first = container.resolve<{ count: number }>('counter');
        const second = container.resolve<{ count: number }>('counter');

        expect(first.count).not.toBe(second.count);
      });
    });

    describe('registerSingleton()', () => {
      it('should register a singleton factory', () => {
        container.registerSingleton('single', () => ({ id: Math.random() }));
        expect(container.has('single')).toBe(true);
      });

      it('should return same instance each time', () => {
        container.registerSingleton('single', () => ({ id: Math.random() }));

        const first = container.resolve<{ id: number }>('single');
        const second = container.resolve<{ id: number }>('single');

        expect(first).toBe(second);
        expect(first.id).toBe(second.id);
      });

      it('should return this for chaining', () => {
        const result = container.registerSingleton('s', () => 1);
        expect(result).toBe(container);
      });
    });

    describe('registerInstance()', () => {
      it('should register an existing instance', () => {
        const instance = { data: 'test' };
        container.registerInstance('instance', instance);

        expect(container.has('instance')).toBe(true);
        expect(container.resolve('instance')).toBe(instance);
      });

      it('should return same instance every time', () => {
        const instance = { id: 123 };
        container.registerInstance('myInstance', instance);

        expect(container.resolve('myInstance')).toBe(instance);
        expect(container.resolve('myInstance')).toBe(instance);
      });
    });

    describe('resolve()', () => {
      it('should resolve registered service', () => {
        container.register('service', () => ({ name: 'TestService' }));
        const result = container.resolve<{ name: string }>('service');

        expect(result.name).toBe('TestService');
      });

      it('should throw for unregistered service', () => {
        expect(() => container.resolve('unknown')).toThrow("Service 'unknown' not registered");
      });

      it('should pass container to factory', () => {
        container.register('config', () => ({ port: 8080 }));
        container.register('server', (c) => ({
          config: c.resolve<{ port: number }>('config'),
        }));

        const server = container.resolve<{ config: { port: number } }>('server');
        expect(server.config.port).toBe(8080);
      });

      it('should support symbol service ids', () => {
        const TOKEN = Symbol('TestToken');
        container.register(TOKEN, () => 'symbol value');

        expect(container.resolve(TOKEN)).toBe('symbol value');
      });
    });

    describe('tryResolve()', () => {
      it('should return service if registered', () => {
        container.register('exists', () => 'value');
        const result = container.tryResolve<string>('exists');

        expect(result).toBe('value');
      });

      it('should return undefined if not registered', () => {
        const result = container.tryResolve('notExists');

        expect(result).toBeUndefined();
      });
    });

    describe('has()', () => {
      it('should return true for registered service', () => {
        container.register('hasTest', () => 1);
        expect(container.has('hasTest')).toBe(true);
      });

      it('should return false for unregistered service', () => {
        expect(container.has('nope')).toBe(false);
      });

      it('should check parent container', () => {
        container.register('parent', () => 'parentValue');
        const child = container.createScope();

        expect(child.has('parent')).toBe(true);
      });
    });

    describe('createScope()', () => {
      it('should create child container', () => {
        const child = container.createScope();
        expect(child).toBeInstanceOf(Container);
        expect(child).not.toBe(container);
      });

      it('should inherit parent registrations', () => {
        container.register('inherited', () => 'fromParent');
        const child = container.createScope();

        expect(child.resolve('inherited')).toBe('fromParent');
      });

      it('should allow override in child', () => {
        container.register('override', () => 'parent');
        const child = container.createScope();
        child.register('override', () => 'child');

        expect(container.resolve('override')).toBe('parent');
        expect(child.resolve('override')).toBe('child');
      });

      it('should not affect parent when child adds service', () => {
        const child = container.createScope();
        child.register('childOnly', () => 'childValue');

        expect(child.has('childOnly')).toBe(true);
        expect(container.has('childOnly')).toBe(false);
      });
    });

    describe('clear()', () => {
      it('should remove all registrations', () => {
        container.register('a', () => 1);
        container.register('b', () => 2);
        container.clear();

        expect(container.has('a')).toBe(false);
        expect(container.has('b')).toBe(false);
      });
    });

    describe('clearInstances()', () => {
      it('should clear singleton instances', () => {
        let count = 0;
        container.registerSingleton('counter', () => ++count);

        const first = container.resolve<number>('counter');
        expect(first).toBe(1);

        container.clearInstances();

        const second = container.resolve<number>('counter');
        expect(second).toBe(2);
      });
    });
  });

  describe('Global container', () => {
    describe('getContainer()', () => {
      it('should return a container', () => {
        const global = getContainer();
        expect(global).toBeInstanceOf(Container);
      });

      it('should return same container on multiple calls', () => {
        const first = getContainer();
        const second = getContainer();

        expect(first).toBe(second);
      });
    });

    describe('resetContainer()', () => {
      it('should reset global container', () => {
        const before = getContainer();
        before.register('test', () => 1);

        resetContainer();

        const after = getContainer();
        expect(after.has('test')).toBe(false);
      });

      it('should create new container after reset', () => {
        const before = getContainer();
        resetContainer();
        const after = getContainer();

        expect(before).not.toBe(after);
      });
    });
  });

  describe('Tokens', () => {
    it('should have core service tokens', () => {
      expect(Tokens.Logger).toBeDefined();
      expect(Tokens.Config).toBeDefined();
    });

    it('should have storage tokens', () => {
      expect(Tokens.MemoryStore).toBeDefined();
      expect(Tokens.VectorStore).toBeDefined();
      expect(Tokens.RedisCache).toBeDefined();
    });

    it('should have intelligence tokens', () => {
      expect(Tokens.EmotionDetector).toBeDefined();
      expect(Tokens.IntentClassifier).toBeDefined();
      expect(Tokens.TopicTracker).toBeDefined();
      expect(Tokens.StateMachine).toBeDefined();
      expect(Tokens.LearningEngine).toBeDefined();
    });

    it('should have service tokens', () => {
      expect(Tokens.AgentBus).toBeDefined();
      expect(Tokens.LifeDataStore).toBeDefined();
      expect(Tokens.ProductivityStore).toBeDefined();
      expect(Tokens.BackgroundTasks).toBeDefined();
      expect(Tokens.CollectiveLearning).toBeDefined();
    });

    it('should have scheduler tokens', () => {
      expect(Tokens.ReminderScheduler).toBeDefined();
      expect(Tokens.ProactiveScheduler).toBeDefined();
    });

    it('should use unique symbols', () => {
      expect(typeof Tokens.Logger).toBe('symbol');
      expect(typeof Tokens.Config).toBe('symbol');
      expect(Tokens.Logger).not.toBe(Tokens.Config);
    });
  });

  describe('Type safety', () => {
    it('should work with typed factories', () => {
      interface Logger {
        log: (msg: string) => void;
      }

      const loggerFactory: Factory<Logger> = () => ({
        log: (msg: string) => console.log(msg),
      });

      container.register(Tokens.Logger, loggerFactory);
      const logger = container.resolve<Logger>(Tokens.Logger);

      expect(typeof logger.log).toBe('function');
    });

    it('should work with string service ids', () => {
      const id: ServiceId = 'myService';
      container.register(id, () => 'value');
      expect(container.resolve(id)).toBe('value');
    });

    it('should work with symbol service ids', () => {
      const id: ServiceId = Symbol('myService');
      container.register(id, () => 'value');
      expect(container.resolve(id)).toBe('value');
    });
  });

  describe('Dependency injection patterns', () => {
    it('should support constructor injection pattern', () => {
      interface Database {
        query: (sql: string) => string[];
      }

      interface UserService {
        db: Database;
        getUsers: () => string[];
      }

      container.registerSingleton('db', () => ({
        query: (sql: string) => [`result for: ${sql}`],
      }));

      container.register('userService', (c) => {
        const db = c.resolve<Database>('db');
        return {
          db,
          getUsers: () => db.query('SELECT * FROM users'),
        };
      });

      const userService = container.resolve<UserService>('userService');
      expect(userService.getUsers()).toEqual(['result for: SELECT * FROM users']);
    });

    it('should support lazy resolution', () => {
      let resolved = false;

      container.register('lazy', () => {
        resolved = true;
        return 'lazy value';
      });

      expect(resolved).toBe(false);
      container.resolve('lazy');
      expect(resolved).toBe(true);
    });

    it('should support circular dependency via factory', () => {
      // A depends on B, B depends on A (via lazy resolution)
      container.registerSingleton('a', (c) => ({
        name: 'A',
        getB: () => c.resolve<{ name: string }>('b'),
      }));

      container.registerSingleton('b', (c) => ({
        name: 'B',
        getA: () => c.resolve<{ name: string; getB: () => { name: string } }>('a'),
      }));

      const a = container.resolve<{ name: string; getB: () => { name: string } }>('a');
      const b = a.getB();

      expect(a.name).toBe('A');
      expect(b.name).toBe('B');
    });
  });

  describe('Scoped containers for testing', () => {
    it('should isolate test dependencies', () => {
      // Production setup
      container.register('api', () => ({
        call: () => 'real api call',
      }));

      // Test scope
      const testScope = container.createScope();
      testScope.register('api', () => ({
        call: () => 'mock api call',
      }));

      // Production uses real
      expect(container.resolve<{ call: () => string }>('api').call()).toBe('real api call');

      // Test uses mock
      expect(testScope.resolve<{ call: () => string }>('api').call()).toBe('mock api call');
    });

    it('should allow selective overrides', () => {
      container.register('config', () => ({ env: 'production' }));
      container.register('logger', () => ({ level: 'info' }));

      const testScope = container.createScope();
      testScope.register('config', () => ({ env: 'test' }));
      // logger is inherited

      expect(testScope.resolve<{ env: string }>('config').env).toBe('test');
      expect(testScope.resolve<{ level: string }>('logger').level).toBe('info');
    });
  });
});
