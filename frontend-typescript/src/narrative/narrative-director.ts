/**
 * 🎬 Narrative Director
 * 
 * The cinematic brain of Ferni. Coordinates all animation systems
 * to tell cohesive emotional stories throughout the user journey.
 * 
 * Think of this as Pixar's story department - every moment has meaning,
 * every animation serves the narrative, every beat builds connection.
 * 
 * SYSTEMS COORDINATED:
 * - Animation Orchestrator (Pixar principles)
 * - Ferni Moments (character expressions)
 * - Soul System (living presence)
 * - Persona Magic (handoff transitions)
 * - Ritual Engine (multi-sensory moments)
 * - Emotion State (character feeling)
 * - Kinetic Typography (text animations)
 * - Glow Controller (ambient lighting)
 * - Haptics (touch feedback)
 * - Audio Engine (sound design)
 * 
 * STORYTELLING PRINCIPLES:
 * 1. Every moment tells a micro-story
 * 2. Build emotional arcs, not random effects
 * 3. Character consistency across all feedback
 * 4. Respect the user's emotional state
 * 5. Quiet moments are as important as celebrations
 * 
 * @module @ferni/narrative
 */

import { createLogger } from '../utils/logger.js';
import { DURATION } from '../config/animation-constants.js';

// Import existing animation systems
import { playCharacterReaction } from '../ui/animation-orchestrator.ui.js';
import { triggerMoment, type MomentType } from '../ui/ferni-moments.ui.js';
// Note: These imports are available for future use but currently unused
// import { performMagicalHandoff, celebrationBurst, empathyPulse } from '../ui/persona-magic.ui.js';
// import { revealText, typewriterEffect, scrambleReveal } from '../ui/kinetic-typography.ui.js';

// Import brand system
import { getRitualEngine, type RitualType, type RitualContext } from '../services/ritual-engine.service.js';
import { getGlowController } from '../services/glow-controller.service.js';
import { getHapticsService } from '../services/haptics.service.js';
import { getFerniAudioEngine } from '../services/ferni-audio.service.js';

// Import emotion system
import { type EmotionId, transitionEmotion } from '../emotion/emotion-state.js';

const log = createLogger('NarrativeDirector');

// ============================================================================
// TYPES
// ============================================================================

type PersonaId = 'ferni' | 'jack' | 'peter' | 'alex' | 'maya' | 'jordan' | 'nayan';

/**
 * Story beat - a meaningful moment in the user journey
 */
export type StoryBeat = 
  // Journey milestones
  | 'first_launch'           // Brand new user
  | 'welcome_back'           // Returning user
  | 'daily_return'           // Same-day return
  | 'streak_continues'       // Streak maintained
  | 'streak_broken'          // Streak lost (handle gently)
  
  // Connection events
  | 'connecting'             // Establishing connection
  | 'connected'              // Connection established
  | 'connection_lost'        // Temporarily disconnected
  | 'reconnected'            // Back online
  
  // Conversation flow
  | 'user_starts_speaking'   // User begins talking
  | 'user_stops_speaking'    // User pauses/stops
  | 'ferni_starts_speaking'  // AI begins response
  | 'ferni_stops_speaking'   // AI finishes
  | 'thinking'               // Processing user input
  | 'long_pause'             // Extended silence (>5s)
  | 'deep_thought'           // Processing complex topic
  
  // Emotional moments
  | 'user_vulnerable'        // User sharing something personal
  | 'user_frustrated'        // User expressing frustration
  | 'user_excited'           // User showing excitement
  | 'user_sad'               // User expressing sadness
  | 'breakthrough'           // User has realization
  | 'empathy_moment'         // Deep connection moment
  | 'deep_moment'            // Trust system deep moment
  
  // Achievements
  | 'small_win'              // Minor accomplishment
  | 'big_win'                // Major achievement
  | 'milestone_reached'      // Significant progress
  | 'goal_completed'         // Finished a goal
  | 'skill_improved'         // Growth detected
  
  // Team dynamics
  | 'persona_introduced'     // First time meeting persona
  | 'persona_handoff'        // Switching personas
  | 'team_unlock'            // New team member available
  | 'team_huddle_start'      // Multi-persona moment
  
  // Time-aware
  | 'morning_greeting'       // Dawn/morning context
  | 'evening_wind_down'      // Evening context
  | 'late_night'             // Late night context
  | 'weekend_mode'           // Weekend casual
  
  // Special
  | 'birthday'               // User's birthday
  | 'anniversary'            // Relationship anniversary
  | 'holiday'                // Holiday context
  | 'custom_moment';         // User-defined ritual

