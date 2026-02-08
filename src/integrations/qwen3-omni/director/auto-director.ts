/**
 * Auto-Director
 *
 * AI-assisted direction that analyzes conversation context and suggests
 * Director actions. Can operate in three modes:
 *
 * - **off**: No suggestions
 * - **suggest**: Generates suggestions, shown in Director Console
 * - **autopilot**: Auto-executes high-confidence suggestions
 *
 * Suggestions include:
 * - Persona switches ("Maya should chime in — user mentioned habit struggles")
 * - Mood changes ("Shift to 'supportive' — user showing vulnerability")
 * - Pacing adjustments ("Slow pace — user needs time to process")
 * - Ensemble changes ("Bring Nayan on — user asking deep life questions")
 *
 * Leverages existing systems:
 * - Predictive handoff triggers from predictive-handoff.ts
 * - Emotion detection from emotion-event-dispatcher.ts
 * - Cross-persona insights from cross-persona-insights.ts
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { v4 as uuidv4 } from 'uuid';

import type { DirectorEngine } from './director-engine.js';
import type {
  DirectorCommand,
  DirectorSuggestion,
  AutoDirectorMode,
  PersonaId,
  SceneMood,
} from './types.js';

const log = createLogger({ module: 'AutoDirector' });

// =============================================================================
// TYPES
// =============================================================================

/** Context about the current conversation turn */
export interface TurnAnalysisContext {
  /** User's transcript */
  userTranscript: string;
  /** Detected user emotion */
  userEmotion?: string;
  /** Emotion intensity (0-1) */
  emotionIntensity?: number;
  /** Detected topics/intents */
  topics?: readonly string[];
  /** Keywords found */
  keywords?: readonly string[];
  /** Current persona leading */
  currentLead: PersonaId;
  /** Turn number */
  turnCount: number;
  /** Session duration in minutes */
  sessionMinutes: number;
  /** Whether user seems engaged */
  engagementLevel?: 'high' | 'medium' | 'low';
}

/** Configuration for the AutoDirector */
export interface AutoDirectorConfig {
  /** Operating mode */
  mode: AutoDirectorMode;
  /** Minimum confidence to show suggestion (0-1) */
  minSuggestionConfidence: number;
  /** Minimum confidence for autopilot execution (0-1) */
  minAutopilotConfidence: number;
  /** Maximum suggestions to keep in queue */
  maxPendingSuggestions: number;
  /** Cooldown between similar suggestions (ms) */
  suggestionCooldownMs: number;
}

// =============================================================================
// DOMAIN TRIGGERS
// =============================================================================

/** Maps keywords/topics to persona suggestions */
interface DomainTrigger {
  readonly keywords: readonly RegExp[];
  readonly suggestedPersona: PersonaId;
  readonly reason: string;
  readonly baseConfidence: number;
}

const DOMAIN_TRIGGERS: readonly DomainTrigger[] = [
  {
    keywords: [/\b(habit|routine|streak|consistency|morning routine|sleep)\b/i],
    suggestedPersona: 'maya-santos',
    reason: 'User discussing habits — Maya specializes in habit coaching',
    baseConfidence: 0.7,
  },
  {
    keywords: [/\b(research|data|study|evidence|statistic|analysis)\b/i],
    suggestedPersona: 'peter-john',
    reason: 'User asking about data/research — Peter is the research specialist',
    baseConfidence: 0.65,
  },
  {
    keywords: [/\b(email|calendar|meeting|communicate|schedule|overwhelm)\b/i],
    suggestedPersona: 'alex-chen',
    reason: 'User discussing communication/scheduling — Alex brings clarity',
    baseConfidence: 0.65,
  },
  {
    keywords: [/\b(celebrate|party|event|milestone|birthday|anniversary|wedding)\b/i],
    suggestedPersona: 'jordan-taylor',
    reason: 'User discussing events/celebrations — Jordan excels at planning',
    baseConfidence: 0.7,
  },
  {
    keywords: [/\b(wisdom|meaning|purpose|philosophy|death|legacy|spiritual)\b/i],
    suggestedPersona: 'nayan-patel',
    reason: 'User exploring deep questions — Nayan offers philosophical wisdom',
    baseConfidence: 0.75,
  },
];

/** Maps emotional states to mood suggestions */
interface EmotionMoodMapping {
  readonly emotions: readonly string[];
  readonly suggestedMood: SceneMood;
  readonly suggestedPace: 'contemplative' | 'natural' | 'energized' | 'urgent';
  readonly reason: string;
  readonly baseConfidence: number;
}

