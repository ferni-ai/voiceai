/**
 * 🌉 Narrative Bridge
 * 
 * Connects the Narrative Director to the app lifecycle.
 * Listens for app events and triggers appropriate story beats.
 * 
 * This is the glue between the technical events (connection, speech)
 * and the storytelling layer (beats, arcs, emotions).
 * 
 * @module @ferni/narrative/bridge
 */

import { createLogger } from '../utils/logger.js';
import { 
  getNarrativeDirector, 
  updateNarrativeContext,
  playBeat,
  type StoryBeat,
  type NarrativeContext,
} from './narrative-director.js';
import { getSuggestedArc, STORY_ARCS } from './story-arcs.js';
import { getEmotionAnalyzer, type DetectedEmotion } from './emotion-analyzer.js';
// 🎬 Pixar Emotions - Avatar expressions respond to user emotions
import { pixarEmotions } from '../ui/pixar-emotions.ui.js';

const log = createLogger('NarrativeBridge');

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let currentSessionId: string | null = null;
let sessionStartTime: number = 0;
let lastSpeechTime: number = 0;
let isFerniSpeaking = false;
let isUserSpeaking = false;

// Conversation tracking
let turnCount = 0;
let userTurnCount = 0;
let ferniTurnCount = 0;

// Silence detection
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
const LONG_PAUSE_THRESHOLD = 5000; // 5 seconds

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the narrative bridge
 * Call this after app initialization
 */
export function initNarrativeBridge(): void {
  if (isInitialized) {
    log.debug('Narrative bridge already initialized');
    return;
  }
  
  // Set up event listeners
  setupConnectionListeners();
  setupSpeechListeners();
  setupAchievementListeners();
  setupTeamListeners();
  setupEmotionListeners();
  setupSessionListeners();
  
  // Initialize context from localStorage
  loadPersistedContext();
  
  isInitialized = true;
  log.info('Narrative bridge initialized');
}

/**
 * Dispose the narrative bridge
 */
export function disposeNarrativeBridge(): void {
  // Cleanup listeners would go here
  if (silenceTimer) {
    clearTimeout(silenceTimer);
  }
  isInitialized = false;
}

// ============================================================================
// CONNECTION EVENTS
// ============================================================================

function setupConnectionListeners(): void {
  // Connection starting
  document.addEventListener('ferni:connecting', () => {
    void playBeat('connecting');
  });
  
  // Connection established
  document.addEventListener('ferni:connected', () => {
    startSession();
    void playBeat('connected');
  });
  
  // Connection lost
  document.addEventListener('ferni:connection-lost', () => {
    void playBeat('connection_lost');
  });
  
  // Reconnected
  document.addEventListener('ferni:reconnected', () => {
    void playBeat('reconnected');
  });
  
  // Disconnected (intentional)
  document.addEventListener('ferni:disconnected', () => {
    endSession();
  });
  
  log.debug('Connection listeners set up');
}

// ============================================================================
// SPEECH EVENTS
// ============================================================================

function setupSpeechListeners(): void {
  const director = getNarrativeDirector();
  
  // User starts speaking
  document.addEventListener('ferni:user-speech-start', () => {
    if (!isUserSpeaking) {
      isUserSpeaking = true;
      userTurnCount++;
      turnCount++;
      lastSpeechTime = Date.now();
      
      // Clear silence timer
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
      
      void director.userStartsSpeaking();
    }
  });
  
  // User stops speaking
  document.addEventListener('ferni:user-speech-end', () => {
    if (isUserSpeaking) {
      isUserSpeaking = false;
      lastSpeechTime = Date.now();
      
      void playBeat('user_stops_speaking');
      
      // Start silence detection
      startSilenceDetection();
    }
  });
  
  // Ferni starts speaking
  document.addEventListener('ferni:agent-speech-start', () => {
    if (!isFerniSpeaking) {
      isFerniSpeaking = true;
      ferniTurnCount++;
      turnCount++;
      lastSpeechTime = Date.now();
      
      // Clear silence timer
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
      
      void director.ferniStartsSpeaking();
    }
  });
  
  // Ferni stops speaking
  document.addEventListener('ferni:agent-speech-end', () => {
    if (isFerniSpeaking) {
      isFerniSpeaking = false;
      lastSpeechTime = Date.now();
      
      void playBeat('ferni_stops_speaking');
      
      // Start silence detection
      startSilenceDetection();
    }
  });
  
  // Thinking/processing
  document.addEventListener('ferni:thinking', () => {
    void director.thinking();
  });
  
  log.debug('Speech listeners set up');
}

