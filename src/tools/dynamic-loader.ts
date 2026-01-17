/**
 * Dynamic Tool Loader - Re-export Shim
 *
 * This file re-exports from the new modular location for backward compatibility.
 * Import from './dynamic-loader/index.js' instead for new code.
 *
 * @deprecated Import from './dynamic-loader/index.js' instead
 */

export {
  // Class and singleton
  DynamicToolLoader,
  dynamicToolLoader,
  // Types
  type DynamicLoaderConfig,
  type DynamicLoaderStatus,
  type LoadedDomainState,
  type TopicDetectionResult,
  // Mappings
  TOPIC_TO_DOMAINS,
  DOMAIN_PRIORITY,
  DEFAULT_ESSENTIAL_DOMAINS,
} from './dynamic-loader/index.js';

// Default export for backward compatibility
export { dynamicToolLoader as default } from './dynamic-loader/index.js';
