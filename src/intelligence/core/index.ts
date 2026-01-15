/**
 * Core Intelligence Infrastructure
 *
 * Central orchestration and API for the intelligence layer.
 *
 * @module intelligence/core
 */

// Context Assembler - builds context windows
export * from './context-assembler.js';

// Context Service - manages context lifecycle
export * from './context-service.js';

// Batched LLM Analysis - efficient multi-signal analysis
export * from './batched-llm-analysis.js';

// Unified Intelligence API - single entry point
export * from './unified-intelligence-api.js';

// Voice Emotion Orchestrator - coordinates voice emotion systems
export * from './voice-emotion-orchestrator.js';

// Message Analyzer - comprehensive message analysis
export * from './message-analyzer.js';
