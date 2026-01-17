/**
 * Conversation Health Awareness
 *
 * Integrates self-healing system into Ferni's conversational abilities.
 * "Better than human" means being transparent about our limitations.
 *
 * Features:
 * - Real-time health monitoring during conversations
 * - Proactive communication about service issues
 * - Warm, human explanations of technical problems
 * - Recovery announcements when issues resolve
 *
 * This makes Ferni feel more human - she acknowledges when things
 * aren't working perfectly, just like a real person would.
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getCachedHealthStatus,
  isCapabilityHealthy,
  type HealthStatus,
} from './health-monitors.js';
import { getAllCircuitStats, type CircuitState } from './circuit-breaker.js';
import { humanizeError } from './error-humanizer.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'conversation-health' });

// ============================================================================
// TYPES
// ============================================================================

export interface HealthContext {
  /** Overall system health */
  overallHealth: 'healthy' | 'degraded' | 'critical';
  /** Services that are having issues */
  degradedServices: string[];
  /** Human-friendly summary for LLM context */
  contextSummary: string;
  /** Whether to proactively mention health status */
  shouldMentionHealth: boolean;
  /** Specific capabilities that are affected */
  affectedCapabilities: string[];
  /** Recovery messages if services just recovered */
  recoveryMessages: string[];
}

export interface HealthAwarenessConfig {
  /** How often to check health (ms) */
  checkIntervalMs: number;
  /** Whether to proactively mention degradation */
  proactiveCommunication: boolean;
  /** Minimum time between health mentions (ms) */
  mentionCooldownMs: number;
  /** Whether to announce recoveries */
  announceRecoveries: boolean;
}

// ============================================================================
// WARM, HUMAN PHRASES
// ============================================================================

/**
 * Phrases Ferni uses to mention service issues
 * These are warm, human, and non-technical
 */
const DEGRADATION_PHRASES = {
  music: [
    "I'm having a bit of trouble with the music service right now, but everything else is working great.",
    'The music connection is being a little finicky at the moment.',
    "Spotify's being a bit slow to respond - let me know if you'd like me to try again in a bit.",
  ],
  weather: [
    "I'm having trouble getting weather info right now - my weather source is taking a break.",
    'The weather service is being a bit unresponsive, but I can try again shortly.',
  ],
  calendar: [
    "I'm having trouble accessing your calendar at the moment.",
    'The calendar connection seems to be having a moment - let me try again.',
  ],
  smartHome: [
    'Your smart home devices are being a bit slow to respond right now.',
    "I'm having trouble connecting to your smart home - the signal's a bit fuzzy.",
  ],
  memory: [
    "I'm having a small moment where I can't quite remember everything - give me a second.",
    'My memory is being a bit foggy at the moment, but it should clear up soon.',
  ],
  general: [
    "I'm experiencing a small hiccup with one of my helpers, but I'm still here for you.",
    "One of the services I use is taking a breather - I'll work around it.",
    "Things are running a little slow on my end, but I'm managing.",
  ],
};

/**
 * Phrases Ferni uses to announce recovery
 */
const RECOVERY_PHRASES = {
  music: [
    'Good news - the music service is back up and running!',
    "Music's working again! Want me to play something?",
  ],
  weather: [
    'I can check the weather again now - want me to look that up?',
    'The weather service is back online.',
  ],
  calendar: ['Your calendar is accessible again.', 'I can see your calendar now - all sorted!'],
  smartHome: [
    'Your smart home is responding again.',
    "I've reconnected to your smart home devices.",
  ],
  memory: [
    "My memory's cleared up - I remember everything now!",
    "All good - I'm back to full memory capacity.",
  ],
  general: [
    'That hiccup I mentioned earlier? All sorted out now!',
    "Everything's running smoothly again.",
    "I'm back to 100% - thanks for your patience!",
  ],
};

/**
 * Context injections for LLM prompts when services are degraded
 */
const CONTEXT_INJECTIONS = {
  music:
    'Note: Spotify/music service is currently unavailable. If user asks about music, acknowledge this warmly and suggest trying again later.',
  weather:
    'Note: Weather service is temporarily unavailable. Acknowledge this if user asks about weather.',
  calendar:
    'Note: Calendar access is having issues. If user asks about schedule, acknowledge the temporary issue.',
  smartHome:
    'Note: Smart home integration is slow/unavailable. Acknowledge this if user tries to control devices.',
  memory:
    'Note: Some memory functions are temporarily limited. Be especially present and attentive.',
  ai: 'Note: AI processing is running slower than usual. Responses may take a moment longer.',
  voice:
    'Note: Voice connection quality may be affected. Speak clearly and be patient with any audio issues.',
};

// ============================================================================
// STATE
// ============================================================================

interface HealthState {
  lastCheck: number;
  lastMention: number;
  previouslyDegraded: Set<string>;
  recentRecoveries: Array<{ service: string; time: number }>;
}

const state: HealthState = {
  lastCheck: 0,
  lastMention: 0,
  previouslyDegraded: new Set(),
  recentRecoveries: [],
};

