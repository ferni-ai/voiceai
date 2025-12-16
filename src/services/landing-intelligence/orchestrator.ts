/**
 * Landing Intelligence Orchestrator
 *
 * Main entry point that combines all landing intelligence services
 * into a single optimized response.
 *
 * @module services/landing-intelligence/orchestrator
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { ExperimentPattern } from '../experiments/hypothesis-generator.js';
import { analyzeWinningPatterns } from '../experiments/hypothesis-generator.js';
import {
  generateChatGreeting,
  getGreetingTiming,
  type ChatGreetingContext,
} from './chat-greeter.js';
import { generateDemoConversation, type DemoConversation } from './demo-generator.js';
import {
  detectVisitorIntent,
  type BehaviorSignals,
  type VisitorIntent,
} from './intent-detector.js';
import {
  getOptimalSectionOrder,
  optimizeForMobile,
  type LayoutOptimization,
} from './layout-optimizer.js';
import {
  getReturningVisitorContext,
  getReturningVisitorExperience,
  type ReturningVisitorExperience,
} from './returning-visitor.js';
import {
  getTimeAwareContentWithOccasions,
  getTimeMode,
  type TimeAwareContent,
  type TimeMode,
} from './time-aware.js';
import {
  generatePersonalizedVariant,
  type GeneratedVariant,
  type VariantGenerationContext,
} from './variant-generator.js';

const log = createLogger({ module: 'LandingOrchestrator' });

// ============================================================================
// TYPES
// ============================================================================

export interface LandingOptimizationRequest {
  /** Visitor ID (for returning visitor detection) */
  visitorId?: string;

  /** Behavior signals from frontend */
  behaviorSignals?: BehaviorSignals;

  /** Device type */
  device?: 'mobile' | 'tablet' | 'desktop';

  /** Current section being viewed */
  currentSection?: string;

  /** Hour of day (0-23) */
  hour?: number;

  /** Request specific components */
  include?: {
    variant?: boolean;
    layout?: boolean;
    demo?: boolean;
    chatGreeting?: boolean;
    timeContent?: boolean;
    returningExperience?: boolean;
  };
}

export interface LandingOptimizationResponse {
  /** Unique response ID */
  responseId: string;

  /** Processing time in ms */
  processingTime: number;

  /** Detected visitor intent */
  intent?: VisitorIntent;

  /** Time-aware content */
  timeContent?: TimeAwareContent;

  /** Returning visitor experience */
  returningExperience?: ReturningVisitorExperience;

  /** Generated variant */
  variant?: GeneratedVariant;

  /** Layout optimization */
  layout?: LayoutOptimization;

  /** Demo conversation */
  demo?: DemoConversation;

  /** Chat widget greeting */
  chatGreeting?: {
    message: string;
    timing: {
      shouldShow: boolean;
      delay: number;
    };
  };

  /** Metadata */
  meta: {
    timeMode: TimeMode;
    isReturning: boolean;
    visitCount: number;
    patternsUsed: number;
  };
}

// ============================================================================
// CACHED DATA
// ============================================================================

