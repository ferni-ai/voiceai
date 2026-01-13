/**
 * Cognitive WebSocket Server
 *
 * Provides real-time WebSocket streaming of cognitive state updates.
 * Connects to the CognitiveBroadcast service and streams events to clients.
 *
 * Usage:
 * - Client connects to ws://localhost:8080/ws/cognitive
 * - Server streams cognitive events as JSON
 * - Client can send ping messages to keep connection alive
 */
import { WebSocketServer } from 'ws';
import type { Server } from 'node:http';
/**
 * Initialize WebSocket server for cognitive streaming
 */
export declare function initCognitiveWebSocket(httpServer: Server): WebSocketServer;
/**
 * Shutdown cognitive WebSocket service
 * Clears heartbeat interval and disconnects all clients
 */
export declare function shutdownCognitiveWebSocket(): void;
/**
 * Get current connected client count
 */
export declare function getConnectedClientCount(): number;
/**
 * Broadcast a message to all connected clients
 */
export declare function broadcastToClients(message: unknown): void;
declare const _default: {
    initCognitiveWebSocket: typeof initCognitiveWebSocket;
    getConnectedClientCount: typeof getConnectedClientCount;
    broadcastToClients: typeof broadcastToClients;
};
export default _default;
//# sourceMappingURL=cognitive-websocket.d.ts.map