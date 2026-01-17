/**
 * Ferni Ritual Engine
 * 
 * Orchestrates multi-sensory brand moments that create emotional memories.
 * "A ritual is a moment that feels like it matters."
 * 
 * Integrates: Audio + Haptics + Glow + Celebration + Synesthesia
 * 
 * @module @ferni/ritual-engine
 */

import { createLogger } from '../utils/logger.js';
import { getFerniAudioEngine } from './ferni-audio.service.js';
import { getHapticsService } from './haptics.service.js';
import { getGlowController } from './glow-controller.service.js';
import { getCelebrationUI, CelebrationType } from '../ui/celebration.ui.js';

const log = createLogger('RitualEngine');

// ============================================================================
// TYPES
// ============================================================================

type PersonaId = 'ferni' | 'jack' | 'peter' | 'alex' | 'maya' | 'jordan' | 'nayan';

export type RitualType = 
  | 'app_wake'           // First app open of the day
  | 'connection_start'   // LiveKit connection established
  | 'connection_end'     // Session ending
  | 'first_words'        // First user speech detected
  | 'persona_entrance'   // New persona activated
  | 'persona_handoff'    // Handoff transition
  | 'small_win'          // Quick achievement
  | 'big_win'            // Major achievement
  | 'milestone'          // Significant progress
  | 'streak'             // Consistency reward
  | 'team_unlock'        // New team member available
  | 'deep_moment'        // Emotional breakthrough
  | 'thinking_of_you'    // Proactive outreach trigger
  | 'session_end';       // Wrapping up

export interface RitualContext {
  personaId?: PersonaId;
  personaName?: string;
  userName?: string;
  streakCount?: number;
  milestoneName?: string;
  message?: string;
  emotion?: string;
}

interface RitualStep {
  type: 'audio' | 'haptic' | 'glow' | 'visual' | 'delay';
  action: string;
  params?: Record<string, unknown>;
  delay?: number;
}

interface RitualSequence {
  id: RitualType;
  name: string;
  description: string;
  steps: RitualStep[];
  cooldown?: number;
}

// ============================================================================
// RITUAL SEQUENCES
// ============================================================================

