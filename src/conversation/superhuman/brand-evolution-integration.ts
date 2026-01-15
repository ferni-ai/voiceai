/**
 * Brand Evolution Integration
 * 
 * Central integration point for all brand evolution features.
 * This module coordinates the various brand systems and provides
 * a unified interface for the voice agent.
 * 
 * Features integrated:
 * - Brand Secrets (easter eggs, milestones, achievements)
 * - Late Night Warmth (2am mode)
 * - Memory Callbacks (signature moment)
 * - Reflection Sunday
 * - Growth Letter
 * 
 * @module conversation/superhuman/brand-evolution-integration
 */

import { createLogger } from '../../utils/safe-logger.js';

// Import all brand evolution modules
import brandSecrets, {
  checkBrandSecrets,
  checkAchievements,
  formatSecretForPrompt,
  formatAchievementForPrompt,
  resetSessionSecrets,
  type SecretContext,
  type SecretResult,
  type Achievement,
} from './brand-secrets.js';

import lateNightWarmth, {
  getLateNightContext,
  getLateNightGreeting,
  getLateNightBehaviors,
  formatLateNightContextForPrompt,
  shouldAnnounceLateNightMode,
  markLateNightModeAnnounced,
  resetLateNightState,
  type LateNightContext,
  type LateNightGreeting,
} from './late-night-warmth.js';

import memoryCallbacks, {
  generateMemoryCallback,
  formatMemoryCallbackForPrompt,
  storeQuote,
  storePattern,
  storeMilestone,
  storeRelationship,
  storeDream,
  type MemoryCallback,
} from './memory-callbacks.js';

const log = createLogger({ module: 'BrandEvolutionIntegration' });

// ============================================================================
// TYPES
// ============================================================================

export interface BrandEvolutionContext {
  userId: string;
  conversationCount: number;
  firstConversationDate?: Date;
  totalMinutesTalked?: number;
  currentStreak?: number;
  userMessage?: string;
  personaId?: string;
  localTime?: Date;
}

export interface BrandEvolutionResult {
  // Injections for the prompt
  promptInjections: string[];
  
  // Special modes
  lateNightMode: LateNightContext | null;
  
  // Triggered features
  secret: SecretResult | null;
  achievement: Achievement | null;
  memoryCallback: MemoryCallback | null;
  lateNightGreeting: LateNightGreeting | null;
  
  // Behavior modifications
  behaviorModifications: {
    slowerPacing: boolean;
    softerTone: boolean;
    avoidProductivity: boolean;
    emphasizeListening: boolean;
  };
}

// ============================================================================
// SESSION STATE
// ============================================================================

let sessionInitialized = false;

/**
 * Initialize brand evolution systems for a new session
 */
export function initializeBrandEvolutionSession(): void {
  resetSessionSecrets();
  resetLateNightState();
  sessionInitialized = true;
  log.info('🌟 Brand evolution session initialized');
}

/**
 * Reset all brand evolution state
 */
export function resetBrandEvolutionSession(): void {
  resetSessionSecrets();
  resetLateNightState();
  sessionInitialized = false;
}

// ============================================================================
// MAIN INTEGRATION FUNCTION
// ============================================================================

/**
 * Process all brand evolution features for a conversation turn
 * 
 * This is the main entry point called from the turn handler.
 * It checks all brand evolution systems and returns any
 * prompt injections or behavior modifications.
 */
