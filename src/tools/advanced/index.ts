/**
 * Advanced Tool Systems
 *
 * This module exports all advanced tool optimization systems:
 * - Dynamic loading based on conversation context
 * - A/B testing for tool configurations
 * - Semantic routing using embeddings
 * - Deprecation management
 * - Version tracking
 * - Tool lifecycle management
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
  PREDEFINED_EXPERIMENTS,
  abTestingService,
  type Experiment,
  type ExperimentAssignment,
  type ExperimentResults,
  type MetricDefinition,
  type MetricEvent,
  type VariantConfig,
} from '../ab-testing.js';

// Semantic Routing
export {
  SemanticToolRouter,
  semanticRouter,
  type RouterConfig,
  type SemanticMatch,
} from '../semantic-router.js';

// Deprecation Management
export {
  ToolDeprecationService,
  deprecationService,
  type DeprecationConfig,
  type DeprecationReason,
  type DeprecationRecord,
  type DeprecationStatus,
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

// Tool Lifecycle Management (NEW)
export {
  getBestToolForRequest,
  getDeprecationInfo,
  getLifecycleState,
  getSuggestedReplacement,
  getToolVariant,
  getToolVersion,
  initializeToolLifecycle,
  isLifecycleInitialized,
  isToolDeprecated,
  routeToolRequest,
  selectBestTool,
  shouldUseToolVariant,
  trackExperimentResult,
  trackToolExecution,
  registerToolVersion,
  type ExecutionContext,
  type ExecutionResult,
  type InitOptions,
} from './tool-lifecycle.js';