/**
 * Emotional context for the narrative
 */
export interface NarrativeContext {
  /** Current persona active */
  personaId: PersonaId;
  
  /** User's detected emotional state */
  userEmotion?: 'calm' | 'happy' | 'sad' | 'frustrated' | 'anxious' | 'excited' | 'neutral';
  
  /** Conversation depth (0 = small talk, 1 = deep) */
  conversationDepth: number;
  
  /** Time since last interaction (ms) */
  timeSinceLastInteraction: number;
  
  /** Current streak count */
  streakCount: number;
  
  /** Total conversation count */
  totalConversations: number;
  
  /** Time of day context */
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  
  /** Any custom data */
  metadata?: Record<string, unknown>;
}

/**
 * Story arc - a sequence of beats that form a narrative
 */
export interface StoryArc {
  id: string;
  name: string;
  beats: StoryBeat[];
  currentBeatIndex: number;
  startedAt: number;
  context: NarrativeContext;
}

// ============================================================================
// BEAT DEFINITIONS
// ============================================================================

interface BeatOrchestration {
  /** Emotion for the character */
  emotion?: EmotionId;
  
  /** Ferni moment to trigger */
  moment?: MomentType;
  
  /** Pixar reaction type */
  reaction?: 'nod' | 'shake' | 'bounce' | 'pulse' | 'curious' | 'surprise' | 'celebrate';
  
  /** Ritual to trigger */
  ritual?: RitualType;
  
  /** Glow effect */
  glow?: 'breathe' | 'pulse' | 'celebrate' | 'empathy' | 'thinking';
  
  /** Haptic pattern */
  haptic?: string;
  
  /** Sound to play */
  sound?: string;
  
  /** Text animation */
  textAnimation?: 'reveal' | 'typewriter' | 'scramble';
  
  /** Duration modifier (multiplier) */
  durationMultiplier?: number;
  
  /** Whether to await completion before continuing */
  blocking?: boolean;
}

