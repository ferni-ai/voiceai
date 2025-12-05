/**
 * Advanced Tool Systems
 *
 * This module exports all advanced tool optimization systems:
 * - Dynamic loading based on conversation context
 * - A/B testing for tool configurations
 * - Semantic routing using embeddings
 * - Deprecation management
 * - Version tracking
 */

// Dynamic Tool Loading
export {
  DynamicToolLoader,
  dynamicToolLoader,
  type DynamicLoaderConfig,
  type LoadedDomainState,
  type TopicDetectionResult,
} from '../dynamic-loader.js';

// A/B Testing
export {
  ABTestingService,
  abTestingService,
  PREDEFINED_EXPERIMENTS,
  type Experiment,
  type VariantConfig,
  type MetricDefinition,
  type ExperimentAssignment,
  type MetricEvent,
  type ExperimentResults,
} from '../ab-testing.js';

// Semantic Routing
export {
  SemanticToolRouter,
  semanticRouter,
  type SemanticMatch,
  type RouterConfig,
} from '../semantic-router.js';

// Deprecation Management
export {
  ToolDeprecationService,
  deprecationService,
  type DeprecationRecord,
  type DeprecationStatus,
  type DeprecationReason,
  type DeprecationConfig,
} from '../deprecation.js';

// Versioning
export {
  ToolVersioningService,
  versioningService,
  type ToolVersion,
  type VersionChange,
  type VersionComparison,
  type VersioningConfig,
} from '../versioning.js';

