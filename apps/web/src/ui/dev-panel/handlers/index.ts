/**
 * Dev Panel Handlers
 *
 * Exports all action handlers used by the dev panel.
 * Split from dev-panel.ui.ts for maintainability.
 */

// Outreach testing handlers
export { handleOutreachAction } from './outreach.js';

// Avatar animation handlers
export {
  triggerLampAction,
  setLampEmotion,
  triggerWink,
  triggerCuriousTilt,
  triggerSecretSmile,
  triggerSleepy,
  triggerFerniExpression,
  clearFerniExpression,
  triggerExpression,
  getAvailableExpressions,
  cancelAllAvatarAnimations,
} from './avatar-animations.js';
