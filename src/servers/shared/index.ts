/**
 * Shared server utilities
 */

export * from './types.js';
export * from './cors.js';
export * from './encryption.js';

// Re-export DDoS protection from utils
export {
  hardenServer,
  handleHealthEndpoint,
  handleSecurityMonitoring,
  addRequestId,
  createOAuthStateManager,
  registerDDoSAlertCallback,
  startDDoSMonitoring,
  getClientIp,
} from '../../utils/ddos-protection.js';