export function processBrandEvolution(
  context: BrandEvolutionContext
): BrandEvolutionResult {
  // Ensure session is initialized
  if (!sessionInitialized) {
    initializeBrandEvolutionSession();
  }
  
  const localTime = context.localTime ?? new Date();
  const promptInjections: string[] = [];
  
  // 1. Check late night mode
  const lateNightMode = getLateNightContext(localTime);
  let lateNightGreeting: LateNightGreeting | null = null;
  
  if (lateNightMode.isLateNight) {
    const lateNightPrompt = formatLateNightContextForPrompt(lateNightMode);
    if (lateNightPrompt) {
      promptInjections.push(lateNightPrompt);
    }
    
    if (shouldAnnounceLateNightMode(lateNightMode)) {
      lateNightGreeting = getLateNightGreeting(lateNightMode);
      markLateNightModeAnnounced();
    }
  }
  
  // 2. Check brand secrets
  const secretContext: SecretContext = {
    userId: context.userId,
    conversationCount: context.conversationCount,
    firstConversationDate: context.firstConversationDate,
    totalMinutesTalked: context.totalMinutesTalked,
    currentStreak: context.currentStreak,
    userMessage: context.userMessage,
    personaId: context.personaId,
    localTime,
  };
  
  const secret = checkBrandSecrets(secretContext);
  if (secret.triggered && secret.secret) {
    promptInjections.push(formatSecretForPrompt(secret.secret));
  }
  
  // 3. Check achievements
  const achievement = checkAchievements(secretContext);
  if (achievement) {
    promptInjections.push(formatAchievementForPrompt(achievement));
  }
  
  // 4. Check memory callbacks (15% chance, rate-limited)
  const memoryCallback = generateMemoryCallback(context.userId, context.userMessage ?? '');
  if (memoryCallback) {
    promptInjections.push(formatMemoryCallbackForPrompt(memoryCallback));
  }
  
  // 5. Get behavior modifications
  const lateNightBehaviors = getLateNightBehaviors(lateNightMode);
  const behaviorModifications = {
    slowerPacing: lateNightBehaviors.slowerPacing,
    softerTone: lateNightBehaviors.softerTone,
    avoidProductivity: lateNightBehaviors.avoidProductivity,
    emphasizeListening: lateNightBehaviors.emphasizeListening,
  };
  
  // Log what was triggered
  if (promptInjections.length > 0) {
    log.info(
      {
        userId: context.userId,
        injectionCount: promptInjections.length,
        lateNight: lateNightMode.isLateNight,
        secretTriggered: secret.triggered,
        achievementUnlocked: !!achievement,
        memoryCallbackGenerated: !!memoryCallback,
      },
      '🌟 Brand evolution features activated'
    );
  }
  
  return {
    promptInjections,
    lateNightMode: lateNightMode.isLateNight ? lateNightMode : null,
    secret: secret.triggered ? secret : null,
    achievement,
    memoryCallback,
    lateNightGreeting,
    behaviorModifications,
  };
}

// ============================================================================
// MEMORY CAPTURE HELPERS
// ============================================================================

/**
 * Capture a memorable quote from user for future callbacks
 */
export function captureMemorableQuote(
  userId: string,
  quote: string,
  context: string,
  emotion: string
): void {
  storeQuote(userId, quote, context, emotion);
}

/**
 * Capture an observed pattern
 */
export function capturePattern(userId: string, pattern: string): void {
  storePattern(userId, pattern);
}

/**
 * Capture a milestone moment
 */
export function captureMilestone(
  userId: string,
  description: string,
  significance: 'minor' | 'major' | 'transformative'
): void {
  storeMilestone(userId, description, significance);
}

/**
 * Capture a mentioned relationship
 */
export function captureRelationship(
  userId: string,
  name: string,
  relationship: string,
  context: string
): void {
  storeRelationship(userId, name, relationship, context);
}

/**
 * Capture a dream or goal
 */
export function captureDream(userId: string, dream: string): void {
  storeDream(userId, dream);
}

// ============================================================================
// PROMPT INJECTION HELPER
// ============================================================================

/**
 * Format all brand evolution injections for the system prompt
 */
export function formatBrandEvolutionForPrompt(result: BrandEvolutionResult): string {
  if (result.promptInjections.length === 0) {
    return '';
  }
  
  const sections = [
    '// ============================================================',
    '// BRAND EVOLUTION - SIGNATURE MOMENTS ACTIVE',
    '// ============================================================',
    '',
    ...result.promptInjections,
  ];
  
  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // Re-export types
  type SecretContext,
  type SecretResult,
  type Achievement,
  type LateNightContext,
  type LateNightGreeting,
  type MemoryCallback,
  
  // Re-export modules for direct access
  brandSecrets,
  lateNightWarmth,
  memoryCallbacks,
};

export default {
  initializeBrandEvolutionSession,
  resetBrandEvolutionSession,
  processBrandEvolution,
  formatBrandEvolutionForPrompt,
  captureMemorableQuote,
  capturePattern,
  captureMilestone,
  captureRelationship,
  captureDream,
};