const DEFAULT_CONFIG: HealthAwarenessConfig = {
  checkIntervalMs: 30000, // 30 seconds
  proactiveCommunication: true,
  mentionCooldownMs: 300000, // 5 minutes between mentions
  announceRecoveries: true,
};

let config = { ...DEFAULT_CONFIG };

// ============================================================================
// SERVICE MAPPING
// ============================================================================

/**
 * Map circuit/service names to categories
 */
function categorizeService(serviceName: string): keyof typeof DEGRADATION_PHRASES {
  const lower = serviceName.toLowerCase();

  if (lower.includes('spotify') || lower.includes('music')) return 'music';
  // Only categorize as 'weather' if explicitly weather-related
  // Previously included 'google' which caused unrelated Google circuits (calendar, books)
  // to incorrectly report weather as unavailable
  if (lower.includes('weather') || lower.includes('open-meteo')) return 'weather';
  if (lower.includes('calendar') || lower.includes('google-calendar')) return 'calendar';
  if (
    lower.includes('home') ||
    lower.includes('hue') ||
    lower.includes('lifx') ||
    lower.includes('smart')
  )
    return 'smartHome';
  if (lower.includes('firestore') || lower.includes('memory') || lower.includes('context'))
    return 'memory';

  return 'general';
}

/**
 * Get a random phrase from a category
 */
