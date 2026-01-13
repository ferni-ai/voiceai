/**
 * User Events Service
 *
 * Broadcasts real-time events to connected UI clients.
 * Used for voice-to-UI communication like theme changes, navigation, etc.
 *
 * Architecture:
 * - Voice tool calls broadcastUserEvent()
 * - Event published to Redis pub/sub (for multi-instance)
 * - WebSocket servers receive and forward to connected clients
 * - UI clients receive events and update accordingly
 *
 * @module services/user-events
 */
export type Theme = 'light' | 'dark' | 'auto';
export type UserEventType = 'theme_change' | 'show_view' | 'notification' | 'game_state' | 'persona_change' | 'subscription_update';
export interface UserEvent<T = unknown> {
    type: UserEventType;
    userId: string;
    data: T;
    timestamp: string;
    source: 'voice' | 'system' | 'api';
}
export interface ThemeChangeData {
    theme: Theme;
    source: 'voice' | 'system' | 'api';
}
export interface ShowViewData {
    view: string;
    params?: Record<string, unknown>;
}
/**
 * Registry of WebSocket broadcast functions.
 * WebSocket servers register their broadcast functions here.
 */
type BroadcastFn = (userId: string, eventType: string, data: unknown) => void;
/**
 * Register a WebSocket broadcast function.
 * Called by WebSocket servers on startup.
 */
export declare function registerUserEventBroadcast(fn: BroadcastFn): () => void;
/**
 * Broadcast a user event to all connected clients for that user.
 * Events are published to Redis for multi-instance support.
 */
export declare function broadcastUserEvent<T>(userId: string, eventType: UserEventType, data: T): Promise<void>;
/**
 * Persist theme preference to Firestore.
 */
export declare function persistThemePreference(userId: string, theme: Theme): Promise<void>;
/**
 * Get user's theme preference from Firestore.
 */
export declare function getThemePreference(userId: string): Promise<Theme>;
/**
 * Initialize Redis subscription for user events.
 * Call this on server startup.
 */
export declare function initUserEventsSubscription(): Promise<void>;
export {};
//# sourceMappingURL=index.d.ts.map