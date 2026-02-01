/**
 * Associative Cortex Module
 *
 * Provides human-like associative memory through graph-based
 * spreading activation and pattern discovery.
 *
 * @module memory/associative-cortex
 */

// Types
export type {
  ActivationNode,
  ActivationPath,
  ActivatedMemorySet,
  ActivationConfig,
  MemoryLink,
  MemoryGraph,
  DiscoveredConnection,
  ConnectionType,
  DiscoveryConfig,
  NarrativeArc,
  NarrativeType,
  KeyMoment,
  EmotionalTrajectory,
  AssociativeCortex,
} from './types.js';

export { DEFAULT_ACTIVATION_CONFIG, DEFAULT_DISCOVERY_CONFIG } from './types.js';

// Core
export {
  AssociativeCortexImpl,
  getAssociativeCortex,
  resetAssociativeCortex,
} from './cortex.js';

// Activation
export {
  spreadActivation,
  activateFromSeed,
  findAssociations,
  calculateAssociationStrength,
  findActivationPath,
  DEFAULT_LINK_WEIGHTS,
} from './activation/spreading-activation.js';

// Graph
export {
  LinkDetector,
  getLinkDetector,
  resetLinkDetector,
  type LinkDetectionResult,
  type LinkSignal,
  type LinkDetectionConfig,
  DEFAULT_LINK_DETECTION_CONFIG,
} from './graph/link-detector.js';

// Discovery
export {
  ConnectionFinder,
  getConnectionFinder,
  resetConnectionFinder,
} from './discovery/connection-finder.js';

export {
  NarrativeBuilder,
  getNarrativeBuilder,
  resetNarrativeBuilder,
  type NarrativeBuilderConfig,
} from './discovery/narrative-builder.js';
