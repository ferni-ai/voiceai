/**
 * Behavior Signal Service
 *
 * Handles behavior signals from the backend bidirectional behavior system.
 * These signals change HOW Ferni appears (avatar, waveform) based on
 * behavioral mode changes.
 *
 * Signal types:
 * - mode_shift: Ferni changed presence mode
 * - pacing_change: Speech rhythm changed
 * - expression: Non-verbal presence expression
 * - hold_space: Intentional meaningful silence
 * - processing_start: Started visible processing
 * - processing_end: Finished processing
 *
 * @module BehaviorSignalService
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('BehaviorSignalService');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Behavior signal types from backend
 */
export type BehaviorSignalType =
  | 'mode_shift'
  | 'pacing_change'
  | 'expression'
  | 'hold_space'
  | 'processing_start'
  | 'processing_end';

/**
 * Behavior modes from backend
 */
export type BehaviorMode =
  | 'presence'
  | 'deep_listening'
  | 'processing'
  | 'celebration'
  | 'holding_space'
  | 'energy_match'
  | 'grounding';

/**
 * Pacing speed options
 */
export type PacingSpeed = 'slower' | 'normal' | 'faster';

/**
 * Behavior signal payload from backend
 */
export interface BehaviorSignal {
  type: BehaviorSignalType;
  mode?: BehaviorMode;
  pacing?: PacingSpeed;
  duration?: number;
  expression?: string;
  reason?: string;
  timestamp: number;
}

/**
 * Data message shape for behavior signals
 */
export interface BehaviorSignalMessage {
  type: 'behavior_signal';
  mode?: string;
  pacing?: string;
  duration?: number;
  expression?: string;
  reason?: string;
  timestamp?: number;
  // The actual signal type is nested
  signalType?: BehaviorSignalType;
}

// ============================================================================
// STATE
// ============================================================================

/** Current behavior mode */
let currentMode: BehaviorMode = 'presence';

/** Current pacing */
let currentPacing: PacingSpeed = 'normal';

/** Whether currently in processing state */
let isProcessing = false;

/** Whether currently holding space */
let isHoldingSpace = false;

// ============================================================================
// EVENT DISPATCHING
// ============================================================================

/**
 * Dispatch behavior mode change event
 */
function dispatchModeChange(mode: BehaviorMode, reason?: string): void {
  const event = new CustomEvent('ferni:behavior-mode-change', {
    detail: { mode, reason, previousMode: currentMode },
  });
  window.dispatchEvent(event);
  currentMode = mode;
  log.debug('Mode changed:', { mode, reason });
}

/**
 * Dispatch pacing change event
 */
function dispatchPacingChange(pacing: PacingSpeed, reason?: string): void {
  const event = new CustomEvent('ferni:behavior-pacing-change', {
    detail: { pacing, reason, previousPacing: currentPacing },
  });
  window.dispatchEvent(event);
  currentPacing = pacing;
  log.debug('Pacing changed:', { pacing, reason });
}

/**
 * Dispatch expression event
 */
function dispatchExpression(expression: string): void {
  const event = new CustomEvent('ferni:behavior-expression', {
    detail: { expression },
  });
  window.dispatchEvent(event);
  log.debug('Expression triggered:', { expression });
}

/**
 * Dispatch hold space event
 */
function dispatchHoldSpace(duration: number, reason?: string): void {
  const event = new CustomEvent('ferni:behavior-hold-space', {
    detail: { duration, reason },
  });
  window.dispatchEvent(event);
  isHoldingSpace = true;

  // Auto-clear after duration
  setTimeout(() => {
    isHoldingSpace = false;
    const endEvent = new CustomEvent('ferni:behavior-hold-space-end', {
      detail: { duration },
    });
    window.dispatchEvent(endEvent);
  }, duration);

  log.debug('Holding space:', { duration, reason });
}

/**
 * Dispatch processing state change
 */
function dispatchProcessingChange(started: boolean, expression?: string): void {
  const eventName = started ? 'ferni:behavior-processing-start' : 'ferni:behavior-processing-end';
  const event = new CustomEvent(eventName, {
    detail: { expression },
  });
  window.dispatchEvent(event);
  isProcessing = started;
  log.debug('Processing:', { started, expression });
}

// ============================================================================
// MESSAGE PROCESSING
// ============================================================================

