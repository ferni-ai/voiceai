/**
 * Life Automation Test Suite
 *
 * Test coverage for Life Automation features:
 * - Stores: subscription, document, meal, workflow
 * - Services: MealPlanner, WorkflowEngine, SubscriptionDetector, ActionEngine
 * - Scheduler: Cron-based workflow scheduling
 * - Event Bus: Pub/sub for workflow triggers
 * - Job Queue: Background job processing
 * - Template Library: Pre-built workflow templates
 * - Action Retry: Intelligent retry with circuit breaker
 * - Tool Domains: commerce, documents, meal-planning, workflows, transportation
 * - Integration: Cross-service flows
 *
 * Run with: pnpm vitest run src/tests/life-automation
 */

export * from './stores.test.js';
export * from './services.test.js';
export * from './scheduler.test.js';
export * from './event-bus.test.js';
export * from './job-queue.test.js';
export * from './template-library.test.js';
export * from './action-retry.test.js';
export * from './tool-domains.test.js';
export * from './integration.test.js';
