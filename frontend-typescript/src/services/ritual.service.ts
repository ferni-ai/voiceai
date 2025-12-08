/**
 * Ferni Ritual Engine
 * 
 * Orchestrates meaningful brand moments through
 * predictable, emotional rituals.
 * 
 * @module @ferni/rituals
 */

import { createLogger } from '../utils/logger.js';
import { getRitualsByTrigger, getRitualById, RITUAL_REGISTRY } from './ritual.registry.js';
import { SPEECH_TEMPLATES } from './ritual.types.js';
import type {
  Ritual,
  RitualStep,
  RitualTrigger,
  RitualCondition,
  RitualExecutionState,
  RitualExecutionResult,
  RitualEngineConfig,
  SessionContext,
  WinContext,
  MilestoneContext,
  EmotionalContext,
  SpeechStep,
  VisualStep,
  AudioStep,
  HapticStep,
  PauseStep,
  BranchStep,
  ParallelStep,
  UIStep,
} from './ritual.types.js';

const log = createLogger('RitualEngine');

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: RitualEngineConfig = {
  enabled: true,
  audioVolume: 1,
  hapticsEnabled: true,
  speedMultiplier: 1,
  debug: false,
  experimentAssignments: {},
};

// ============================================================================
// EVENT TYPES
// ============================================================================

type RitualEventHandler<T = unknown> = (data: T) => void;

interface RitualEvents {
  'ritual:started': { ritual: Ritual; context: unknown };
  'ritual:step': { ritual: Ritual; step: RitualStep; index: number };
  'ritual:completed': { ritual: Ritual; result: RitualExecutionResult };
  'ritual:interrupted': { ritual: Ritual; reason: string };
  'ritual:error': { ritual: Ritual; error: Error };
}

// ============================================================================
// RITUAL ENGINE
// ============================================================================

export class RitualEngine {
  private config: RitualEngineConfig;
  private activeRituals: Map<string, RitualExecutionState> = new Map();
  private cooldowns: Map<string, number> = new Map();
  private eventHandlers: Map<string, RitualEventHandler[]> = new Map();
  
  // External service references (injected)
  private speechService?: { speak: (text: string, style?: string) => Promise<void> };
  private visualService?: { animate: (action: string, duration?: number, options?: unknown) => Promise<void> };
  private audioService?: { play: (sound: string, options?: { volume?: number }) => Promise<void> };
  private hapticsService?: { play: (pattern: string, options?: { intensity?: number }) => void };
  
  constructor(config: Partial<RitualEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    log.info('Ritual engine initialized', { enabled: this.config.enabled });
  }
  
  // ==========================================================================
  // SERVICE INJECTION
  // ==========================================================================
  
  /**
   * Inject external services for ritual execution
   */
  injectServices(services: {
    speech?: typeof this.speechService;
    visual?: typeof this.visualService;
    audio?: typeof this.audioService;
    haptics?: typeof this.hapticsService;
  }): void {
    if (services.speech) this.speechService = services.speech;
    if (services.visual) this.visualService = services.visual;
    if (services.audio) this.audioService = services.audio;
    if (services.haptics) this.hapticsService = services.haptics;
    
    log.debug('Services injected', {
      speech: !!this.speechService,
      visual: !!this.visualService,
      audio: !!this.audioService,
      haptics: !!this.hapticsService,
    });
  }
  
  // ==========================================================================
  // EVENT SYSTEM
  // ==========================================================================
  
