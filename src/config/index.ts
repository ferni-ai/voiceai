/**
 * Configuration Module
 *
 * Central configuration management for the Voice AI application.
 */

export {
  loadConfig,
  getConfig,
  resetConfig,
  validateConfig,
  printConfigSummary,
  detectEnvironment,
  isGoogleCloud,
  type AppConfig,
  type Environment,
} from './environment.js';

export { default } from './environment.js';