const RITUAL_SEQUENCES: Record<RitualType, RitualSequence> = {
  app_wake: {
    id: 'app_wake',
    name: 'Morning Wake',
    description: 'The app breathing to life',
    steps: [
      { type: 'glow', action: 'startBreathing' },
      { type: 'audio', action: 'system.startup', delay: 100 },
      { type: 'haptic', action: 'warmWelcome', delay: 200 },
    ],
    cooldown: 3600000, // 1 hour
  },
  
  connection_start: {
    id: 'connection_start',
    name: 'Connection Established',
    description: 'We are connected',
    steps: [
      { type: 'audio', action: 'system.connectionSuccess' },
      { type: 'glow', action: 'pulse', params: { intensity: 1.2 } },
      { type: 'haptic', action: 'presence' },
    ],
  },
  
  connection_end: {
    id: 'connection_end',
    name: 'Session Farewell',
    description: 'Gentle goodbye',
    steps: [
      { type: 'audio', action: 'system.sessionEnd' },
      { type: 'haptic', action: 'goodbye', delay: 300 },
      { type: 'glow', action: 'fadeOut', params: { duration: 1000 } },
    ],
  },
  
  first_words: {
    id: 'first_words',
    name: 'First Words',
    description: 'User starts speaking',
    steps: [
      { type: 'glow', action: 'setListening', params: { isListening: true } },
      { type: 'haptic', action: 'softTap' },
    ],
  },
  
  persona_entrance: {
    id: 'persona_entrance',
    name: 'Persona Entrance',
    description: 'A persona arrives',
    steps: [
      { type: 'glow', action: 'switchPersona' },
      { type: 'audio', action: 'persona.{personaId}', delay: 100 },
      { type: 'haptic', action: 'persona_signature', delay: 150 },
    ],
  },
  
  persona_handoff: {
    id: 'persona_handoff',
    name: 'Persona Handoff',
    description: 'Transition between personas',
    steps: [
      { type: 'glow', action: 'fadeOut', params: { duration: 300 } },
      { type: 'delay', action: 'wait', params: { ms: 300 } },
      { type: 'audio', action: 'handoff.to{PersonaId}' },
      { type: 'glow', action: 'switchPersona' },
      { type: 'haptic', action: 'handoffBlend', delay: 200 },
    ],
  },
  
  small_win: {
    id: 'small_win',
    name: 'Small Win',
    description: 'Quick acknowledgment',
    steps: [
      { type: 'audio', action: 'celebration.small' },
      { type: 'haptic', action: 'success' },
      { type: 'glow', action: 'celebrate', params: { duration: 600 } },
      { type: 'visual', action: 'celebration', params: { type: 'small_win' } },
    ],
  },
  
  big_win: {
    id: 'big_win',
    name: 'Big Win',
    description: 'Major achievement celebration',
    steps: [
      { type: 'audio', action: 'celebration.big' },
      { type: 'haptic', action: 'celebration' },
      { type: 'glow', action: 'celebrate', params: { duration: 1200 } },
      { type: 'visual', action: 'celebration', params: { type: 'big_win' }, delay: 100 },
    ],
  },
  
  milestone: {
    id: 'milestone',
    name: 'Milestone',
    description: 'Significant progress marker',
    steps: [
      { type: 'audio', action: 'celebration.milestone' },
      { type: 'haptic', action: 'milestone' },
      { type: 'glow', action: 'celebrate', params: { duration: 1500 } },
      { type: 'visual', action: 'celebration', params: { type: 'milestone' }, delay: 200 },
    ],
  },
  
  streak: {
    id: 'streak',
    name: 'Streak Celebration',
    description: 'Consistency reward',
    steps: [
      { type: 'audio', action: 'celebration.streak' },
      { type: 'haptic', action: 'success' },
      { type: 'glow', action: 'celebrate', params: { duration: 800 } },
      { type: 'visual', action: 'streak', delay: 100 },
    ],
  },
  
  team_unlock: {
    id: 'team_unlock',
    name: 'Team Member Unlock',
    description: 'New persona available',
    steps: [
      { type: 'audio', action: 'celebration.teamUnlock' },
      { type: 'haptic', action: 'celebration' },
      { type: 'glow', action: 'celebrate', params: { duration: 1500 } },
      { type: 'visual', action: 'celebration', params: { type: 'team_unlock' }, delay: 200 },
    ],
  },
  
  deep_moment: {
    id: 'deep_moment',
    name: 'Deep Moment',
    description: 'Emotional breakthrough acknowledgment',
    steps: [
      { type: 'haptic', action: 'empathy' },
      { type: 'glow', action: 'pulse', params: { intensity: 0.8, duration: 2000 } },
      { type: 'audio', action: 'notification.gentle', delay: 500 },
    ],
  },
  
  thinking_of_you: {
    id: 'thinking_of_you',
    name: 'Thinking of You',
    description: 'Proactive no-agenda outreach',
    steps: [
      { type: 'audio', action: 'notification.thinkingOfYou' },
      { type: 'haptic', action: 'gentleNudge' },
      { type: 'glow', action: 'pulse', params: { intensity: 0.6 } },
    ],
  },
  
  session_end: {
    id: 'session_end',
    name: 'Session End',
    description: 'Wrapping up the conversation',
    steps: [
      { type: 'audio', action: 'system.sessionEnd' },
      { type: 'haptic', action: 'goodbye' },
      { type: 'glow', action: 'fadeOut', params: { duration: 1500 } },
    ],
  },
};

// ============================================================================
// RITUAL ENGINE
// ============================================================================

export class RitualEngine {
  private isInitialized: boolean = false;
  private lastTriggered: Map<RitualType, number> = new Map();
  private currentSequence: RitualType | null = null;
  
  // Services
  private audio = getFerniAudioEngine();
  private haptics = getHapticsService();
  private glow = getGlowController();
  private celebration = getCelebrationUI();
  
  constructor() {
    log.info('Ritual engine created');
  }
  
  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      // Initialize audio (requires user interaction)
      await this.audio.initialize();
      
      // Start breathing by default
      this.glow.startBreathing();
      
