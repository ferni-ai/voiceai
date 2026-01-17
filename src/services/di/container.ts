/**
 * Dependency Injection Container
 *
 * Lightweight DI container for managing service dependencies.
 * Enables testability and explicit dependency management.
 *
 * Usage:
 *
 *   // Register services
 *   container.register('logger', () => new Logger());
 *   container.registerSingleton('database', () => new Database());
 *
 *   // Resolve services
 *   const logger = container.resolve<Logger>('logger');
 *
 *   // Create scoped containers for tests
 *   const testContainer = container.createScope();
 *   testContainer.register('database', () => mockDatabase);
 */

import { getLogger } from '../../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Service factory function
 */
export type Factory<T> = (container: Container) => T;

/**
 * Service registration
 */
interface Registration<T = unknown> {
  factory: Factory<T>;
  singleton: boolean;
  instance?: T;
}

/**
 * Service identifier - can be string or symbol
 */
export type ServiceId = string | symbol;

// ============================================================================
// CONTAINER
// ============================================================================

/**
 * Dependency injection container
 */
export class Container {
  private registrations = new Map<ServiceId, Registration>();
  private parent?: Container;

  constructor(parent?: Container) {
    this.parent = parent;
  }

  /**
   * Register a service factory (creates new instance each time)
   */
  register<T>(id: ServiceId, factory: Factory<T>): this {
    this.registrations.set(id, { factory, singleton: false });
    return this;
  }

  /**
   * Register a singleton service (creates once, reuses)
   */
  registerSingleton<T>(id: ServiceId, factory: Factory<T>): this {
    this.registrations.set(id, { factory, singleton: true });
    return this;
  }

  /**
   * Register an existing instance
   */
  registerInstance<T>(id: ServiceId, instance: T): this {
    this.registrations.set(id, {
      factory: () => instance,
      singleton: true,
      instance,
    });
    return this;
  }

  /**
   * Resolve a service
   */
  resolve<T>(id: ServiceId): T {
    const registration = this.getRegistration<T>(id);

    if (!registration) {
      throw new Error(`Service '${String(id)}' not registered`);
    }

    // Return singleton instance if already created
    if (registration.singleton && registration.instance !== undefined) {
      return registration.instance;
    }

    // Create instance
    const instance = registration.factory(this);

    // Store singleton instance
    if (registration.singleton) {
      registration.instance = instance;
    }

    return instance;
  }

  /**
   * Try to resolve a service, returns undefined if not found
   */
  tryResolve<T>(id: ServiceId): T | undefined {
    try {
      return this.resolve<T>(id);
    } catch {
      return undefined;
    }
  }

  /**
   * Check if a service is registered
   */
  has(id: ServiceId): boolean {
    return this.registrations.has(id) || (this.parent?.has(id) ?? false);
  }

  /**
   * Create a scoped container (inherits from this one)
   */
  createScope(): Container {
    return new Container(this);
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.registrations.clear();
  }

  /**
   * Clear singleton instances (useful for testing)
   */
  clearInstances(): void {
    for (const registration of this.registrations.values()) {
      registration.instance = undefined;
    }
  }

  /**
   * Get registration (checks parent if not found locally)
   */
  private getRegistration<T>(id: ServiceId): Registration<T> | undefined {
    const local = this.registrations.get(id) as Registration<T> | undefined;
    if (local) return local;
    return this.parent?.getRegistration<T>(id);
  }
}

// ============================================================================
// GLOBAL CONTAINER
// ============================================================================

/**
 * Global container singleton.
 *
 * Note: JavaScript is single-threaded, so true race conditions cannot occur
 * in synchronous code. The Container constructor is synchronous, so no lock
 * is needed. If you're seeing "multiple containers" issues, check for:
 * - Multiple module copies (npm install issues)
 * - Test isolation problems (missing resetContainer() calls)
 */
let globalContainer: Container | null = null;

/**
 * Get the global container
 *
 * Creates the container on first access (lazy initialization).
 * Subsequent calls return the same instance.
 */
export function getContainer(): Container {
  // Fast path: already initialized (most common case)
  if (globalContainer) {
    return globalContainer;
  }

  // Create singleton - this is atomic in single-threaded JavaScript
  // No lock needed since Container constructor is synchronous
  globalContainer = new Container();
  return globalContainer;
}

/**
 * Reset the global container (for testing)
 *
 * Call this in test teardown to ensure clean state between tests.
 */
export function resetContainer(): void {
  globalContainer?.clear();
  globalContainer = null;
}

// ============================================================================
// SERVICE TOKENS
// ============================================================================

/**
 * Service tokens for type-safe resolution
 *
 * Usage:
 *   container.register(Tokens.Logger, () => new Logger());
 *   const logger = container.resolve<Logger>(Tokens.Logger);
 */
export const Tokens = {
  // Core services
  Logger: Symbol('Logger'),
  Config: Symbol('Config'),

  // Storage
  MemoryStore: Symbol('MemoryStore'),
  VectorStore: Symbol('VectorStore'),
  RedisCache: Symbol('RedisCache'),

  // Intelligence
  EmotionDetector: Symbol('EmotionDetector'),
  IntentClassifier: Symbol('IntentClassifier'),
  TopicTracker: Symbol('TopicTracker'),
  StateMachine: Symbol('StateMachine'),
  LearningEngine: Symbol('LearningEngine'),

  // Services
  AgentBus: Symbol('AgentBus'),
  LifeDataStore: Symbol('LifeDataStore'),
  ProductivityStore: Symbol('ProductivityStore'),
  BackgroundTasks: Symbol('BackgroundTasks'),
  CollectiveLearning: Symbol('CollectiveLearning'),

  // Memory Services (Better than Human memory capabilities)
  CognitiveMemory: Symbol('CognitiveMemory'),
  VoiceMemory: Symbol('VoiceMemory'),
  UnifiedMemory: Symbol('UnifiedMemory'),
  LearnedMemories: Symbol('LearnedMemories'),
  ProactiveMemorySurfacing: Symbol('ProactiveMemorySurfacing'),

  // Schedulers
  ReminderScheduler: Symbol('ReminderScheduler'),
  ProactiveScheduler: Symbol('ProactiveScheduler'),
} as const;

// ============================================================================
// DECORATOR HELPERS (for future use)
// ============================================================================

/**
 * Create an injectable class wrapper
 * For classes that want to declare their dependencies
 */
export interface Injectable<T> {
  create: (container: Container) => T;
  dependencies: ServiceId[];
}

/**
 * Helper to create injectable definitions
 */
export function defineInjectable<T, D extends ServiceId[]>(config: {
  dependencies: D;
  factory: (deps: { [K in keyof D]: unknown }, container: Container) => T;
}): Injectable<T> {
  return {
    dependencies: config.dependencies,
    create(container: Container): T {
      const deps = config.dependencies.map((id) => container.resolve(id));
      return config.factory(deps as { [K in keyof D]: unknown }, container);
    },
  };
}