  /**
   * Subscribe to ritual events
   */
  on<K extends keyof RitualEvents>(
    event: K,
    handler: RitualEventHandler<RitualEvents[K]>
  ): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler as RitualEventHandler);
    
    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler as RitualEventHandler);
        if (index > -1) handlers.splice(index, 1);
      }
    };
  }
  
  private emit<K extends keyof RitualEvents>(event: K, data: RitualEvents[K]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }
  
  // ==========================================================================
  // TRIGGER HANDLERS
  // ==========================================================================
  
  /**
   * Handle session start
   */
  async onSessionStart(context: SessionContext): Promise<void> {
    if (!this.config.enabled) return;
    
    log.debug('Session start trigger', { context });
    
    let trigger: RitualTrigger;
    if (context.isFirstEver) {
      trigger = 'session_start_first_ever';
    } else if (context.hoursSinceLastSession >= 24) {
      trigger = 'session_start_after_24h';
    } else {
      trigger = 'session_start';
    }
    
    await this.triggerRituals(trigger, context);
  }
  
  /**
   * Handle session end
   */
  async onSessionEnd(context: SessionContext): Promise<void> {
    if (!this.config.enabled) return;
    
    log.debug('Session end trigger');
    await this.triggerRituals('session_end', context);
  }
  
  /**
   * Handle win detection
   */
  async onWinDetected(win: WinContext): Promise<void> {
    if (!this.config.enabled) return;
    
    log.debug('Win detected trigger', { type: win.type, magnitude: win.magnitude });
    await this.triggerRituals('win_detected', win);
  }
  
  /**
   * Handle milestone reached
   */
  async onMilestoneReached(milestone: MilestoneContext): Promise<void> {
    if (!this.config.enabled) return;
    
    log.debug('Milestone trigger', { type: milestone.type, value: milestone.value });
    
    // Map milestone types to specific triggers
    const triggerMap: Record<string, RitualTrigger> = {
      stage_up: 'stage_up',
      team_unlock: 'team_unlock',
      conversation_count: 'conversation_milestone',
      streak: 'streak_achieved',
      anniversary: 'anniversary',
    };
    
    const trigger = triggerMap[milestone.type] || 'milestone_reached';
    await this.triggerRituals(trigger, milestone);
  }
  
  /**
   * Handle emotional content detection
   */
  async onEmotionalContent(emotional: EmotionalContext): Promise<void> {
    if (!this.config.enabled) return;
    
    log.debug('Emotional content trigger', { emotion: emotional.emotion, intensity: emotional.intensity });
    await this.triggerRituals('emotional_content_detected', emotional);
  }
  
  // ==========================================================================
  // CORE EXECUTION
  // ==========================================================================
  
  /**
   * Trigger rituals matching a trigger type
   */
  private async triggerRituals(trigger: RitualTrigger, context: unknown): Promise<void> {
    const candidates = getRitualsByTrigger(trigger);
    
    for (const ritual of candidates) {
      // Check cooldown
      if (this.isOnCooldown(ritual.id)) {
        log.debug('Ritual on cooldown', { id: ritual.id });
        continue;
      }
      
      // Check conditions
      if (!this.evaluateConditions(ritual.conditions, context)) {
        log.debug('Ritual conditions not met', { id: ritual.id });
        continue;
      }
      
      // Check if already running
      if (this.activeRituals.has(ritual.id)) {
        log.debug('Ritual already running', { id: ritual.id });
        continue;
      }
      
      // Execute the highest priority matching ritual
      await this.executeRitual(ritual, context);
      break; // Only execute one ritual per trigger
    }
  }
  
  /**
   * Execute a single ritual
   */
  async executeRitual(ritual: Ritual, context: unknown): Promise<RitualExecutionResult> {
    const startTime = Date.now();
    let stepsCompleted = 0;
    
    log.info('Starting ritual', { id: ritual.id, name: ritual.name });
    this.activeRituals.set(ritual.id, 'executing');
    this.emit('ritual:started', { ritual, context });
    
    try {
      for (let i = 0; i < ritual.sequence.length; i++) {
        const step = ritual.sequence[i];
        
        // Check if interrupted
        if (this.activeRituals.get(ritual.id) === 'interrupted') {
          log.info('Ritual interrupted', { id: ritual.id, step: i });
          return this.createResult(ritual, 'interrupted', startTime, stepsCompleted, true);
        }
        
        this.emit('ritual:step', { ritual, step, index: i });
        await this.executeStep(step, context);
        stepsCompleted++;
      }
      
      // Set cooldown
      if (ritual.cooldown) {
        this.setCooldown(ritual.id, ritual.cooldown);
      }
      
      const result = this.createResult(ritual, 'completed', startTime, stepsCompleted);
      this.emit('ritual:completed', { ritual, result });
      log.info('Ritual completed', { id: ritual.id, duration: result.endTime! - startTime });
      
      return result;
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('Ritual failed', { id: ritual.id, error: err.message });
      this.emit('ritual:error', { ritual, error: err });
      
      return this.createResult(ritual, 'failed', startTime, stepsCompleted, false, err);
      
    } finally {
      this.activeRituals.delete(ritual.id);
    }
  }
  
  /**
   * Execute a single step
   */
  private async executeStep(step: RitualStep, context: unknown): Promise<void> {
    // Apply delay if specified
    if (step.delay) {
      await this.sleep(step.delay);
    }
    
    switch (step.type) {
      case 'speech':
        await this.executeSpeechStep(step, context);
        break;
      case 'visual':
        await this.executeVisualStep(step);
        break;
      case 'audio':
        await this.executeAudioStep(step);
        break;
      case 'haptic':
        await this.executeHapticStep(step);
        break;
      case 'pause':
        await this.executePauseStep(step);
        break;
      case 'branch':
        await this.executeBranchStep(step, context);
        break;
      case 'parallel':
        await this.executeParallelStep(step, context);
        break;
      case 'ui':
        await this.executeUIStep(step);
        break;
    }
  }
  
  // ==========================================================================
  // STEP EXECUTORS
  // ==========================================================================
  
  private async executeSpeechStep(step: SpeechStep, context: unknown): Promise<void> {
    if (!this.speechService) {
      log.warn('Speech service not available');
      return;
    }
    
    // Get template or use literal text
    const template = SPEECH_TEMPLATES[step.template];
    let text: string;
    
    if (template) {
      // Pick random variant
      const variant = template.variants[Math.floor(Math.random() * template.variants.length)];
      // Replace variables
      text = this.interpolateVariables(variant, { ...step.variables, ...(context as Record<string, unknown>) });
    } else {
      text = step.template;
    }
    
    log.debug('Speaking', { text, style: step.style });
    await this.speechService.speak(text, step.style);
  }
  
  private async executeVisualStep(step: VisualStep): Promise<void> {
    if (!this.visualService) {
      log.warn('Visual service not available');
      return;
    }
    
    log.debug('Animating', { action: step.action, duration: step.duration });
    await this.visualService.animate(step.action, step.duration, { intensity: step.intensity });
  }
  
  private async executeAudioStep(step: AudioStep): Promise<void> {
    if (!this.audioService) {
      log.warn('Audio service not available');
      return;
    }
    
    const volume = (step.volume ?? 0) + (this.config.audioVolume - 1) * 6; // Adjust by config
    log.debug('Playing sound', { sound: step.sound, volume });
    await this.audioService.play(step.sound, { volume });
  }
  
  private async executeHapticStep(step: HapticStep): Promise<void> {
    if (!this.hapticsService || !this.config.hapticsEnabled) {
      log.debug('Haptics disabled or unavailable');
      return;
    }
    
    log.debug('Playing haptic', { pattern: step.pattern, intensity: step.intensity });
    this.hapticsService.play(step.pattern, { intensity: step.intensity });
  }
  
  private async executePauseStep(step: PauseStep): Promise<void> {
    const duration = step.duration / this.config.speedMultiplier;
    log.debug('Pausing', { duration });
    await this.sleep(duration);
  }
  
  private async executeBranchStep(step: BranchStep, context: unknown): Promise<void> {
    const conditionMet = this.evaluateCondition(step.condition, context);
    const steps = conditionMet ? step.then : (step.else || []);
    
    log.debug('Branch', { conditionMet, stepsCount: steps.length });
    
    for (const s of steps) {
      await this.executeStep(s, context);
    }
  }
  
  private async executeParallelStep(step: ParallelStep, context: unknown): Promise<void> {
    log.debug('Parallel execution', { count: step.steps.length });
    await Promise.all(step.steps.map(s => this.executeStep(s, context)));
  }
  
  private async executeUIStep(step: UIStep): Promise<void> {
    log.debug('UI step', { action: step.action, element: step.element });
    // UI steps are handled by emitting events that UI components listen to
    // This could dispatch to a UI service when implemented
  }
  
  // ==========================================================================
  // CONDITION EVALUATION
  // ==========================================================================
  
  private evaluateConditions(conditions: RitualCondition[] | undefined, context: unknown): boolean {
    if (!conditions || conditions.length === 0) return true;
    return conditions.every(c => this.evaluateCondition(c, context));
  }
  
  private evaluateCondition(condition: RitualCondition, context: unknown): boolean {
    const ctx = context as Record<string, unknown>;
    
    switch (condition.type) {
      case 'relationship_stage':
        return this.compareValue(
          this.stageToNumber(ctx.relationshipStage as string),
          this.stageToNumber(condition.stage),
          condition.operator
        );
        
      case 'conversation_count':
        return this.compareValue(
          ctx.conversationCount as number,
          condition.count,
          condition.operator
        );
        
      case 'days_since_first':
        return this.compareValue(
          ctx.daysSinceFirst as number,
          condition.days,
          condition.operator
        );
        
      case 'streak':
        return this.compareValue(
          ctx.currentStreak as number,
          condition.length,
          condition.operator
        );
        
      case 'persona':
        return ctx.currentPersona === condition.personaId;
        
      case 'time_of_day':
        return ctx.timeOfDay === condition.period;
        
      case 'emotion':
        return ctx.emotion === condition.emotion;
        
      case 'win_type':
        return ctx.type === condition.winType;
        
      case 'user_preference':
        return ctx[condition.key] === condition.value;
        
      case 'random':
        return Math.random() < condition.probability;
        
      case 'and':
        return condition.conditions.every(c => this.evaluateCondition(c, context));
        
      case 'or':
        return condition.conditions.some(c => this.evaluateCondition(c, context));
        
      case 'not':
        return !this.evaluateCondition(condition.condition, context);
        
      default:
        return false;
    }
  }
  
  // ==========================================================================
  // UTILITIES
  // ==========================================================================
  
  private compareValue(actual: number, expected: number, operator: 'eq' | 'gte' | 'lte'): boolean {
    switch (operator) {
      case 'eq': return actual === expected;
      case 'gte': return actual >= expected;
      case 'lte': return actual <= expected;
      default: return false;
    }
  }
  
  private stageToNumber(stage: string): number {
    const stages = ['first_meeting', 'getting_started', 'building_trust', 'established', 'deep_partnership'];
    return stages.indexOf(stage);
  }
  
  private interpolateVariables(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      return String(variables[key] ?? `{${key}}`);
    });
  }
  
  private isOnCooldown(ritualId: string): boolean {
    const cooldownEnd = this.cooldowns.get(ritualId);
    return cooldownEnd ? Date.now() < cooldownEnd : false;
  }
  
  private setCooldown(ritualId: string, duration: number): void {
    this.cooldowns.set(ritualId, Date.now() + duration);
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms / this.config.speedMultiplier));
  }
  
  private createResult(
    ritual: Ritual,
    state: RitualExecutionState,
    startTime: number,
    stepsCompleted: number,
    interrupted = false,
    error?: Error
  ): RitualExecutionResult {
    return {
      ritualId: ritual.id,
      state,
      startTime,
      endTime: Date.now(),
      stepsCompleted,
      totalSteps: ritual.sequence.length,
      interrupted,
      error,
    };
  }
  
  // ==========================================================================
  // PUBLIC CONTROL
  // ==========================================================================
  
  /**
   * Interrupt a running ritual
   */
  interrupt(ritualId: string, reason = 'user_interrupt'): void {
    if (this.activeRituals.has(ritualId)) {
      this.activeRituals.set(ritualId, 'interrupted');
      const ritual = getRitualById(ritualId);
      if (ritual) {
        this.emit('ritual:interrupted', { ritual, reason });
      }
      log.info('Ritual interrupted', { id: ritualId, reason });
    }
  }
  
  /**
   * Interrupt all running rituals
   */
  interruptAll(reason = 'user_interrupt'): void {
    for (const ritualId of this.activeRituals.keys()) {
      this.interrupt(ritualId, reason);
    }
  }
  
  /**
   * Update engine configuration
   */
  updateConfig(config: Partial<RitualEngineConfig>): void {
    this.config = { ...this.config, ...config };
    log.info('Config updated', { enabled: this.config.enabled });
  }
  
  /**
   * Get current config
   */
  getConfig(): RitualEngineConfig {
    return { ...this.config };
  }
  
  /**
   * Check if a ritual is currently running
   */
  isRitualRunning(ritualId?: string): boolean {
    if (ritualId) {
      return this.activeRituals.has(ritualId);
    }
    return this.activeRituals.size > 0;
  }
  
  /**
   * Get all registered rituals
   */
  getAllRituals(): Ritual[] {
    return [...RITUAL_REGISTRY];
  }
  
  /**
   * Clear all cooldowns (for testing)
   */
  clearCooldowns(): void {
    this.cooldowns.clear();
    log.debug('Cooldowns cleared');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let ritualEngineInstance: RitualEngine | null = null;

/**
 * Get the ritual engine singleton
 */
export function getRitualEngine(config?: Partial<RitualEngineConfig>): RitualEngine {
  if (!ritualEngineInstance) {
    ritualEngineInstance = new RitualEngine(config);
  }
  return ritualEngineInstance;
}

/**
 * Reset the ritual engine (for testing)
 */
export function resetRitualEngine(): void {
  ritualEngineInstance = null;
}

