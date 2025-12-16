/**
 * Progressive Features Service
 * 
 * Orchestrates all progressive relationship features:
 * - Stage Celebration Modal
 * - Trust Signal Cards
 * - Persona Introduction Flows
 * - Feature Discovery Hints
 * - Relationship Progress Indicator
 * 
 * Call `initProgressiveFeatures()` once during app initialization
 * to enable all these features.
 * 
 * PHILOSOPHY:
 * These features help users discover and engage with Ferni as their
 * relationship deepens. They're designed to be:
 * - Progressive: Features appear as they become relevant
 * - Non-intrusive: Can be dismissed, won't block usage
 * - Delightful: Celebrate milestones without being gamified
 * - Human: Use warm, relational language
 */

import { createLogger } from '../utils/logger.js';
import { relationshipStageService } from './relationship-stage.service.js';
import { initTeamUnlockService } from './team-unlock.service.js';

// UI Components
import { initStageCelebration } from '../ui/stage-celebration.ui.js';
import { initTrustSignals, trustSignalHelpers } from '../ui/trust-signals.ui.js';
import { initPersonaIntro } from '../ui/persona-intro.ui.js';
import { initFeatureHints } from '../ui/feature-hints.ui.js';
import { initProgressIndicator } from '../ui/progress-indicator.ui.js';

const log = createLogger('ProgressiveFeatures');

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize all progressive relationship features.
 * Call this once during app startup.
 */
export function initProgressiveFeatures(): void {
  if (isInitialized) {
    log.debug('Progressive features already initialized');
    return;
  }
  
  log.info('Initializing progressive relationship features...');
  
  try {
    // Initialize team unlock service first (other features depend on it)
    initTeamUnlockService();
    
    // Initialize UI components
    initStageCelebration();
    initTrustSignals();
    initPersonaIntro();
    initFeatureHints();
    initProgressIndicator();
    
    // Set up event listeners for backend trust signals
    setupTrustSignalBridge();
    
    isInitialized = true;
    log.info('Progressive features initialized successfully');
  } catch (error) {
    log.error('Failed to initialize progressive features:', error);
  }
}

/**
 * Manually record a conversation for relationship tracking.
 * Call this when a meaningful conversation ends.
 */
export function recordConversation(): void {
  const stageChange = relationshipStageService.recordConversation();
  if (stageChange) {
    log.info('Relationship stage advanced!', { 
      from: stageChange.previousStage, 
      to: stageChange.newStage 
    });
  }
}

/**
 * Check if progressive features are initialized.
 */
export function isProgressiveFeaturesInitialized(): boolean {
  return isInitialized;
}

// ============================================================================
// TRUST SIGNAL BRIDGE
// ============================================================================

/**
 * Set up bridge to receive trust signals from backend via LiveKit data messages.
 * 
 * Signal types from backend (trust-signal-emitter.ts):
 * - growth: Noticed personal growth
 * - boundary: Respecting a boundary  
 * - callback: Shared history reference
 * - small_win: Celebrating effort
 * - thinking_of_you: Proactive care
 * - reading_lines: Noticed unspoken emotion
 */
function setupTrustSignalBridge(): void {
  // Listen for backend trust signal events
  // These come through LiveKit data messages -> data-message-handlers.ts
  window.addEventListener('ferni:backend-trust-signal', ((event: CustomEvent) => {
    const signal = event.detail;
    
    // Map backend signal types to trustSignalHelpers methods
    // Backend uses short names (growth, boundary) while helpers use descriptive names
    switch (signal.type) {
      case 'growth':
        trustSignalHelpers.growthMoment(signal.message);
        break;
      case 'boundary':
        trustSignalHelpers.boundaryRespected(signal.message);
        break;
      case 'callback':
        trustSignalHelpers.sharedMemory(signal.message);
        break;
      case 'small_win':
        trustSignalHelpers.smallWin(signal.message);
        break;
      case 'thinking_of_you':
        trustSignalHelpers.thinkingOfYou(signal.message);
        break;
      case 'reading_lines':
        trustSignalHelpers.readingBetweenLines(signal.message);
        break;
      default:
        log.debug('Unknown trust signal type:', signal.type);
    }
  }) as EventListener);
}

// ============================================================================
// MANUAL TRIGGERS (for testing and dev panel)
// ============================================================================

/**
 * Manually trigger a trust signal (for dev/testing).
 */
export const triggerTrustSignal = trustSignalHelpers;

/**
 * Get current relationship info for display.
 */
export function getRelationshipInfo(): {
  stage: string;
  stageName: string;
  progress: number;
  conversations: number;
  daysTogether: number;
  streak: number;
} {
  const stage = relationshipStageService.getStage();
  const metrics = relationshipStageService.getMetrics();
  const progress = relationshipStageService.getProgressToNextStage();
  
  return {
    stage,
    stageName: relationshipStageService.getStageName(),
    progress: Math.round(progress.progress * 100),
    conversations: metrics.totalConversations,
    daysTogether: metrics.daysSinceFirstMeeting,
    streak: metrics.currentStreak,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const progressiveFeatures = {
  init: initProgressiveFeatures,
  recordConversation,
  isInitialized: isProgressiveFeaturesInitialized,
  getRelationshipInfo,
  trustSignal: triggerTrustSignal,
};

export default progressiveFeatures;

