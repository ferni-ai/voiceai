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
// ============================================================================
// CONTAINER
// ============================================================================
/**
 * Dependency injection container
 */
export class Container {
    registrations = new Map();
    parent;
    constructor(parent) {
        this.parent = parent;
    }
    /**
     * Register a service factory (creates new instance each time)
     */
    register(id, factory) {
        this.registrations.set(id, { factory, singleton: false });
        return this;
    }
    /**
     * Register a singleton service (creates once, reuses)
     */
    registerSingleton(id, factory) {
        this.registrations.set(id, { factory, singleton: true });
        return this;
    }
    /**
     * Register an existing instance
     */
    registerInstance(id, instance) {
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
    resolve(id) {
        const registration = this.getRegistration(id);
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
    tryResolve(id) {
        try {
            return this.resolve(id);
        }
        catch {
            return undefined;
        }
    }
    /**
     * Check if a service is registered
     */
    has(id) {
        return this.registrations.has(id) || (this.parent?.has(id) ?? false);
    }
    /**
     * Create a scoped container (inherits from this one)
     */
    createScope() {
        return new Container(this);
    }
    /**
     * Clear all registrations
     */
    clear() {
        this.registrations.clear();
    }
    /**
     * Clear singleton instances (useful for testing)
     */
    clearInstances() {
        for (const registration of this.registrations.values()) {
            registration.instance = undefined;
        }
    }
    /**
     * Get registration (checks parent if not found locally)
     */
    getRegistration(id) {
        const local = this.registrations.get(id);
        if (local)
            return local;
        return this.parent?.getRegistration(id);
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
let globalContainer = null;
/**
 * Get the global container
 *
 * Creates the container on first access (lazy initialization).
 * Subsequent calls return the same instance.
 */
export function getContainer() {
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
export function resetContainer() {
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
    // Schedulers
    ReminderScheduler: Symbol('ReminderScheduler'),
    ProactiveScheduler: Symbol('ProactiveScheduler'),
};
/**
 * Helper to create injectable definitions
 */
export function defineInjectable(config) {
    return {
        dependencies: config.dependencies,
        create(container) {
            const deps = config.dependencies.map((id) => container.resolve(id));
            return config.factory(deps, container);
        },
    };
}
//# sourceMappingURL=container.js.map