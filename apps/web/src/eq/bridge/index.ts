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
