/**
 * Scheduling Services
 *
 * Services related to reminders, scheduling, and proactive outreach.
 *
 * @module services/scheduling
 */

// Core background task system (modular)
export * from './background-types.js';
export * from './background-tasks.js';
export * from './task-queue.js';
export * from './workflow-engine.js';
export * from './delegation-service.js';

// Scheduling and appointment services
export * from './appointment-followup.js';
export * from './appointment-integration.js';
export * from './calendar-busy-detection.js';
export * from './calendar-reminders.js';

// Proactive services
export * from './proactive-insights-service.js';
export * from './proactive-scheduler.js';

// Notification services
export * from './reminder-scheduler.js';
export * from './workflow-notifications.js';
