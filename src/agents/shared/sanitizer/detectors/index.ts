/**
 * Detectors Module
 *
 * Exports leakage detection and pattern loading utilities.
 *
 * @module agents/shared/sanitizer/detectors
 */

// Pattern loading
export {
  getAllToolPatterns,
  getParamPatterns,
  getTeamMemberNames,
  getSlowTools,
  getDomainPatterns,
  isDomainCritical,
  getDomainNames,
  findDomainForPattern,
  getToolPatternsConfig,
  clearPatternsCache,
} from './patterns-loader.js';

// Leakage detection
export {
  detectsFunctionCallLeakage,
  getReplacementText,
  looksLikeJsonFunctionCall,
} from './leakage-detector.js';
