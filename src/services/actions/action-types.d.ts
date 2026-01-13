/**
 * Action Engine Types
 *
 * Types for the transactional action execution system.
 * Supports two-phase commits: prepare -> confirm/cancel
 *
 * @module services/actions/action-types
 */
/**
 * All supported action types
 */
export type ActionType = 'uber_ride' | 'lyft_ride' | 'schedule_ride' | 'instacart_order' | 'doordash_order' | 'grocery_order' | 'send_email' | 'send_sms' | 'schedule_email' | 'schedule_sms' | 'create_event' | 'cancel_event' | 'reschedule_event' | 'pay_bill' | 'transfer_money' | 'set_thermostat' | 'control_lights' | 'lock_doors' | 'custom';
/**
 * Action status
 */
export type ActionStatus = 'pending_confirmation' | 'confirmed' | 'executing' | 'completed' | 'failed' | 'cancelled' | 'expired' | 'rolled_back';
/**
 * Action priority levels
 */
export type ActionPriority = 'low' | 'normal' | 'high' | 'critical';
/**
 * Uber ride action payload
 */
export interface UberRidePayload {
    startLatitude: number;
    startLongitude: number;
    startAddress?: string;
    endLatitude: number;
    endLongitude: number;
    endAddress?: string;
    productId?: string;
    fareId?: string;
    estimatedPrice?: number;
    estimatedDuration?: number;
    estimatedArrival?: number;
}
/**
 * Lyft ride types
 */
export type LyftRideType = 'lyft' | 'lyft_plus' | 'lyft_lux' | 'lyft_lux_suv' | 'lyft_shared';
/**
 * Lyft ride action payload
 */
export interface LyftRidePayload {
    startLatitude: number;
    startLongitude: number;
    startAddress?: string;
    endLatitude: number;
    endLongitude: number;
    endAddress?: string;
    rideType?: LyftRideType;
    estimatedPrice?: number;
    estimatedDuration?: number;
    primetime?: number;
}
/**
 * Grocery order action payload
 */
export interface GroceryOrderPayload {
    provider: 'instacart' | 'amazon_fresh' | 'walmart';
    storeId?: string;
    storeName?: string;
    items: Array<{
        name: string;
        quantity: number;
        unit?: string;
        productId?: string;
        price?: number;
    }>;
    deliveryAddress?: string;
    deliveryWindow?: {
        start: Date;
        end: Date;
    };
    estimatedTotal?: number;
    tip?: number;
    notes?: string;
}
/**
 * Email action payload
 */
export interface EmailPayload {
    to: string | string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    bodyHtml?: string;
    replyTo?: string;
    attachments?: Array<{
        filename: string;
        content: string;
        contentType: string;
    }>;
    scheduledFor?: Date;
}
/**
 * SMS action payload
 */
export interface SmsPayload {
    to: string;
    body: string;
    mediaUrls?: string[];
    scheduledFor?: Date;
}
/**
 * Calendar event action payload
 */
export interface CalendarEventPayload {
    title: string;
    description?: string;
    location?: string;
    startTime: Date;
    endTime: Date;
    attendees?: string[];
    reminders?: Array<{
        method: 'email' | 'popup';
        minutes: number;
    }>;
    calendarId?: string;
    eventId?: string;
}
/**
 * Generic custom action payload
 */
export interface CustomActionPayload {
    actionName: string;
    data: Record<string, unknown>;
}
/**
 * Union of all action payloads
 */
export type ActionPayload = UberRidePayload | LyftRidePayload | GroceryOrderPayload | EmailPayload | SmsPayload | CalendarEventPayload | CustomActionPayload;
/**
 * Core action structure
 */
export interface Action<T extends ActionPayload = ActionPayload> {
    /** Unique action ID */
    id: string;
    /** User who initiated the action */
    userId: string;
    /** Session where action was initiated */
    sessionId?: string;
    /** Type of action */
    type: ActionType;
    /** Current status */
    status: ActionStatus;
    /** Priority level */
    priority: ActionPriority;
    /** Action payload */
    payload: T;
    /** Human-readable description for confirmation */
    description: string;
    /** Confirmation message to show user */
    confirmationMessage: string;
    /** When the action was prepared */
    preparedAt: Date;
    /** When confirmation expires */
    expiresAt: Date;
    /** When the action was confirmed */
    confirmedAt?: Date;
    /** When execution started */
    executionStartedAt?: Date;
    /** When execution completed */
    completedAt?: Date;
    /** Result of the action */
    result?: ActionResult;
    /** Error if failed */
    error?: string;
    /** Related external IDs (e.g., Uber ride ID) */
    externalIds?: Record<string, string>;
    /** Metadata for tracking */
    metadata?: Record<string, unknown>;
    /** Persona that initiated the action */
    personaId?: string;
}
/**
 * Result of action execution
 */
export interface ActionResult {
    success: boolean;
    data?: unknown;
    message?: string;
    externalId?: string;
}
/**
 * Details needed for user confirmation
 */
export interface ActionConfirmationDetails {
    actionId: string;
    type: ActionType;
    description: string;
    confirmationMessage: string;
    expiresAt: Date;
    estimatedCost?: number;
    estimatedDuration?: string;
    warnings?: string[];
    canModify?: boolean;
}
/**
 * User's confirmation response
 */
export interface ActionConfirmation {
    actionId: string;
    confirmed: boolean;
    modifiedPayload?: Partial<ActionPayload>;
    confirmedAt: Date;
}
/**
 * Context passed to action executors
 */
export interface ActionExecutionContext {
    userId: string;
    sessionId?: string;
    personaId?: string;
    userTimezone?: string;
    integrationTokens?: Record<string, string>;
}
/**
 * Action executor function signature
 */
export type ActionExecutor<T extends ActionPayload = ActionPayload> = (action: Action<T>, context: ActionExecutionContext) => Promise<ActionResult>;
/**
 * Configuration for an action type
 */
export interface ActionTypeConfig {
    type: ActionType;
    name: string;
    description: string;
    /** Required integrations to execute this action */
    requiredIntegrations?: string[];
    /** Default expiry time in seconds */
    defaultExpirySeconds: number;
    /** Whether the action can be rolled back */
    canRollback: boolean;
    /** Executor function */
    executor: ActionExecutor;
    /** Rollback function (if canRollback) */
    rollback?: ActionExecutor;
    /** Prepare function to get estimates/validation */
    prepare?: (payload: ActionPayload, context: ActionExecutionContext) => Promise<{
        valid: boolean;
        error?: string;
        enrichedPayload?: ActionPayload;
        confirmationMessage: string;
        warnings?: string[];
        estimatedCost?: number;
    }>;
}
/**
 * Audit log entry for an action
 */
export interface ActionAuditEntry {
    actionId: string;
    timestamp: Date;
    event: 'created' | 'confirmed' | 'cancelled' | 'started' | 'completed' | 'failed' | 'rolled_back';
    previousStatus?: ActionStatus;
    newStatus: ActionStatus;
    userId: string;
    details?: Record<string, unknown>;
}
//# sourceMappingURL=action-types.d.ts.map