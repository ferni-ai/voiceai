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
/**
 * Service factory function
 */
export type Factory<T> = (container: Container) => T;
/**
 * Service identifier - can be string or symbol
 */
export type ServiceId = string | symbol;
/**
 * Dependency injection container
 */
export declare class Container {
    private registrations;
    private parent?;
    constructor(parent?: Container);
    /**
     * Register a service factory (creates new instance each time)
     */
    register<T>(id: ServiceId, factory: Factory<T>): this;
    /**
     * Register a singleton service (creates once, reuses)
     */
    registerSingleton<T>(id: ServiceId, factory: Factory<T>): this;
    /**
     * Register an existing instance
     */
    registerInstance<T>(id: ServiceId, instance: T): this;
    /**
     * Resolve a service
     */
    resolve<T>(id: ServiceId): T;
    /**
     * Try to resolve a service, returns undefined if not found
     */
    tryResolve<T>(id: ServiceId): T | undefined;
    /**
     * Check if a service is registered
     */
    has(id: ServiceId): boolean;
    /**
     * Create a scoped container (inherits from this one)
     */
    createScope(): Container;
    /**
     * Clear all registrations
     */
    clear(): void;
    /**
     * Clear singleton instances (useful for testing)
     */
    clearInstances(): void;
    /**
     * Get registration (checks parent if not found locally)
     */
    private getRegistration;
}
/**
 * Get the global container
 *
 * Creates the container on first access (lazy initialization).
 * Subsequent calls return the same instance.
 */
export declare function getContainer(): Container;
/**
 * Reset the global container (for testing)
 *
 * Call this in test teardown to ensure clean state between tests.
 */
export declare function resetContainer(): void;
/**
 * Service tokens for type-safe resolution
 *
 * Usage:
 *   container.register(Tokens.Logger, () => new Logger());
 *   const logger = container.resolve<Logger>(Tokens.Logger);
 */
export declare const Tokens: {
    readonly Logger: symbol;
    readonly Config: symbol;
    readonly MemoryStore: symbol;
    readonly VectorStore: symbol;
    readonly RedisCache: symbol;
    readonly EmotionDetector: symbol;
    readonly IntentClassifier: symbol;
    readonly TopicTracker: symbol;
    readonly StateMachine: symbol;
    readonly LearningEngine: symbol;
    readonly AgentBus: symbol;
    readonly LifeDataStore: symbol;
    readonly ProductivityStore: symbol;
    readonly BackgroundTasks: symbol;
    readonly CollectiveLearning: symbol;
    readonly ReminderScheduler: symbol;
    readonly ProactiveScheduler: symbol;
};
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
export declare function defineInjectable<T, D extends ServiceId[]>(config: {
    dependencies: D;
    factory: (deps: {
        [K in keyof D]: unknown;
    }, container: Container) => T;
}): Injectable<T>;
//# sourceMappingURL=container.d.ts.map