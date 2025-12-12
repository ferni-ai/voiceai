/**
 * Performance Optimizations
 *
 * Centralized performance optimization utilities for the voice agent.
 * Implements 6 key optimizations:
 *
 * 1. Parallel Context Building - Run independent builders concurrently
 * 2. Connection Pooling - Optimize Firestore connections for high load
 * 3. Response Streaming - Begin TTS before full response generated
 * 4. Edge Caching - Cache common persona bundles at edge
 * 5. WebSocket Keep-Alive - Reduce reconnection overhead
 * 6. Batch Analytics - Group non-critical writes for efficiency
 *
 * @module performance
 */

export * from './batch-analytics.js';
export * from './edge-cache.js';
export * from './firestore-pool.js';
export * from './parallel-executor.js';
export * from './response-streaming.js';
export * from './websocket-keepalive.js';