const BEAT_ORCHESTRATIONS: Record<StoryBeat, BeatOrchestration> = {
  // Journey milestones
  first_launch: {
    emotion: 'happy',
    moment: 'wave',
    glow: 'pulse',
    haptic: 'warmWelcome',
    ritual: 'app_wake',
    blocking: true,
  },
  
  welcome_back: {
    emotion: 'happy',
    moment: 'wave',
    glow: 'breathe',
    haptic: 'presence',
  },
  
  daily_return: {
    emotion: 'calm',
    moment: 'coffee',
    glow: 'breathe',
    haptic: 'softTap',
  },
  
  streak_continues: {
    emotion: 'excited',
    moment: 'streakFire',
    reaction: 'bounce',
    glow: 'celebrate',
    haptic: 'celebration',
    ritual: 'streak',
  },
  
  streak_broken: {
    emotion: 'calm',
    moment: 'warmGlow',
    glow: 'empathy',
    haptic: 'empathy',
    // Gentle - no celebration, just acknowledgment
  },
  
  // Connection events
  connecting: {
    emotion: 'curious',
    glow: 'thinking',
    haptic: 'thinking',
    sound: 'system.thinking',
  },
  
  connected: {
    emotion: 'happy',
    moment: 'sparkle',
    glow: 'pulse',
    haptic: 'presence',
    ritual: 'connection_start',
  },
  
  connection_lost: {
    emotion: 'sad',
    glow: 'empathy',
    haptic: 'error',
    sound: 'system.connectionLost',
  },
  
  reconnected: {
    emotion: 'happy',
    moment: 'sparkle',
    glow: 'pulse',
    haptic: 'success',
    sound: 'system.connectionSuccess',
  },
  
  // Conversation flow
  user_starts_speaking: {
    emotion: 'listening',
    glow: 'breathe',
    haptic: 'softTap',
  },
  
  user_stops_speaking: {
    emotion: 'thinking',
    glow: 'thinking',
    durationMultiplier: 0.5,
  },
  
  ferni_starts_speaking: {
    emotion: 'speaking',
    glow: 'breathe',
  },
  
  ferni_stops_speaking: {
    emotion: 'listening',
    glow: 'breathe',
    moment: 'nod',
    durationMultiplier: 0.3,
  },
  
  thinking: {
    emotion: 'thinking',
    moment: 'thinking',
    glow: 'thinking',
    sound: 'system.thinking',
  },
  
  long_pause: {
    emotion: 'curious',
    moment: 'headTilt',
    glow: 'breathe',
  },
  
  deep_thought: {
    emotion: 'thinking',
    moment: 'lightbulb',
    glow: 'thinking',
    haptic: 'thinking',
  },
  
  // Emotional moments
  user_vulnerable: {
    emotion: 'calm',
    moment: 'warmGlow',
    glow: 'empathy',
    haptic: 'empathy',
    ritual: 'deep_moment',
  },
  
  user_frustrated: {
    emotion: 'calm',
    moment: 'breathe',
    glow: 'empathy',
    haptic: 'empathy',
  },
  
  user_excited: {
    emotion: 'excited',
    moment: 'celebration',
    reaction: 'bounce',
    glow: 'celebrate',
    haptic: 'success',
  },
  
  user_sad: {
    emotion: 'calm',
    moment: 'warmGlow',
    glow: 'empathy',
    haptic: 'empathy',
  },
  
  breakthrough: {
    emotion: 'excited',
    moment: 'lightbulb',
    reaction: 'celebrate',
    glow: 'celebrate',
    haptic: 'milestone',
    ritual: 'big_win',
  },
  
  empathy_moment: {
    emotion: 'calm',
    moment: 'hearts',
    glow: 'empathy',
    haptic: 'empathy',
  },
  
  deep_moment: {
    emotion: 'calm',
    moment: 'warmGlow',
    glow: 'empathy',
    haptic: 'empathy',
    ritual: 'deep_moment',
  },
  
  // Achievements
  small_win: {
    emotion: 'happy',
    moment: 'sparkle',
    reaction: 'nod',
    glow: 'pulse',
    haptic: 'success',
    ritual: 'small_win',
  },
  
  big_win: {
    emotion: 'excited',
    moment: 'celebration',
    reaction: 'celebrate',
    glow: 'celebrate',
    haptic: 'celebration',
    ritual: 'big_win',
  },
  
  milestone_reached: {
    emotion: 'excited',
    moment: 'trophy',
    reaction: 'celebrate',
    glow: 'celebrate',
    haptic: 'milestone',
    ritual: 'milestone',
  },
  
  goal_completed: {
    emotion: 'happy',
    moment: 'trophy',
    reaction: 'celebrate',
    glow: 'celebrate',
    haptic: 'celebration',
    ritual: 'big_win',
    blocking: true,
  },
  
  skill_improved: {
    emotion: 'happy',
    moment: 'levelUp',
    glow: 'pulse',
    haptic: 'success',
  },
  
  // Team dynamics
  persona_introduced: {
    emotion: 'happy',
    moment: 'wave',
    glow: 'pulse',
    haptic: 'warmWelcome',
    textAnimation: 'reveal',
    blocking: true,
  },
  
  persona_handoff: {
    emotion: 'calm',
    glow: 'breathe',
    haptic: 'handoffBlend',
    ritual: 'persona_handoff',
    blocking: true,
  },
  
  team_unlock: {
    emotion: 'excited',
    moment: 'celebration',
    reaction: 'celebrate',
    glow: 'celebrate',
    haptic: 'celebration',
    ritual: 'team_unlock',
    blocking: true,
  },
  
  team_huddle_start: {
    emotion: 'excited',
    moment: 'highFive',
    glow: 'pulse',
    haptic: 'success',
  },
  
  // Time-aware
  morning_greeting: {
    emotion: 'calm',
    moment: 'coffee',
    glow: 'breathe',
    haptic: 'softTap',
  },
  
  evening_wind_down: {
    emotion: 'calm',
    moment: 'cozy',
    glow: 'breathe',
    haptic: 'softTap',
  },
  
  late_night: {
    emotion: 'calm',
    moment: 'moonlight',
    glow: 'breathe',
    haptic: 'softTap',
  },
  
  weekend_mode: {
    emotion: 'calm',
    moment: 'sunshine',
    glow: 'breathe',
  },
  
  // Special
  birthday: {
    emotion: 'excited',
    moment: 'birthday',
    reaction: 'celebrate',
    glow: 'celebrate',
    haptic: 'celebration',
    ritual: 'milestone',
  },
  
  anniversary: {
    emotion: 'happy',
    moment: 'hearts',
    glow: 'celebrate',
    haptic: 'celebration',
    ritual: 'milestone',
  },
  
  holiday: {
    emotion: 'happy',
    moment: 'sparkle',
    glow: 'pulse',
    haptic: 'success',
  },
  
  custom_moment: {
    emotion: 'happy',
    glow: 'pulse',
  },
};

