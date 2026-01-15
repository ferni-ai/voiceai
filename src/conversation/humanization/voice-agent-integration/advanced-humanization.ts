/**
 * Voice Agent Integration - Advanced Humanization Access
 *
 * @module @ferni/humanization/voice-agent-integration/advanced-humanization
 */

import { recordAdviceGiven, recordAgentResponse } from '../../advanced-humanization-integration.js';

import type { TurnGuidance, ResponseModification, HumanizationSessionState } from './types.js';
import { getSession } from './session-store.js';

/**
 * Get advanced humanization guidance from last processed turn
 */
export function getAdvancedGuidance(sessionId: string): TurnGuidance | null {
  const state = getSession(sessionId);
  if (!state || !state.isActive || !state.advancedHumanization.enabled) {
    return null;
  }
  return state.advancedHumanization.lastGuidance;
}

/**
 * Get response modifications from advanced humanization
 */
export function getAdvancedModifications(sessionId: string): ResponseModification | null {
  const state = getSession(sessionId);
  if (!state || !state.isActive || !state.advancedHumanization.enabled) {
    return null;
  }
  return state.advancedHumanization.lastModifications;
}

/**
 * Record that agent gave advice (for resistance tracking)
 */
export function recordAdvice(sessionId: string): void {
  const state = getSession(sessionId);
  if (!state || !state.isActive || !state.advancedHumanization.enabled) {
    return;
  }
  recordAdviceGiven(sessionId);
}

/**
 * Record agent response (for repair detection on next turn)
 */
export function recordResponse(sessionId: string, response: string): void {
  const state = getSession(sessionId);
  if (!state || !state.isActive || !state.advancedHumanization.enabled) {
    return;
  }
  recordAgentResponse(sessionId, response);
}

/**
 * Check if we should stop giving direct advice
 */
export function shouldStopAdvice(sessionId: string): boolean {
  const state = getSession(sessionId);
  if (!state || !state.isActive || !state.advancedHumanization.enabled) {
    return false;
  }
  return state.advancedHumanization.lastGuidance?.stopDirectAdvice ?? false;
}

/**
 * Get system prompt additions from advanced humanization
 */
export function getAdvancedSystemPromptAdditions(sessionId: string): string[] {
  const mods = getAdvancedModifications(sessionId);
  return mods?.systemPromptAdditions ?? [];
}
