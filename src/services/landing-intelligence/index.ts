/**
 * Landing Intelligence Services
 *
 * Gemini-powered real-time landing page optimization:
 * - Intent detection from visitor behavior
 * - Dynamic variant generation
 * - Time-aware content adaptation
 * - Returning visitor personalization
 * - Adaptive section ordering
 * - Proactive chat widget greetings
 *
 * @module services/landing-intelligence
 */

export {
  detectVisitorIntent,
  type BehaviorSignals,
  type VisitorIntent,
  type IntentDetectionResult,
} from './intent-detector.js';

export {
  generatePersonalizedVariant,
  generateHeadlineVariant,
  generateCTAVariant,
  type VariantGenerationContext,
  type GeneratedVariant,
} from './variant-generator.js';

export {
  getTimeAwareContent,
  getTimeMode,
  type TimeMode,
  type TimeAwareContent,
} from './time-aware.js';

export {
  getReturningVisitorContext,
  getReturningVisitorExperience,
  recordVisitorSession,
  generateVisitorId,
  type ReturningVisitorContext,
  type ReturningVisitorExperience,
} from './returning-visitor.js';

export {
  generateDemoConversation,
  type DemoMessage,
  type DemoConversation,
} from './demo-generator.js';

export {
  getOptimalSectionOrder,
  type LayoutOptimization,
  type SectionEmphasis,
} from './layout-optimizer.js';

export {
  generateChatGreeting,
  type ChatGreetingContext,
} from './chat-greeter.js';

export {
  optimizeLandingPage,
  type LandingOptimizationRequest,
  type LandingOptimizationResponse,
} from './orchestrator.js';

export { initLandingIntelligence, shutdownLandingIntelligence } from './lifecycle.js';

// Optimization Agent
export {
  collectLandingMetrics,
  generateOptimizationReport,
  runAutomatedOptimization,
  dailyOptimizationCheck,
  weeklyOptimizationReport,
  type OptimizationInsight,
  type ExperimentSuggestion,
  type LandingMetrics,
  type AgentReport,
  type AutomationConfig,
} from './optimization-agent.js';