function startSilenceDetection(): void {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
  }
  
  silenceTimer = setTimeout(() => {
    // Only trigger if no one is speaking
    if (!isUserSpeaking && !isFerniSpeaking) {
      void playBeat('long_pause');
    }
  }, LONG_PAUSE_THRESHOLD);
}

// ============================================================================
// ACHIEVEMENT EVENTS
// ============================================================================

function setupAchievementListeners(): void {
  const director = getNarrativeDirector();
  
  // Small win
  document.addEventListener('ferni:small-win', ((e: CustomEvent) => {
    void director.smallWin(e.detail?.message);
  }) as EventListener);
  
  // Big win
  document.addEventListener('ferni:big-win', ((e: CustomEvent) => {
    void director.bigWin(e.detail?.message);
  }) as EventListener);
  
  // Milestone
  document.addEventListener('ferni:milestone', ((e: CustomEvent) => {
    void director.milestone(e.detail?.name || 'Milestone');
  }) as EventListener);
  
  // Streak
  document.addEventListener('ferni:streak', ((e: CustomEvent) => {
    const count = e.detail?.count || 0;
    updateNarrativeContext({ streakCount: count });
    void playBeat('streak_continues', { context: { streakCount: count } });
  }) as EventListener);
  
  // Goal completed
  document.addEventListener('ferni:goal-completed', ((e: CustomEvent) => {
    void playBeat('goal_completed', { metadata: e.detail });
  }) as EventListener);
  
  // Breakthrough
  document.addEventListener('ferni:breakthrough', () => {
    void director.breakthrough();
  });
  
  log.debug('Achievement listeners set up');
}

// ============================================================================
// TEAM EVENTS
// ============================================================================

function setupTeamListeners(): void {
  const director = getNarrativeDirector();
  
  // Persona switch
  document.addEventListener('ferni:switch-persona', ((e: CustomEvent) => {
    const { personaId, personaName } = e.detail;
    updateNarrativeContext({ personaId });
    void playBeat('persona_introduced', { 
      context: { personaId },
      metadata: { personaId, personaName },
    });
  }) as EventListener);
  
  // Handoff
  document.addEventListener('ferni:handoff', ((e: CustomEvent) => {
    const { from, to, toName } = e.detail;
    void director.personaHandoff(to, toName);
  }) as EventListener);
  
  // Team unlock
  document.addEventListener('ferni:team-unlock', ((e: CustomEvent) => {
    const { personaId, personaName } = e.detail;
    void director.teamUnlock(personaId, personaName);
  }) as EventListener);
  
  // Team huddle
  document.addEventListener('ferni:team-huddle-start', () => {
    void playBeat('team_huddle_start');
  });
  
  log.debug('Team listeners set up');
}

// ============================================================================
// EMOTION EVENTS
// ============================================================================

function setupEmotionListeners(): void {
  // Listen for emotion analysis results
  document.addEventListener('ferni:emotion-detected', ((e: CustomEvent<DetectedEmotion>) => {
    handleDetectedEmotion(e.detail);
  }) as EventListener);
  
  // Deep moment (from trust system)
  document.addEventListener('ferni:deep-moment', ((e: CustomEvent) => {
    void playBeat('deep_moment', { metadata: e.detail });
    // 🎬 Pixar: Deep moment deserves a meaningful expression
    // Held pose shows "this matters" (like Pixar's emotional beats)
    pixarEmotions.heldPose('empathetic', 800);
  }) as EventListener);
  
  // Empathy moment
  document.addEventListener('ferni:empathy-moment', () => {
    void playBeat('empathy_moment');
    // 🎬 Pixar: Soft, caring expression
    pixarEmotions.empathy();
  });
  
  log.debug('Emotion listeners set up');
}