let cachedPatterns: ExperimentPattern[] = [];
let patternsCacheTime = 0;
const PATTERNS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getWinningPatterns(): Promise<ExperimentPattern[]> {
  const now = Date.now();

  if (cachedPatterns.length > 0 && now - patternsCacheTime < PATTERNS_CACHE_TTL) {
    return cachedPatterns;
  }

  try {
    cachedPatterns = await analyzeWinningPatterns();
    patternsCacheTime = now;
    log.info({ patternCount: cachedPatterns.length }, 'Winning patterns refreshed');
  } catch (error) {
    log.warn({ error }, 'Failed to refresh winning patterns');
  }

  return cachedPatterns;
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

export async function optimizeLandingPage(
  request: LandingOptimizationRequest
): Promise<LandingOptimizationResponse> {
  const startTime = Date.now();
  const responseId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  log.info({ responseId, visitorId: request.visitorId }, 'Starting landing optimization');

  // Default includes - all true if not specified
  const include = request.include || {
    variant: true,
    layout: true,
    demo: true,
    chatGreeting: true,
    timeContent: true,
    returningExperience: true,
  };

  // Get time mode
  const timeMode = getTimeMode(request.hour);

  // Start parallel operations
  const operations: Promise<unknown>[] = [];
  const results: Partial<LandingOptimizationResponse> = {};

  // 1. Time-aware content (fast, no API call)
  if (include.timeContent) {
    results.timeContent = getTimeAwareContentWithOccasions(request.hour);
  }

  // 2. Returning visitor context
  let returningContext = null;
  let isReturning = false;
  let visitCount = 1;

  if (request.visitorId) {
    operations.push(
      getReturningVisitorContext(request.visitorId).then((ctx) => {
        returningContext = ctx;
        isReturning = !!ctx && ctx.visitCount > 1;
        visitCount = ctx?.visitCount || 1;
      })
    );
  }

  // 3. Intent detection (if we have behavior signals)
  let intent: VisitorIntent | undefined;
  if (request.behaviorSignals) {
    operations.push(
      detectVisitorIntent(request.behaviorSignals).then((result) => {
        intent = result.intent;
        results.intent = intent;
      })
    );
  }

  // Wait for context operations
  await Promise.all(operations);

  // Now we can do context-dependent operations
  const contextOperations: Promise<unknown>[] = [];

  // 4. Returning visitor experience
  if (include.returningExperience && returningContext) {
    contextOperations.push(
      getReturningVisitorExperience(returningContext).then((exp) => {
        results.returningExperience = exp;
      })
    );
  }

  // 5. Layout optimization
  if (include.layout) {
    const layoutPromise = getOptimalSectionOrder({
      intent,
      timeMode,
      device: request.device,
      isReturning,
      visitCount,
    }).then((layout) => {
      // Optimize for mobile if needed
      if (request.device === 'mobile') {
        results.layout = optimizeForMobile(layout);
      } else {
        results.layout = layout;
      }
    });
    contextOperations.push(layoutPromise);
  }

  // 6. Variant generation
  if (include.variant) {
    const patterns = await getWinningPatterns();

    const variantContext: VariantGenerationContext = {
      winningPatterns: patterns,
      visitorIntent: intent,
      timeMode,
      device: request.device,
      isReturning,
    };

    contextOperations.push(
      generatePersonalizedVariant(variantContext).then((variant) => {
        results.variant = variant || undefined;
      })
    );
  }

  // 7. Demo conversation
  if (include.demo) {
    contextOperations.push(
      generateDemoConversation(intent?.primaryConcern).then((demo) => {
        results.demo = demo;
      })
    );
  }

  // 8. Chat greeting
  if (include.chatGreeting && request.currentSection) {
    const greetingContext: ChatGreetingContext = {
      currentSection: request.currentSection,
      timeOnPage: request.behaviorSignals?.timeOnPage || 0,
      scrollDepth: request.behaviorSignals?.scrollDepth || 0,
      timeMode,
      intent,
      isReturning,
      visitCount,
      ctaHesitation: request.behaviorSignals?.ctaHoverWithoutClick,
    };

    const timing = getGreetingTiming(greetingContext);

    if (timing.shouldShow) {
      contextOperations.push(
        generateChatGreeting(greetingContext).then((message) => {
          results.chatGreeting = {
            message,
            timing: {
              shouldShow: timing.shouldShow,
              delay: timing.delay,
            },
          };
        })
      );
    } else {
      results.chatGreeting = {
        message: '',
        timing: {
          shouldShow: false,
          delay: 0,
        },
      };
    }
  }

  // Wait for all operations
  await Promise.all(contextOperations);

  const processingTime = Date.now() - startTime;

  log.info(
    {
      responseId,
      processingTime,
      hasVariant: !!results.variant,
      hasLayout: !!results.layout,
      hasDemo: !!results.demo,
      isReturning,
    },
    'Landing optimization complete'
  );

  return {
    responseId,
    processingTime,
    ...results,
    meta: {
      timeMode,
      isReturning,
      visitCount,
      patternsUsed: cachedPatterns.length,
    },
  } as LandingOptimizationResponse;
}

// ============================================================================
// LIGHTWEIGHT OPERATIONS (for real-time updates)
// ============================================================================

export async function getQuickOptimization(
  section: string,
  timeOnPage: number,
  scrollDepth: number
): Promise<{
  chatGreeting?: string;
  shouldShowChat: boolean;
  delay: number;
}> {
  const timeMode = getTimeMode();

  const context: ChatGreetingContext = {
    currentSection: section,
    timeOnPage,
    scrollDepth,
    timeMode,
  };

  const timing = getGreetingTiming(context);

  if (!timing.shouldShow) {
    return {
      shouldShowChat: false,
      delay: 0,
    };
  }

  const greeting = await generateChatGreeting(context);

  return {
    chatGreeting: greeting,
    shouldShowChat: true,
    delay: timing.delay,
  };
}