const EMOTION_MOOD_MAPPINGS: readonly EmotionMoodMapping[] = [
  {
    emotions: ['grief', 'sad', 'lonely'],
    suggestedMood: 'vulnerable',
    suggestedPace: 'contemplative',
    reason: 'User showing sadness — shift to vulnerable, contemplative mood',
    baseConfidence: 0.8,
  },
  {
    emotions: ['anxious', 'fearful', 'overwhelmed'],
    suggestedMood: 'supportive',
    suggestedPace: 'contemplative',
    reason: 'User showing anxiety — shift to supportive, slower pace',
    baseConfidence: 0.8,
  },
  {
    emotions: ['excited', 'happy', 'grateful'],
    suggestedMood: 'celebratory',
    suggestedPace: 'energized',
    reason: 'User showing joy — match with celebratory energy',
    baseConfidence: 0.7,
  },
  {
    emotions: ['frustrated', 'angry'],
    suggestedMood: 'supportive',
    suggestedPace: 'natural',
    reason: 'User frustrated — be supportive without escalating',
    baseConfidence: 0.75,
  },
  {
    emotions: ['vulnerable'],
    suggestedMood: 'intimate',
    suggestedPace: 'contemplative',
    reason: 'User being vulnerable — create intimate safe space',
    baseConfidence: 0.85,
  },
];

// =============================================================================
// AUTO-DIRECTOR CLASS
// =============================================================================

export class AutoDirector {
  private readonly directorEngine: DirectorEngine;
  private config: AutoDirectorConfig;
  private recentSuggestions: Map<string, number> = new Map(); // type -> timestamp

  constructor(directorEngine: DirectorEngine, config?: Partial<AutoDirectorConfig>) {
    this.directorEngine = directorEngine;
    this.config = {
      mode: config?.mode ?? 'suggest',
      minSuggestionConfidence: config?.minSuggestionConfidence ?? 0.6,
      minAutopilotConfidence: config?.minAutopilotConfidence ?? 0.8,
      maxPendingSuggestions: config?.maxPendingSuggestions ?? 5,
      suggestionCooldownMs: config?.suggestionCooldownMs ?? 30000,
    };
  }

  // ===========================================================================
  // MAIN ANALYSIS
  // ===========================================================================

  /**
   * Analyze a conversation turn and generate Director suggestions.
   *
   * @param context - Current turn context
   * @returns Array of suggestions (may be empty)
   */
  async analyzeTurn(context: TurnAnalysisContext): Promise<DirectorSuggestion[]> {
    if (this.config.mode === 'off') return [];

    const suggestions: DirectorSuggestion[] = [];

    // Check domain triggers (persona switch suggestions)
    const domainSuggestions = this.checkDomainTriggers(context);
    suggestions.push(...domainSuggestions);

    // Check emotion-based mood suggestions
    const moodSuggestions = this.checkEmotionMoodTriggers(context);
    suggestions.push(...moodSuggestions);

    // Check engagement-based suggestions
    const engagementSuggestions = this.checkEngagementTriggers(context);
    suggestions.push(...engagementSuggestions);

    // Filter by confidence threshold
    const filtered = suggestions.filter((s) => s.confidence >= this.config.minSuggestionConfidence);

    // Filter by cooldown
    const cooledDown = filtered.filter((s) => this.checkCooldown(s));

    // Limit total suggestions
    const limited = cooledDown.slice(0, this.config.maxPendingSuggestions);

    // Submit to director engine
    for (const suggestion of limited) {
      await this.directorEngine.addSuggestion(suggestion);
      this.recordSuggestion(suggestion);
    }

    if (limited.length > 0) {
      log.debug(
        {
          turnCount: context.turnCount,
          suggestionsGenerated: limited.length,
          types: limited.map((s) => s.command.type),
        },
        'Auto-director suggestions generated'
      );
    }

    return limited;
  }

  // ===========================================================================
  // TRIGGER CHECKS
  // ===========================================================================

