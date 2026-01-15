/**
 * Event Bus
 *
 * Central pub/sub system for workflow automation triggers.
 * Supports both synchronous and asynchronous event handling.
 *
 * Event types:
 * - System events (task_completed, habit_logged, call_ended)
 * - Integration events (email_received, calendar_event)
 * - User events (location_changed, device_state_changed)
 * - Custom events (from workflows or external sources)
 *
 * @module services/workflows/events/event-bus
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { EventEmitter } from 'events';

const log = createLogger({ module: 'event-bus' });

// ============================================================================
// TYPES
// ============================================================================

export type SystemEventType =
  // Task events
  | 'task_created'
  | 'task_completed'
  | 'task_updated'
  | 'task_deleted'
  // Habit events
  | 'habit_logged'
  | 'habit_streak_broken'
  | 'habit_milestone'
  // Call events
  | 'call_started'
  | 'call_ended'
  | 'persona_changed'
  // Calendar events
  | 'calendar_event_starting'
  | 'calendar_event_ended'
  | 'calendar_reminder'
  // Email events
  | 'email_received'
  | 'email_sent'
  | 'email_important'
  // Financial events
  | 'transaction_detected'
  | 'subscription_due'
  | 'budget_alert'
  // Location events
  | 'location_entered'
  | 'location_exited'
  | 'location_near'
  // Device events
  | 'device_state_changed'
  | 'device_triggered'
  // Workflow events
  | 'workflow_completed'
  | 'workflow_failed'
  | 'workflow_scheduled'
  // User events
  | 'user_login'
  | 'user_active'
  | 'user_idle'
  // Custom events
  | 'custom';

export interface EventPayload {
  userId: string;
  eventType: SystemEventType;
  timestamp: Date;
  source: string;
  data: Record<string, unknown>;
  metadata?: {
    correlationId?: string;
    traceId?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  };
}

export interface EventSubscription {
  id: string;
  eventType: SystemEventType | '*'; // '*' for all events
  filter?: EventFilter;
  handler: EventHandler;
  priority: number;
  createdAt: Date;
}

export interface EventFilter {
  userId?: string;
  source?: string;
  dataMatch?: Record<string, unknown>;
}

export type EventHandler = (event: EventPayload) => Promise<void> | void;

export interface EventBusStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  subscriberCount: number;
  averageHandlerTime: number;
  errors: number;
}

// ============================================================================
// EVENT BUS CLASS
// ============================================================================

export class EventBus {
  private emitter: EventEmitter;
  private subscriptions: Map<string, EventSubscription> = new Map();
  private stats: EventBusStats;
  private handlerTimes: number[] = [];

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100); // Allow many subscribers
    this.stats = {
      totalEvents: 0,
      eventsByType: {},
      subscriberCount: 0,
      averageHandlerTime: 0,
      errors: 0,
    };

    log.info('Event bus initialized');
  }

  // ==========================================================================
  // PUBLISHING
  // ==========================================================================

  /**
   * Publish an event to all subscribers
   */
  async publish(event: Omit<EventPayload, 'timestamp'>): Promise<void> {
    const fullEvent: EventPayload = {
      ...event,
      timestamp: new Date(),
    };

    // Update stats
    this.stats.totalEvents++;
    this.stats.eventsByType[event.eventType] = (this.stats.eventsByType[event.eventType] || 0) + 1;

    log.debug(
      { eventType: event.eventType, userId: event.userId, source: event.source },
      'Publishing event'
    );

    // Get matching subscriptions sorted by priority
    const subscriptions = this.getMatchingSubscriptions(fullEvent);

    // Execute handlers
    for (const sub of subscriptions) {
      const startTime = Date.now();
      try {
        await sub.handler(fullEvent);
        this.recordHandlerTime(Date.now() - startTime);
      } catch (error) {
        this.stats.errors++;
        log.error(
          { error: String(error), subscriptionId: sub.id, eventType: event.eventType },
          'Event handler error'
        );
      }
    }

    // Also emit for synchronous listeners
    this.emitter.emit(event.eventType, fullEvent);
    this.emitter.emit('*', fullEvent);
  }

  /**
   * Publish multiple events in batch
   */
  async publishBatch(events: Array<Omit<EventPayload, 'timestamp'>>): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  // ==========================================================================
  // SUBSCRIBING
  // ==========================================================================

  /**
   * Subscribe to events
   */
  subscribe(
    eventType: SystemEventType | '*',
    handler: EventHandler,
    options?: {
      filter?: EventFilter;
      priority?: number;
    }
  ): string {
    const id = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const subscription: EventSubscription = {
      id,
      eventType,
      filter: options?.filter,
      handler,
      priority: options?.priority ?? 50, // Default middle priority
      createdAt: new Date(),
    };

    this.subscriptions.set(id, subscription);
    this.stats.subscriberCount = this.subscriptions.size;

    log.debug({ subscriptionId: id, eventType }, 'Subscription added');

    return id;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): boolean {
    const deleted = this.subscriptions.delete(subscriptionId);
    if (deleted) {
      this.stats.subscriberCount = this.subscriptions.size;
      log.debug({ subscriptionId }, 'Subscription removed');
    }
    return deleted;
  }

  /**
   * Subscribe with automatic cleanup (one-time handler)
   */
  once(
    eventType: SystemEventType | '*',
    handler: EventHandler,
    options?: { filter?: EventFilter; timeout?: number }
  ): Promise<EventPayload> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | null = null;

      const wrappedHandler: EventHandler = async (event) => {
        if (timeoutId) clearTimeout(timeoutId);
        this.unsubscribe(subId);
        await handler(event);
        resolve(event);
      };

      const subId = this.subscribe(eventType, wrappedHandler, options);

      if (options?.timeout) {
        timeoutId = setTimeout(() => {
          this.unsubscribe(subId);
          reject(new Error(`Event timeout: ${eventType}`));
        }, options.timeout);
      }
    });
  }

  // ==========================================================================
  // FILTERING
  // ==========================================================================

  /**
   * Get subscriptions that match an event
   */
  private getMatchingSubscriptions(event: EventPayload): EventSubscription[] {
    const matching: EventSubscription[] = [];

    for (const sub of this.subscriptions.values()) {
      if (this.matchesSubscription(event, sub)) {
        matching.push(sub);
      }
    }

    // Sort by priority (higher first)
    return matching.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Check if an event matches a subscription
   */
  private matchesSubscription(event: EventPayload, sub: EventSubscription): boolean {
    // Check event type
    if (sub.eventType !== '*' && sub.eventType !== event.eventType) {
      return false;
    }

    // Check filter
    if (sub.filter) {
      if (sub.filter.userId && sub.filter.userId !== event.userId) {
        return false;
      }
      if (sub.filter.source && sub.filter.source !== event.source) {
        return false;
      }
      if (sub.filter.dataMatch) {
        for (const [key, value] of Object.entries(sub.filter.dataMatch)) {
          if (event.data[key] !== value) {
            return false;
          }
        }
      }
    }

    return true;
  }

  // ==========================================================================
  // WORKFLOW INTEGRATION
  // ==========================================================================

  /**
   * Subscribe a workflow to event triggers
   */
  subscribeWorkflow(
    workflowId: string,
    userId: string,
    eventType: SystemEventType,
    conditions?: Record<string, unknown>,
    callback?: (event: EventPayload) => Promise<void>
  ): string {
    const handler: EventHandler = async (event) => {
      // Check conditions
      if (conditions) {
        for (const [key, value] of Object.entries(conditions)) {
          if (event.data[key] !== value) {
            return; // Condition not met
          }
        }
      }

      log.info({ workflowId, eventType: event.eventType }, 'Workflow triggered by event');

      if (callback) {
        await callback(event);
      }
    };

    return this.subscribe(eventType, handler, {
      filter: { userId },
      priority: 70, // Higher priority for workflows
    });
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  /**
   * Record handler execution time
   */
  private recordHandlerTime(timeMs: number): void {
    this.handlerTimes.push(timeMs);
    // Keep last 100 times for average
    if (this.handlerTimes.length > 100) {
      this.handlerTimes.shift();
    }
    this.stats.averageHandlerTime =
      this.handlerTimes.reduce((a, b) => a + b, 0) / this.handlerTimes.length;
  }

  /**
   * Get event bus statistics
   */
  getStats(): EventBusStats {
    return { ...this.stats };
  }

  /**
   * Get subscription count for an event type
   */
  getSubscriptionCount(eventType?: SystemEventType): number {
    if (!eventType) {
      return this.subscriptions.size;
    }
    return Array.from(this.subscriptions.values()).filter(
      (s) => s.eventType === eventType || s.eventType === '*'
    ).length;
  }

  /**
   * Clear all subscriptions
   */
  clearSubscriptions(): void {
    this.subscriptions.clear();
    this.stats.subscriberCount = 0;
    log.info('All subscriptions cleared');
  }

  /**
   * Clear statistics
   */
  clearStats(): void {
    this.stats = {
      totalEvents: 0,
      eventsByType: {},
      subscriberCount: this.subscriptions.size,
      averageHandlerTime: 0,
      errors: 0,
    };
    this.handlerTimes = [];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let eventBusInstance: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!eventBusInstance) {
    eventBusInstance = new EventBus();
  }
  return eventBusInstance;
}

export function resetEventBus(): void {
  if (eventBusInstance) {
    eventBusInstance.clearSubscriptions();
  }
  eventBusInstance = null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Publish a system event (convenience function)
 */
export function publishEvent(
  userId: string,
  eventType: SystemEventType,
  data: Record<string, unknown>,
  source: string = 'system'
): Promise<void> {
  return getEventBus().publish({
    userId,
    eventType,
    data,
    source,
  });
}

/**
 * Subscribe to system events (convenience function)
 */
export function onEvent(
  eventType: SystemEventType | '*',
  handler: EventHandler,
  filter?: EventFilter
): string {
  return getEventBus().subscribe(eventType, handler, { filter });
}
