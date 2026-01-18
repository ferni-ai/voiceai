/**
 * EQ Bridge - Index
 *
 * Exports humanization bridge functionality.
 *
 * @module @ferni/eq/bridge
 */

export {
  handleBetterThanHumanSignal,
  handleBehaviorModeShift,
  handleBehaviorExpression,
  handleBehaviorHoldSpace,
  handleBehaviorProcessing,
  initBetterThanHumanSignalHandlers,
  initBehaviorSignalHandlers,
  disposeSignalHandlers,
  setAvatarContainer as setBridgeAvatarContainer,
} from './humanization-bridge.js';

// BTH hint listener - displays subtle UI hints for superhuman observations
export {
  initBthHintListener,
  disposeBthHintListener,
  showBthHint,
  resetBthHintRateLimits,
} from './bth-hint-listener.js';