// ============================================================================
// NARRATIVE DIRECTOR
// ============================================================================

export class NarrativeDirector {
  private currentContext: NarrativeContext;
  private activeArcs: Map<string, StoryArc> = new Map();
  private beatHistory: { beat: StoryBeat; timestamp: number }[] = [];
  private isPlaying: boolean = false;
  
  // System references
  private glow = getGlowController();
  private haptics = getHapticsService();
  private audio = getFerniAudioEngine();
  private ritualEngine = getRitualEngine();
  
  constructor() {
    this.currentContext = this.createDefaultContext();
    log.info('Narrative Director created');
  }
  
  // ==========================================================================
  // CONTEXT MANAGEMENT
  // ==========================================================================
  
  /**
   * Update the narrative context
   */
  updateContext(updates: Partial<NarrativeContext>): void {
    this.currentContext = { ...this.currentContext, ...updates };
    log.debug('Context updated', updates);
  }
  
  /**
   * Get current context
   */
  getContext(): NarrativeContext {
    return { ...this.currentContext };
  }
  
  private createDefaultContext(): NarrativeContext {
    return {
      personaId: 'ferni',
      conversationDepth: 0,
      timeSinceLastInteraction: 0,
      streakCount: 0,
      totalConversations: 0,
      timeOfDay: this.detectTimeOfDay(),
    };
  }
  
  private detectTimeOfDay(): NarrativeContext['timeOfDay'] {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }
  
  // ==========================================================================
  // STORY BEAT EXECUTION
  // ==========================================================================
  
  /**
   * Play a story beat - the main entry point for triggering narratives
   */
  async playBeat(beat: StoryBeat, options: {
    context?: Partial<NarrativeContext>;
    metadata?: Record<string, unknown>;
    force?: boolean;
  } = {}): Promise<void> {
    // Don't interrupt if already playing (unless forced)
    if (this.isPlaying && !options.force) {
      log.debug('Beat queued (already playing)', { beat });
      // Could queue here for future enhancement
      return;
    }
    
    // Update context if provided
    if (options.context) {
      this.updateContext(options.context);
    }
    
    // Record beat
    this.beatHistory.push({ beat, timestamp: Date.now() });
    if (this.beatHistory.length > 100) {
      this.beatHistory.shift();
    }
    
    const orchestration = BEAT_ORCHESTRATIONS[beat];
    if (!orchestration) {
      log.warn('Unknown beat', { beat });
      return;
    }
    
    log.info('Playing beat', { beat, orchestration });
    this.isPlaying = true;
    
    try {
      await this.executeOrchestration(orchestration, options.metadata);
    } finally {
      this.isPlaying = false;
    }
  }
  