function getRandomPhrase(phrases: string[]): string {
  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Configure health awareness behavior
 */
export function configureHealthAwareness(newConfig: Partial<HealthAwarenessConfig>): void {
  config = { ...config, ...newConfig };
  log.info({ config }, 'Health awareness configured');
}

/**
 * Get current health context for conversation
 *
 * Call this before generating LLM responses to inject health awareness.
 */
export function getHealthContext(): HealthContext {
  const now = Date.now();

  // Get circuit breaker status
  const circuitStats = getAllCircuitStats();
  const degradedCircuits = circuitStats.filter((c) => c.state !== 'closed');

  // Get health monitor status (cached)
  const healthStatus = getCachedHealthStatus();

  // Determine affected services
  const degradedServices = new Set<string>();
  const affectedCapabilities: string[] = [];

  for (const circuit of degradedCircuits) {
    degradedServices.add(circuit.name);
  }

  if (healthStatus?.unhealthyServices) {
    for (const svc of healthStatus.unhealthyServices) {
      degradedServices.add(cleanForFirestore(svc));
    }
  }

  // Check capabilities
  if (!isCapabilityHealthy('audio')) affectedCapabilities.push('voice quality');
  if (!isCapabilityHealthy('tools')) affectedCapabilities.push('external services');
  if (!isCapabilityHealthy('memory')) affectedCapabilities.push('memory');

  // Check for recoveries
  const recoveryMessages: string[] = [];
  const currentDegraded = new Set(degradedServices);

  if (config.announceRecoveries) {
    for (const prev of state.previouslyDegraded) {
      if (!currentDegraded.has(prev)) {
        // This service recovered!
        const category = categorizeService(prev);
        const phrases = RECOVERY_PHRASES[category] || RECOVERY_PHRASES.general;
        recoveryMessages.push(getRandomPhrase(phrases));

        state.recentRecoveries.push({ service: prev, time: now });
        log.info({ service: prev }, 'Service recovered');
      }
    }
  }

  // Update state
  state.previouslyDegraded = currentDegraded;
  state.lastCheck = now;

  // Clean old recoveries (older than 5 minutes)
  state.recentRecoveries = state.recentRecoveries.filter((r) => now - r.time < 300000);

  // Determine overall health
  let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
  if (degradedServices.size > 0) {
    overallHealth = 'degraded';
  }
  if (healthStatus?.overall === 'critical' || !isCapabilityHealthy('audio')) {
    overallHealth = 'critical';
  }

  // Build context summary for LLM
  let contextSummary = '';
  if (degradedServices.size > 0) {
    const categories = new Set<string>();
    for (const svc of degradedServices) {
      categories.add(categorizeService(svc));
    }

    const injections: string[] = [];
    for (const cat of categories) {
      const injection = CONTEXT_INJECTIONS[cat as keyof typeof CONTEXT_INJECTIONS];
      if (injection) injections.push(injection);
    }

    contextSummary = injections.join(' ');
  }

  // Should we proactively mention health?
  const timeSinceLastMention = now - state.lastMention;
  const shouldMentionHealth =
    config.proactiveCommunication &&
    degradedServices.size > 0 &&
    timeSinceLastMention > config.mentionCooldownMs;

  return {
    overallHealth,
    degradedServices: Array.from(degradedServices),
    contextSummary,
    shouldMentionHealth,
    affectedCapabilities,
    recoveryMessages,
  };
}

/**
 * Get a proactive health message if appropriate
 *
 * Call this when starting a conversation or after a pause to see
 * if Ferni should mention any health issues.
 */
export function getProactiveHealthMessage(): string | null {
  const context = getHealthContext();

  if (!context.shouldMentionHealth) {
    return null;
  }

  // Mark that we're mentioning health
  state.lastMention = Date.now();

  // Pick a relevant phrase based on degraded services
  const categories = new Set<string>();
  for (const svc of context.degradedServices) {
    categories.add(categorizeService(svc));
  }

  // Prefer specific category over general
  for (const cat of categories) {
    if (cat !== 'general') {
      const phrases = DEGRADATION_PHRASES[cat as keyof typeof DEGRADATION_PHRASES];
      if (phrases) {
        return getRandomPhrase(phrases);
      }
    }
  }

  // Fall back to general
  return getRandomPhrase(DEGRADATION_PHRASES.general);
}

/**
 * Get recovery announcement if services just recovered
 */
export function getRecoveryAnnouncement(): string | null {
  const context = getHealthContext();

  if (context.recoveryMessages.length === 0) {
    return null;
  }

  // Return first recovery message (usually just one)
  return context.recoveryMessages[0];
}

/**
 * Generate context injection for LLM system prompt
 *
 * Add this to the system prompt to make Ferni aware of health status.
 */
export function getSystemPromptInjection(): string {
  const context = getHealthContext();

  if (!context.contextSummary) {
    return '';
  }

  return `\n\n[SYSTEM HEALTH CONTEXT]\n${context.contextSummary}\n`;
}

/**
 * Handle an error during conversation
 *
 * Returns a human-friendly message Ferni can say.
 */
export function handleConversationError(error: Error): string {
  const humanized = humanizeError(error);

  log.warn({ error: error.message, severity: humanized.severity }, 'Error during conversation');

  // For major errors, be more apologetic
  if (humanized.severity === 'major') {
    return `I'm really sorry, but I'm having some technical difficulties right now. ${humanized.userMessage}`;
  }

  // For moderate errors, be casual
  if (humanized.severity === 'moderate') {
    return humanized.userMessage;
  }

  // For minor errors, be even more casual
  return `Just a small hiccup - ${humanized.userMessage}`;
}

/**
 * Check if a specific capability is available
 *
 * Use this before attempting operations that might fail.
 */
export function checkCapability(
  capability: 'music' | 'weather' | 'calendar' | 'smartHome' | 'memory'
): {
  available: boolean;
  message?: string;
} {
  const context = getHealthContext();

  const serviceMap: Record<string, string[]> = {
    music: ['spotify'],
    // NOTE: Weather uses Open-Meteo as fallback, don't include 'google' here
    // Google Weather API is optional - Open-Meteo always works
    weather: ['weather', 'open-meteo'],
    // Calendar specifically uses google-calendar circuit breaker
    calendar: ['google-calendar'],
    smartHome: ['home-assistant', 'hue', 'lifx', 'smartthings'],
    memory: ['firestore', 'context'],
  };

  const relevantServices = serviceMap[capability] || [];
  const affected = context.degradedServices.some((svc) =>
    relevantServices.some((rel) => svc.toLowerCase().includes(rel))
  );

  if (affected) {
    const phrases = DEGRADATION_PHRASES[capability] || DEGRADATION_PHRASES.general;
    return {
      available: false,
      message: getRandomPhrase(phrases),
    };
  }

  return { available: true };
}

/**
 * Create a health-aware wrapper for tool execution
 *
 * Wraps tool execution with health checks and error handling.
 */
export function withHealthAwareness<T>(
  capability: 'music' | 'weather' | 'calendar' | 'smartHome' | 'memory',
  operation: () => Promise<T>
): Promise<{ success: true; result: T } | { success: false; message: string }> {
  return (async () => {
    // Pre-check capability
    const check = checkCapability(capability);
    if (!check.available) {
      return { success: false, message: check.message! };
    }

    try {
      const result = await operation();
      return { success: true, result };
    } catch (error) {
      const message = handleConversationError(error as Error);
      return { success: false, message };
    }
  })();
}

// ============================================================================
// CONVERSATION HOOKS
// ============================================================================

/**
 * Hook: Called at start of conversation
 */
export function onConversationStart(): {
  healthContext: HealthContext;
  openingHealthMessage?: string;
} {
  const context = getHealthContext();

  // Don't overwhelm with health info at start, but mention if critical
  let openingHealthMessage: string | undefined;

  if (context.overallHealth === 'critical') {
    openingHealthMessage =
      "Just a heads up - I'm experiencing some technical difficulties, but I'm still here for you.";
  } else if (context.recoveryMessages.length > 0) {
    openingHealthMessage = context.recoveryMessages[0];
  }

  return { healthContext: context, openingHealthMessage };
}

/**
 * Hook: Called during conversation pauses
 */
export function onConversationPause(): string | null {
  // Check if we should announce recovery
  const recovery = getRecoveryAnnouncement();
  if (recovery) {
    return recovery;
  }

  // Don't proactively mention degradation during pauses
  // (it would be annoying)
  return null;
}

/**
 * Hook: Called before LLM generates response
 */
export function beforeLLMResponse(): {
  systemPromptAddition: string;
  preResponseMessage?: string;
} {
  const context = getHealthContext();

  return {
    systemPromptAddition: getSystemPromptInjection(),
    preResponseMessage: context.recoveryMessages[0], // Announce recovery if any
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { DEGRADATION_PHRASES, RECOVERY_PHRASES, CONTEXT_INJECTIONS };