/**
 * Check if a data message is a behavior signal
 */
export function isBehaviorSignalMessage(message: unknown): message is BehaviorSignalMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    (message as { type: string }).type === 'behavior_signal'
  );
}

/**
 * Process a behavior signal message from the backend
 */
export function processBehaviorSignal(message: BehaviorSignalMessage): boolean {
  // Extract signal type - could be in 'signalType' or nested
  const signalType = message.signalType || (message as { type: string }).type;

  // If type is just 'behavior_signal', look for the actual signal type
  if (signalType === 'behavior_signal') {
    // This is the wrapper - the actual data is in the message fields
    if (message.mode) {
      handleModeShift(message.mode as BehaviorMode, message.reason);
      return true;
    }
    if (message.pacing) {
      handlePacingChange(message.pacing as PacingSpeed, message.reason);
      return true;
    }
    if (message.duration && message.reason) {
      handleHoldSpace(message.duration, message.reason);
      return true;
    }
    if (message.expression) {
      handleExpression(message.expression);
      return true;
    }
    return false;
  }

  switch (signalType) {
    case 'mode_shift':
      if (message.mode) {
        handleModeShift(message.mode as BehaviorMode, message.reason);
      }
      return true;

    case 'pacing_change':
      if (message.pacing) {
        handlePacingChange(message.pacing as PacingSpeed, message.reason);
      }
      return true;

    case 'expression':
      if (message.expression) {
        handleExpression(message.expression);
      }
      return true;

    case 'hold_space':
      if (message.duration) {
        handleHoldSpace(message.duration, message.reason);
      }
      return true;

    case 'processing_start':
      handleProcessingStart(message.expression);
      return true;

    case 'processing_end':
      handleProcessingEnd();
      return true;

    default:
      log.debug('Unknown behavior signal type:', signalType);
      return false;
  }
}

// ============================================================================
// SIGNAL HANDLERS
// ============================================================================

function handleModeShift(mode: BehaviorMode, reason?: string): void {
  dispatchModeChange(mode, reason);

  // Also dispatch to Ferni EQ system
  const eqEvent = new CustomEvent('ferni:eq-mode-shift', {
    detail: { mode, reason },
  });
  window.dispatchEvent(eqEvent);
}

function handlePacingChange(pacing: PacingSpeed, reason?: string): void {
  dispatchPacingChange(pacing, reason);
}

function handleExpression(expression: string): void {
  dispatchExpression(expression);

  // Trigger avatar expression via EQ system
  const eqEvent = new CustomEvent('ferni:eq-expression', {
    detail: { expression },
  });
  window.dispatchEvent(eqEvent);
}

function handleHoldSpace(duration: number, reason?: string): void {
  dispatchHoldSpace(duration, reason);

  // Notify avatar to enter "holding space" state
  const eqEvent = new CustomEvent('ferni:eq-hold-space', {
    detail: { duration, reason },
  });
  window.dispatchEvent(eqEvent);
}

function handleProcessingStart(expression?: string): void {
  dispatchProcessingChange(true, expression);

  // Notify avatar to show thinking
  const eqEvent = new CustomEvent('ferni:eq-processing', {
    detail: { started: true, expression },
  });
  window.dispatchEvent(eqEvent);
}

function handleProcessingEnd(): void {
  dispatchProcessingChange(false);

  // Notify avatar to stop thinking
  const eqEvent = new CustomEvent('ferni:eq-processing', {
    detail: { started: false },
  });
  window.dispatchEvent(eqEvent);
}

// ============================================================================
// GETTERS
// ============================================================================

/**
 * Get current behavior mode
 */
export function getCurrentMode(): BehaviorMode {
  return currentMode;
}

/**
 * Get current pacing
 */
export function getCurrentPacing(): PacingSpeed {
  return currentPacing;
}

/**
 * Check if currently processing
 */
export function getIsProcessing(): boolean {
  return isProcessing;
}

/**
 * Check if currently holding space
 */
export function getIsHoldingSpace(): boolean {
  return isHoldingSpace;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const behaviorSignalService = {
  isBehaviorSignalMessage,
  processBehaviorSignal,
  getCurrentMode,
  getCurrentPacing,
  getIsProcessing,
  getIsHoldingSpace,
};

export default behaviorSignalService;