  /**
   * Execute a beat orchestration
   */
  private async executeOrchestration(
    orchestration: BeatOrchestration,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const promises: Promise<void>[] = [];
    
    // 1. Set emotion (immediate)
    if (orchestration.emotion) {
      transitionEmotion(orchestration.emotion, { duration: 0.3 });
    }
    
    // 2. Trigger glow effect
    if (orchestration.glow) {
      this.executeGlow(orchestration.glow);
    }
    
    // 3. Play haptic (immediate)
    if (orchestration.haptic) {
      this.haptics.play(orchestration.haptic);
    }
    
    // 4. Play sound
    if (orchestration.sound) {
      promises.push(this.audio.play(orchestration.sound).catch(() => {}));
    }
    
    // 5. Trigger Ferni moment
    if (orchestration.moment) {
      promises.push(this.triggerMomentSafe(orchestration.moment));
    }
    
    // 6. Trigger Pixar reaction
    if (orchestration.reaction) {
      promises.push(this.triggerReactionSafe(orchestration.reaction));
    }
    
    // 7. Trigger ritual (async)
    if (orchestration.ritual) {
      const ritualContext: RitualContext = {
        personaId: this.currentContext.personaId,
        streakCount: this.currentContext.streakCount,
        ...(metadata as RitualContext),
      };
      promises.push(this.ritualEngine.trigger(orchestration.ritual, ritualContext));
    }
    
    // Wait for blocking orchestrations
    if (orchestration.blocking) {
      await Promise.all(promises);
    }
  }
  
  private executeGlow(type: BeatOrchestration['glow']): void {
    switch (type) {
      case 'breathe':
        this.glow.startBreathing();
        break;
      case 'pulse':
        this.glow.celebrate(DURATION.SLOW);
        break;
      case 'celebrate':
        this.glow.celebrate(DURATION.CELEBRATION);
        break;
      case 'empathy':
        this.glow.celebrate(DURATION.DELIBERATE);
        break;
      case 'thinking':
        this.glow.setThinking(true);
        break;
    }
  }
  
  private async triggerMomentSafe(moment: MomentType): Promise<void> {
    try {
      await triggerMoment(moment);
    } catch (error) {
      log.warn('Moment trigger failed', { moment, error });
    }
  }
  
  private async triggerReactionSafe(reaction: string): Promise<void> {
    try {
      // Find the avatar element - this is the main visual element that reacts
      const avatarElement = document.querySelector('.ferni-avatar, .avatar-container, [data-avatar]') as HTMLElement | null;
      if (!avatarElement) {
        log.debug('No avatar element found for reaction', { reaction });
        return;
      }
      
      // Cast reaction to proper type
      const reactionType = reaction as 'bounce' | 'nod' | 'shake' | 'joy' | 'attention' | 'curious-tilt';
      await playCharacterReaction(avatarElement, reactionType, this.currentContext.personaId);
    } catch (error) {
      log.warn('Reaction trigger failed', { reaction, error });
    }
  }
  
  // ==========================================================================
  // STORY ARCS
  // ==========================================================================
  
  /**
   * Start a story arc (sequence of beats)
   */
  startArc(arc: Omit<StoryArc, 'currentBeatIndex' | 'startedAt' | 'context'>): void {
    const fullArc: StoryArc = {
      ...arc,
      currentBeatIndex: 0,
      startedAt: Date.now(),
      context: { ...this.currentContext },
    };
    
    this.activeArcs.set(arc.id, fullArc);
    log.info('Arc started', { id: arc.id, name: arc.name, beats: arc.beats.length });
    
    // Play first beat
    const firstBeat = arc.beats[0];
    if (firstBeat) {
      void this.playBeat(firstBeat);
    }
  }
  
  /**
   * Advance to next beat in an arc
   */
  async advanceArc(arcId: string): Promise<boolean> {
    const arc = this.activeArcs.get(arcId);
    if (!arc) {
      log.warn('Arc not found', { arcId });
      return false;
    }
    
    arc.currentBeatIndex++;
    
    if (arc.currentBeatIndex >= arc.beats.length) {
      // Arc complete
      this.activeArcs.delete(arcId);
      log.info('Arc completed', { id: arcId, name: arc.name });
      return false;
    }
    
    // Play next beat
    const nextBeat = arc.beats[arc.currentBeatIndex];
    if (nextBeat) {
      await this.playBeat(nextBeat);
    }
    return true;
  }
  