  private checkDomainTriggers(context: TurnAnalysisContext): DirectorSuggestion[] {
    const suggestions: DirectorSuggestion[] = [];
    const text = context.userTranscript.toLowerCase();

    for (const trigger of DOMAIN_TRIGGERS) {
      // Skip if this persona is already the lead
      if (trigger.suggestedPersona === context.currentLead) continue;

      // Check if any keywords match
      const matched = trigger.keywords.some((pattern) => pattern.test(text));
      if (!matched) continue;

      // Boost confidence if the persona is not on stage at all
      const actor = this.directorEngine.getActor(trigger.suggestedPersona);
      const isOnStage = actor?.isOnStage ?? false;

      const confidence = isOnStage
        ? trigger.baseConfidence * 0.6 // Lower confidence for "chime in" vs "bring on"
        : trigger.baseConfidence;

      const command: DirectorCommand = isOnStage
        ? {
            type: 'SET_LEAD',
            personaId: trigger.suggestedPersona,
            transition: 'smooth',
          }
        : {
            type: 'BRING_ON',
            personaId: trigger.suggestedPersona,
            entrance: 'chime-in',
          };

      suggestions.push({
        id: uuidv4(),
        command,
        reason: trigger.reason,
        confidence,
        priority: confidence > 0.75 ? 'high' : 'medium',
        timestamp: Date.now(),
      });
    }

    return suggestions;
  }

  private checkEmotionMoodTriggers(context: TurnAnalysisContext): DirectorSuggestion[] {
    if (!context.userEmotion) return [];

    const suggestions: DirectorSuggestion[] = [];
    const currentScene = this.directorEngine.getSceneState();

    for (const mapping of EMOTION_MOOD_MAPPINGS) {
      if (!mapping.emotions.includes(context.userEmotion)) continue;

      // Skip if mood is already set
      if (currentScene.mood === mapping.suggestedMood) continue;

      const intensity = context.emotionIntensity ?? 0.5;
      const confidence = mapping.baseConfidence * Math.max(0.5, intensity);

      suggestions.push({
        id: uuidv4(),
        command: {
          type: 'SET_MOOD',
          mood: mapping.suggestedMood,
          intensity: Math.min(1, intensity + 0.1),
          transition: 'fade',
        },
        reason: mapping.reason,
        confidence,
        priority: confidence > 0.75 ? 'high' : 'medium',
        timestamp: Date.now(),
      });

      // Also suggest pace change if different
      if (currentScene.pace !== mapping.suggestedPace) {
        suggestions.push({
          id: uuidv4(),
          command: {
            type: 'SET_PACE',
            pace: mapping.suggestedPace,
          },
          reason: `Adjust pace to ${mapping.suggestedPace} to match emotional state`,
          confidence: confidence * 0.9,
          priority: 'medium',
          timestamp: Date.now(),
        });
      }
    }

    return suggestions;
  }

  private checkEngagementTriggers(context: TurnAnalysisContext): DirectorSuggestion[] {
    const suggestions: DirectorSuggestion[] = [];

    // Low engagement: suggest changing something
    if (context.engagementLevel === 'low' && context.turnCount > 5) {
      // Suggest bringing someone new on
      const activePersonas = this.directorEngine.getActivePersonas();
      if (activePersonas.length === 1) {
        // Find a good persona to add
        const bestDomain = DOMAIN_TRIGGERS.find(
          (t) => !activePersonas.includes(t.suggestedPersona)
        );

        if (bestDomain) {
          suggestions.push({
            id: uuidv4(),
            command: {
              type: 'BRING_ON',
              personaId: bestDomain.suggestedPersona,
              entrance: 'observation',
            },
            reason: 'Engagement is low — a fresh perspective might help',
            confidence: 0.55,
            priority: 'low',
            timestamp: Date.now(),
          });
        }
      }
    }

    return suggestions;
  }

  // ===========================================================================
  // COOLDOWN MANAGEMENT
  // ===========================================================================

  private checkCooldown(suggestion: DirectorSuggestion): boolean {
    const key = `${suggestion.command.type}:${'personaId' in suggestion.command ? (suggestion.command as { personaId?: string }).personaId : 'scene'}`;
    const lastTime = this.recentSuggestions.get(key);

    if (lastTime && Date.now() - lastTime < this.config.suggestionCooldownMs) {
      return false; // Still in cooldown
    }

    return true;
  }

  private recordSuggestion(suggestion: DirectorSuggestion): void {
    const key = `${suggestion.command.type}:${'personaId' in suggestion.command ? (suggestion.command as { personaId?: string }).personaId : 'scene'}`;
    this.recentSuggestions.set(key, Date.now());
  }

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================

  setMode(mode: AutoDirectorMode): void {
    this.config = { ...this.config, mode };
    this.directorEngine.setAutoDirectorMode(mode);
    log.info({ mode }, 'Auto-director mode changed');
  }

  getMode(): AutoDirectorMode {
    return this.config.mode;
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  cleanup(): void {
    this.recentSuggestions.clear();
  }
}
