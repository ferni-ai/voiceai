/**
 * Connection Heart UI - DEPRECATED
 *
 * This module has been replaced by the unified indicator system.
 * All functionality is now in unified-indicator.ui.ts.
 *
 * This file is kept for backward compatibility and re-exports
 * from the unified indicator.
 *
 * @module ui/connection-heart
 * @deprecated Use unified-indicator.ui.ts instead
 */

// Re-export from unified indicator for backward compatibility
export {
  initUnifiedIndicator as initConnectionHeart,
  disposeUnifiedIndicator as disposeConnectionHeart,
  getCurrentPriority as getConnectionState,
  unifiedIndicatorUI as connectionHeartUI,
} from './unified-indicator.ui.js';

export { default } from './unified-indicator.ui.js';