  /**
   * Get active arc status
   */
  getArcStatus(arcId: string): { beat: StoryBeat; progress: number } | null {
    const arc = this.activeArcs.get(arcId);
    if (!arc) return null;
    
    const currentBeat = arc.beats[arc.currentBeatIndex];
    if (!currentBeat) return null;
    
    return {
      beat: currentBeat,
      progress: arc.currentBeatIndex / arc.beats.length,
    };
  }
  
  // ==========================================================================
  // CONVENIENCE METHODS
  // ==========================================================================
  
  /**
   * Quick beat triggers
   */
  async connected(): Promise<void> {
    await this.playBeat('connected');
  }
  
  async userStartsSpeaking(): Promise<void> {
    await this.playBeat('user_starts_speaking');
  }
  
  async ferniStartsSpeaking(): Promise<void> {
    await this.playBeat('ferni_starts_speaking');
  }
  
  async thinking(): Promise<void> {
    await this.playBeat('thinking');
  }
  
  async smallWin(message?: string): Promise<void> {
    await this.playBeat('small_win', { metadata: { message } });
  }
  
  async bigWin(message?: string): Promise<void> {
    await this.playBeat('big_win', { metadata: { message } });
  }
  
  async milestone(name: string): Promise<void> {
    await this.playBeat('milestone_reached', { metadata: { milestoneName: name } });
  }
  
  async breakthrough(): Promise<void> {
    await this.playBeat('breakthrough');
  }
  
  async empathyMoment(): Promise<void> {
    await this.playBeat('empathy_moment');
  }
  
  async personaHandoff(toId: PersonaId, toName?: string): Promise<void> {
    await this.playBeat('persona_handoff', {
      context: { personaId: toId },
      metadata: { personaId: toId, personaName: toName },
    });
  }
  
  async teamUnlock(personaId: PersonaId, personaName: string): Promise<void> {
    await this.playBeat('team_unlock', {
      metadata: { personaId, personaName },
    });
  }
  
  // ==========================================================================
  // TIME-AWARE GREETING
  // ==========================================================================
  
  /**
   * Play appropriate greeting based on context
   */
  async greeting(): Promise<void> {
    const context = this.currentContext;
    const timeOfDay = this.detectTimeOfDay();
    
    // Determine greeting beat
    let beat: StoryBeat;
    
    if (context.totalConversations === 0) {
      beat = 'first_launch';
    } else if (context.streakCount > 0) {
      beat = 'streak_continues';
    } else if (timeOfDay === 'morning') {
      beat = 'morning_greeting';
    } else if (timeOfDay === 'evening') {
      beat = 'evening_wind_down';
    } else if (timeOfDay === 'night') {
      beat = 'late_night';
    } else {
      beat = 'welcome_back';
    }
    
    await this.playBeat(beat);
  }
  
  // ==========================================================================
  // BEAT HISTORY
  // ==========================================================================
  
  /**
   * Get recent beats
   */
  getRecentBeats(count: number = 10): { beat: StoryBeat; timestamp: number }[] {
    return this.beatHistory.slice(-count);
  }
  
  /**
   * Check if beat was played recently
   */
  wasRecentlyPlayed(beat: StoryBeat, withinMs: number = 60000): boolean {
    const cutoff = Date.now() - withinMs;
    return this.beatHistory.some(b => b.beat === beat && b.timestamp > cutoff);
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let narrativeDirectorInstance: NarrativeDirector | null = null;

export function getNarrativeDirector(): NarrativeDirector {
  if (!narrativeDirectorInstance) {
    narrativeDirectorInstance = new NarrativeDirector();
  }
  return narrativeDirectorInstance;
}

export function resetNarrativeDirector(): void {
  narrativeDirectorInstance = null;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export const playBeat = (beat: StoryBeat, options?: Parameters<NarrativeDirector['playBeat']>[1]) =>
  getNarrativeDirector().playBeat(beat, options);

export const updateNarrativeContext = (updates: Partial<NarrativeContext>) =>
  getNarrativeDirector().updateContext(updates);