function handleDetectedEmotion(emotion: DetectedEmotion): void {
  const director = getNarrativeDirector();
  
  // Update context
  updateNarrativeContext({ userEmotion: emotion.primary });
  
  // Trigger appropriate beat if confidence is high enough
  if (emotion.confidence < 0.6) return;
  
  switch (emotion.primary) {
    case 'sad':
      void playBeat('user_sad');
      // 🎬 Pixar: Show empathetic expression - "I'm here for you"
      pixarEmotions.empathy();
      break;
    case 'frustrated':
      void playBeat('user_frustrated');
      // 🎬 Pixar: Show understanding/listening expression
      pixarEmotions.setExpression('empathetic', 300, 2000);
      break;
    case 'excited':
      void playBeat('user_excited');
      // 🎬 Pixar: Mirror their excitement!
      pixarEmotions.excited();
      break;
    case 'anxious':
      // Treat anxiety with calm
      void playBeat('user_vulnerable');
      // 🎬 Pixar: Calm, grounding presence (not nervous energy!)
      pixarEmotions.setExpression('empathetic', 400, 3000);
      break;
    case 'happy':
      // Don't need to react to every positive emotion
      // Let the conversation flow naturally
      // 🎬 Pixar: Subtle happy expression (brief, not overwhelming)
      if (emotion.confidence > 0.75) {
        pixarEmotions.happy(600);
      }
      break;
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

function setupSessionListeners(): void {
  // App wake (first open of day)
  document.addEventListener('ferni:app-wake', () => {
    const director = getNarrativeDirector();
    void director.greeting();
  });
  
  // Session end
  document.addEventListener('ferni:session-end', () => {
    endSession();
  });
  
  log.debug('Session listeners set up');
}

function startSession(): void {
  currentSessionId = `session_${Date.now()}`;
  sessionStartTime = Date.now();
  turnCount = 0;
  userTurnCount = 0;
  ferniTurnCount = 0;
  
  // Load context
  loadPersistedContext();
  
  // Increment conversation count
  const context = getNarrativeDirector().getContext();
  updateNarrativeContext({ 
    totalConversations: context.totalConversations + 1,
    timeSinceLastInteraction: Date.now() - getLastInteractionTime(),
  });
  
  // Persist
  persistContext();
  
  log.info('Session started', { sessionId: currentSessionId });
}

function endSession(): void {
  if (!currentSessionId) return;
  
  const duration = Date.now() - sessionStartTime;
  
  // Calculate conversation depth based on turn count
  const depth = Math.min(1, turnCount / 20);
  updateNarrativeContext({ conversationDepth: depth });
  
  // Persist for next session
  persistContext();
  setLastInteractionTime(Date.now());
  
  log.info('Session ended', { 
    sessionId: currentSessionId, 
    duration,
    turns: turnCount,
    depth,
  });
  
  currentSessionId = null;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

const CONTEXT_STORAGE_KEY = 'ferni_narrative_context';
const LAST_INTERACTION_KEY = 'ferni_last_interaction';

function loadPersistedContext(): void {
  try {
    const stored = localStorage.getItem(CONTEXT_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<NarrativeContext>;
      updateNarrativeContext(parsed);
      log.debug('Loaded persisted context', parsed);
    }
  } catch (error) {
    log.warn('Failed to load persisted context', { error });
  }
}

function persistContext(): void {
  try {
    const context = getNarrativeDirector().getContext();
    // Only persist relevant fields
    const toStore = {
      totalConversations: context.totalConversations,
      streakCount: context.streakCount,
    };
    localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(toStore));
    log.debug('Persisted context', toStore);
  } catch (error) {
    log.warn('Failed to persist context', { error });
  }
}

function getLastInteractionTime(): number {
  try {
    const stored = localStorage.getItem(LAST_INTERACTION_KEY);
    return stored ? parseInt(stored, 10) : 0;
  } catch {
    return 0;
  }
}

function setLastInteractionTime(time: number): void {
  try {
    localStorage.setItem(LAST_INTERACTION_KEY, time.toString());
  } catch {
    // Ignore storage errors
  }
}

// ============================================================================
// MANUAL TRIGGERS (for dev panel / testing)
// ============================================================================

/**
 * Manually trigger a story beat (for testing)
 */
export function triggerTestBeat(beat: StoryBeat): void {
  void playBeat(beat, { force: true });
}

/**
 * Manually start a story arc (for testing)
 */
export function triggerTestArc(arcId: string): void {
  const arc = STORY_ARCS[arcId];
  if (!arc) {
    log.warn('Unknown arc', { arcId });
    return;
  }
  
  const director = getNarrativeDirector();
  director.startArc({
    id: `test_${arcId}_${Date.now()}`,
    name: arc.name,
    beats: arc.beats,
  });
}

/**
 * Get current session stats (for dev panel)
 */
export function getSessionStats(): {
  sessionId: string | null;
  duration: number;
  turns: number;
  userTurns: number;
  ferniTurns: number;
  isFerniSpeaking: boolean;
  isUserSpeaking: boolean;
} {
  return {
    sessionId: currentSessionId,
    duration: currentSessionId ? Date.now() - sessionStartTime : 0,
    turns: turnCount,
    userTurns: userTurnCount,
    ferniTurns: ferniTurnCount,
    isFerniSpeaking,
    isUserSpeaking,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  isInitialized as isNarrativeBridgeInitialized,
};