      this.isInitialized = true;
      log.info('Ritual engine initialized');
      
    } catch (error) {
      log.error('Failed to initialize ritual engine', error);
      throw error;
    }
  }
  
  // ==========================================================================
  // PUBLIC API
  // ==========================================================================
  
  /**
   * Trigger a ritual by type
   */
  async trigger(type: RitualType, context: RitualContext = {}): Promise<void> {
    const sequence = RITUAL_SEQUENCES[type];
    if (!sequence) {
      log.warn('Unknown ritual type', { type });
      return;
    }
    
    // Check cooldown
    if (sequence.cooldown) {
      const lastTime = this.lastTriggered.get(type) || 0;
      const now = Date.now();
      if (now - lastTime < sequence.cooldown) {
        log.debug('Ritual on cooldown', { type, remaining: sequence.cooldown - (now - lastTime) });
        return;
      }
    }
    
    // Prevent overlapping sequences for now
    if (this.currentSequence) {
      log.debug('Another ritual in progress', { current: this.currentSequence, requested: type });
      // Could queue here for future enhancement
    }
    
    this.currentSequence = type;
    this.lastTriggered.set(type, Date.now());
    
    log.info('Triggering ritual', { type, name: sequence.name });
    
    try {
      await this.executeSequence(sequence, context);
    } finally {
      this.currentSequence = null;
    }
  }
  
  /**
   * Quick helpers for common rituals
   */
  async appWake(): Promise<void> {
    await this.trigger('app_wake');
  }
  
  async connectionStart(): Promise<void> {
    await this.trigger('connection_start');
  }
  
  async connectionEnd(): Promise<void> {
    await this.trigger('connection_end');
  }
  
  async personaEntrance(personaId: PersonaId, personaName?: string): Promise<void> {
    await this.trigger('persona_entrance', { personaId, personaName });
  }
  
  async personaHandoff(_fromId: PersonaId, toId: PersonaId, toName?: string): Promise<void> {
    await this.trigger('persona_handoff', { personaId: toId, personaName: toName });
  }
  
  async smallWin(message?: string): Promise<void> {
    await this.trigger('small_win', { message });
  }
  
  async bigWin(message?: string): Promise<void> {
    await this.trigger('big_win', { message });
  }
  
  async milestone(name: string): Promise<void> {
    await this.trigger('milestone', { milestoneName: name });
  }
  
  async streak(count: number): Promise<void> {
    await this.trigger('streak', { streakCount: count });
  }
  
  async teamUnlock(personaId: PersonaId, personaName: string): Promise<void> {
    await this.trigger('team_unlock', { personaId, personaName });
  }
  
  async deepMoment(emotion?: string): Promise<void> {
    await this.trigger('deep_moment', { emotion });
  }
  
  async thinkingOfYou(): Promise<void> {
    await this.trigger('thinking_of_you');
  }
  
  // ==========================================================================
  // SEQUENCE EXECUTION
  // ==========================================================================
  
  private async executeSequence(sequence: RitualSequence, context: RitualContext): Promise<void> {
    for (const step of sequence.steps) {
      // Apply delay if specified
      if (step.delay && step.delay > 0) {
        await this.wait(step.delay);
      }
      
      // Execute step
      await this.executeStep(step, context);
    }
  }
  
  private async executeStep(step: RitualStep, context: RitualContext): Promise<void> {
    const action = this.interpolateAction(step.action, context);
    
    switch (step.type) {
      case 'audio':
        await this.executeAudioStep(action, step.params);
        break;
        
      case 'haptic':
        await this.executeHapticStep(action, context);
        break;
        
      case 'glow':
        await this.executeGlowStep(action, step.params, context);
        break;
        
      case 'visual':
        await this.executeVisualStep(action, step.params, context);
        break;
        
      case 'delay': {
        const ms = (step.params?.ms as number) || 0;
        await this.wait(ms);
        break;
      }
    }
  }
  
  private async executeAudioStep(soundId: string, params?: Record<string, unknown>): Promise<void> {
    try {
      await this.audio.play(soundId, {
        volume: params?.volume as number,
        fadeIn: params?.fadeIn as number,
      });
    } catch (error) {
      log.warn('Audio step failed', { soundId, error });
    }
  }
  
  private executeHapticStep(pattern: string, context: RitualContext): void {
    try {
      if (pattern === 'persona_signature' && context.personaId) {
        // TODO: Add persona-specific haptic signatures
        // For now, use warmWelcome as a generic persona entrance
        this.haptics.play('warmWelcome');
      } else {
        this.haptics.play(pattern);
      }
    } catch (error) {
      log.warn('Haptic step failed', { pattern, error });
    }
  }
  
  private executeGlowStep(
    action: string,
    params?: Record<string, unknown>,
    context?: RitualContext
  ): void {
    try {
      switch (action) {
        case 'startBreathing':
          this.glow.startBreathing();
          break;
          
        case 'stopAnimation':
          this.glow.stopAnimation();
          break;
          
        case 'switchPersona':
          if (context?.personaId) {
            this.glow.switchPersona(context.personaId, params?.duration as number);
          }
          break;
          
        case 'setSpeaking':
          this.glow.setSpeaking(params?.isSpeaking as boolean ?? true);
          break;
          
        case 'setListening':
          this.glow.setListening(params?.isListening as boolean ?? true);
          break;
          
        case 'setThinking':
          this.glow.setThinking(params?.isThinking as boolean ?? true);
          break;
          
        case 'celebrate':
          this.glow.celebrate(params?.duration as number);
          break;
          
        case 'pulse':
          this.glow.celebrate(params?.duration as number ?? 600);
          break;
          
        case 'fadeOut':
          this.glow.stopAnimation();
          break;
      }
    } catch (error) {
      log.warn('Glow step failed', { action, error });
    }
  }
  
  private async executeVisualStep(
    action: string,
    params?: Record<string, unknown>,
    context?: RitualContext
  ): Promise<void> {
    try {
      switch (action) {
        case 'celebration': {
          const celebrationType = params?.type as CelebrationType;
          await this.celebration.celebrate({
            type: celebrationType,
            title: context?.message,
          });
          break;
        }
          
        case 'streak':
          if (context?.streakCount) {
            await this.celebration.streak(context.streakCount);
          }
          break;
          
        case 'teamUnlock':
          if (context?.personaName) {
            await this.celebration.teamUnlock(context.personaName);
          }
          break;
      }
    } catch (error) {
      log.warn('Visual step failed', { action, error });
    }
  }
  
  // ==========================================================================
  // HELPERS
  // ==========================================================================
  
  private interpolateAction(action: string, context: RitualContext): string {
    let result = action;
    
    if (context.personaId) {
      result = result.replace('{personaId}', context.personaId);
      result = result.replace('{PersonaId}', this.capitalize(context.personaId));
    }
    
    return result;
  }
  
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // ==========================================================================
  // STATE
  // ==========================================================================
  
  isRunning(): boolean {
    return this.currentSequence !== null;
  }
  
  getCurrentRitual(): RitualType | null {
    return this.currentSequence;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let ritualEngineInstance: RitualEngine | null = null;

export function getRitualEngine(): RitualEngine {
  if (!ritualEngineInstance) {
    ritualEngineInstance = new RitualEngine();
  }
  return ritualEngineInstance;
}

export function resetRitualEngine(): void {
  ritualEngineInstance = null;
}

// ============================================================================
// APP LIFECYCLE INTEGRATION
// ============================================================================

/**
 * Wire ritual engine to app lifecycle events
 */
export function wireRitualEngineToApp(): void {
  const engine = getRitualEngine();
  
  // Listen for app events
  document.addEventListener('ferni:connected', () => {
    engine.connectionStart();
  });
  
  document.addEventListener('ferni:disconnected', () => {
    engine.connectionEnd();
  });
  
  document.addEventListener('ferni:switch-persona', (event: Event) => {
    const customEvent = event as CustomEvent<{ personaId: PersonaId; personaName?: string }>;
    const { personaId, personaName } = customEvent.detail;
    engine.personaEntrance(personaId, personaName);
  });
  
  document.addEventListener('ferni:handoff', (event: Event) => {
    const customEvent = event as CustomEvent<{ from: PersonaId; to: PersonaId; toName?: string }>;
    const { from, to, toName } = customEvent.detail;
    engine.personaHandoff(from, to, toName);
  });
  
  document.addEventListener('ferni:small-win', (event: Event) => {
    const customEvent = event as CustomEvent<{ message?: string }>;
    engine.smallWin(customEvent.detail?.message);
  });
  
  document.addEventListener('ferni:big-win', (event: Event) => {
    const customEvent = event as CustomEvent<{ message?: string }>;
    engine.bigWin(customEvent.detail?.message);
  });
  
  document.addEventListener('ferni:milestone', (event: Event) => {
    const customEvent = event as CustomEvent<{ name: string }>;
    engine.milestone(customEvent.detail.name);
  });
  
  document.addEventListener('ferni:streak', (event: Event) => {
    const customEvent = event as CustomEvent<{ count: number }>;
    engine.streak(customEvent.detail.count);
  });
  
  document.addEventListener('ferni:team-unlock', (event: Event) => {
    const customEvent = event as CustomEvent<{ personaId: PersonaId; personaName: string }>;
    const { personaId, personaName } = customEvent.detail;
    engine.teamUnlock(personaId, personaName);
  });
  
  document.addEventListener('ferni:deep-moment', (event: Event) => {
    const customEvent = event as CustomEvent<{ emotion?: string }>;
    engine.deepMoment(customEvent.detail?.emotion);
  });
  
  document.addEventListener('ferni:thinking-of-you', () => {
    engine.thinkingOfYou();
  });
  
  log.info('Ritual engine wired to app lifecycle');
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export const triggerRitual = (type: RitualType, context?: RitualContext) => 
  getRitualEngine().trigger(type, context);

export const appWake = () => getRitualEngine().appWake();
export const connectionStart = () => getRitualEngine().connectionStart();
export const connectionEnd = () => getRitualEngine().connectionEnd();
export const personaEntrance = (id: PersonaId, name?: string) => getRitualEngine().personaEntrance(id, name);
export const smallWin = (msg?: string) => getRitualEngine().smallWin(msg);
export const bigWin = (msg?: string) => getRitualEngine().bigWin(msg);
export const milestone = (name: string) => getRitualEngine().milestone(name);
export const streak = (count: number) => getRitualEngine().streak(count);
export const teamUnlock = (id: PersonaId, name: string) => getRitualEngine().teamUnlock(id, name);
export const deepMoment = (emotion?: string) => getRitualEngine().deepMoment(emotion);
export const thinkingOfYou = () => getRitualEngine().thinkingOfYou();

