/**
 * Inbound Message Router
 *
 * Routes incoming messages (SMS replies, push taps, call-backs) to the
 * appropriate agent. This ensures bidirectional continuity - if Maya
 * sent an SMS about habits, the user's reply goes to Maya, not Ferni.
 *
 * Routing logic:
 * 1. If replying to recent outreach → same agent
 * 2. If active thread exists → thread owner
 * 3. If intent detected → specialized agent
 * 4. Default → Ferni (coordinator)
 *
 * @module services/conversation-thread/inbound-router
 */
import type { PersonaId } from '../../personas/types.js';
import type { EngagementChannel, InboundRouteDecision } from './types.js';
/**
 * Route an inbound message to the appropriate agent.
 */
export declare function routeInbound(userId: string, channel: EngagementChannel, content: string, options?: {
    /** If we know this is a reply to a specific outreach */
    outreachId?: string;
    /** Phone number (for SMS routing) */
    fromPhone?: string;
}): Promise<InboundRouteDecision>;
/**
 * Detect intent from message content for routing.
 */
declare function detectIntentRoute(content: string): {
    agentId: PersonaId;
    confidence: number;
} | null;
/**
 * Handle inbound SMS reply.
 * Call this from Twilio webhook.
 */
export declare function handleInboundSMS(userId: string, fromPhone: string, body: string): Promise<{
    routeDecision: InboundRouteDecision;
    shouldInitiateCall: boolean;
    responseMessage?: string;
}>;
/**
 * Handle push notification tap.
 * Call this when user taps notification in app.
 */
export declare function handlePushTap(userId: string, notificationData: {
    outreachId?: string;
    agentId?: PersonaId;
    action?: 'open' | 'call' | 'reply';
}): Promise<InboundRouteDecision>;
/**
 * Handle voice call initiation.
 * Call this when user starts a voice call from app.
 */
export declare function handleVoiceCallStart(userId: string, options?: {
    requestedAgentId?: PersonaId;
    fromNotification?: boolean;
    outreachId?: string;
}): Promise<InboundRouteDecision>;
export declare const inboundRouter: {
    routeInbound: typeof routeInbound;
    handleInboundSMS: typeof handleInboundSMS;
    handlePushTap: typeof handlePushTap;
    handleVoiceCallStart: typeof handleVoiceCallStart;
    detectIntentRoute: typeof detectIntentRoute;
};
export {};
//# sourceMappingURL=inbound-router.d.ts.map