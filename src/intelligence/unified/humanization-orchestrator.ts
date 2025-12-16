/**
 * Humanization Orchestrator
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This is the SINGLE system that makes Ferni feel alive.
 * No more scattered humanizing logic - one orchestrator that handles:
 * - Active listening cues
 * - Emotional mirroring
 * - Spontaneous elements (when appropriate)
 * - Personal touches based on relationship stage
 *
 * The key insight: In high-emotion moments, we REDUCE humanization features
 * and focus purely on presence. The user needs us, not our personality.
 *
 * @module intelligence/unified/humanization-orchestrator
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { PersonaConfig } from '../../personas/types.js';
import type { UnifiedAnalysisResult } from './unified-analyzer.js';

const log = createLogger({ module: 'HumanizationOrchestrator' });

// ============================================================================
// TYPES
// ============================================================================

export interface HumanizationInput {
  /** The unified analysis result */
  analysis: UnifiedAnalysisResult;

  /** Current persona */
  persona: PersonaConfig;

  /** Turn number */
  turnNumber: number;

  /** Session count with this user */
  sessionCount: number;

  /** User's name (if known) */
  userName?: string;

  /** Recent topics discussed */
  recentTopics: string[];

  /** Relationship stage */
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'close_friend' | 'trusted';
}

/**
 * Active listening cue - shows we're present
 */
export interface ActiveListeningCue {
  /** Type of listening cue */
  type: 'reflection' | 'validation' | 'clarification' | 'encouragement';

  /** The cue itself */
  content: string;

  /** When to use it */
  timing: 'before_response' | 'during_response' | 'after_response';
}

/**
 * Emotional mirror - matching their state
 */
export interface EmotionalMirror {
  /** The emotional state to mirror */
  emotion: string;

  /** How to express it */
  expression: string;

  /** Intensity (0-1) */
  intensity: number;
}

/**
 * Spontaneous element - makes us feel alive
 * Only used when NOT in high-emotion mode
 */
export interface SpontaneousElement {
  /** Type of spontaneous element */
  type: 'thought' | 'callback' | 'observation' | 'humor' | 'vulnerability';

  /** The content */
  content: string;

  /** Whether to use it (probability already applied) */
  shouldUse: boolean;
}

export interface HumanizationResult {
  /** Active listening cues to incorporate */
  activeListening: ActiveListeningCue[];

  /** How to mirror their emotional state */
  emotionalMirror: EmotionalMirror;

  /** Spontaneous elements (only if not high-emotion) */
  spontaneousElements: SpontaneousElement[];

  /** Response tone guidance */
  toneGuidance: string;

  /** Response length guidance */
  lengthGuidance: { min: number; max: number; note: string };

  /** Name usage guidance */
  nameUsage: { shouldUse: boolean; frequency: 'once' | 'twice' | 'natural' };

  /** Whether to skip most humanization (high-emotion mode) */
  focusedSupportMode: boolean;

  /** Pre-formatted injection for prompt */
  promptInjection: string;
}

// ============================================================================
// HUMANIZATION ORCHESTRATOR CLASS
// ============================================================================

export class HumanizationOrchestrator {
  private static instance: HumanizationOrchestrator | null = null;

  static getInstance(): HumanizationOrchestrator {
    if (!HumanizationOrchestrator.instance) {
      HumanizationOrchestrator.instance = new HumanizationOrchestrator();
    }
    return HumanizationOrchestrator.instance;
  }

  /**
   * Generate humanization guidance for a response
   */
  humanize(input: HumanizationInput): HumanizationResult {
    const { analysis, persona, turnNumber, sessionCount, userName, relationshipStage } = input;

    // Check if we should use focused support mode (high-emotion situations)
    const focusedSupportMode = this.shouldUseFocusedSupportMode(analysis);

    // Build active listening cues
    const activeListening = this.buildActiveListeningCues(analysis, focusedSupportMode);

    // Build emotional mirror
    const emotionalMirror = this.buildEmotionalMirror(analysis);

    // Build spontaneous elements (only if not in focused support mode)
    const spontaneousElements = focusedSupportMode
      ? []
      : this.buildSpontaneousElements(
          analysis,
          persona,
          turnNumber,
          sessionCount,
          relationshipStage
        );

    // Build tone guidance
    const toneGuidance = this.buildToneGuidance(analysis, focusedSupportMode);

    // Build length guidance
    const lengthGuidance = this.buildLengthGuidance(analysis);

    // Build name usage guidance
    const nameUsage = this.buildNameUsageGuidance(userName, turnNumber, focusedSupportMode);

    // Build prompt injection
    const promptInjection = this.buildPromptInjection({
      activeListening,
      emotionalMirror,
      spontaneousElements,
      toneGuidance,
      lengthGuidance,
      nameUsage,
      focusedSupportMode,
      analysis,
    });

    log.debug(
      {
        focusedSupportMode,
        activeListeningCount: activeListening.length,
        spontaneousCount: spontaneousElements.filter((e) => e.shouldUse).length,
        emotionMirror: emotionalMirror.emotion,
      },
      '💫 Humanization generated'
    );

    return {
      activeListening,
      emotionalMirror,
      spontaneousElements,
      toneGuidance,
      lengthGuidance,
      nameUsage,
      focusedSupportMode,
      promptInjection,
    };
  }

  // ============================================================================
  // CORE METHODS
  // ============================================================================

  private shouldUseFocusedSupportMode(analysis: UnifiedAnalysisResult): boolean {
    return Boolean(
      analysis.guidance.useHighEmotionMode ||
      analysis.emotion.distressLevel > 0.6 ||
      (analysis.mismatch.detected && analysis.mismatch.type === 'masking_negative') ||
      analysis.signals.needsSupport
    );
  }

  private buildActiveListeningCues(
    analysis: UnifiedAnalysisResult,
    focusedSupportMode: boolean
  ): ActiveListeningCue[] {
    const cues: ActiveListeningCue[] = [];

    // In focused support mode, simpler cues
    if (focusedSupportMode) {
      if (analysis.signals.isVenting) {
        cues.push({
          type: 'validation',
          content: 'Validate their feelings first. Let them know their feelings make sense.',
          timing: 'before_response',
        });
      } else {
        cues.push({
          type: 'reflection',
          content: 'Reflect back what you heard. Show you understand.',
          timing: 'before_response',
        });
      }
      return cues;
    }

    // Normal mode - more varied cues

    // Reflection cues based on context
    if (analysis.signals.isPersonalSharing) {
      cues.push({
        type: 'reflection',
        content:
          'Acknowledge what they shared. "What you said about..." or "The way you described..."',
        timing: 'before_response',
      });
    }

    // Validation for emotional content
    if (analysis.emotion.intensity > 0.5) {
      cues.push({
        type: 'validation',
        content: `Their ${analysis.emotion.primary} feeling is valid. Name it gently.`,
        timing: 'during_response',
      });
    }

    // Clarification for complex topics
    if (analysis.context.topics.length > 2) {
      cues.push({
        type: 'clarification',
        content: 'Ask a clarifying question to show engagement with the complexity.',
        timing: 'after_response',
      });
    }

    // Encouragement for decisions
    if (analysis.signals.madeDecision) {
      cues.push({
        type: 'encouragement',
        content: 'Affirm their decision. They did the hard work of deciding.',
        timing: 'during_response',
      });
    }

    return cues;
  }

  private buildEmotionalMirror(analysis: UnifiedAnalysisResult): EmotionalMirror {
    // If mismatch detected, mirror the VOICE emotion (the true one)
    if (analysis.mismatch.detected) {
      return {
        emotion: analysis.mismatch.voiceEmotion,
        expression: `Mirror their underlying ${analysis.mismatch.voiceEmotion} with gentleness`,
        intensity: Math.min(0.6, analysis.emotion.intensity), // Don't overwhelm
      };
    }

    // Otherwise mirror the detected emotion
    const emotionMirrors: Record<string, string> = {
      joy: 'Share in their happiness. Let warmth come through.',
      sadness: 'Be present with them. Slow down. Show you care.',
      anger: 'Validate the injustice they feel. Be an ally.',
      fear: 'Provide calm, steady presence. Reassure without dismissing.',
      anxiety: 'Ground them. Slow pace. Steady voice.',
      anticipation: 'Match their excitement. Build on their energy.',
      neutral: 'Be warm and engaged. Create comfortable space.',
    };

    return {
      emotion: analysis.emotion.primary,
      expression: emotionMirrors[analysis.emotion.primary] || emotionMirrors.neutral,
      intensity: analysis.emotion.intensity,
    };
  }

  private buildSpontaneousElements(
    analysis: UnifiedAnalysisResult,
    persona: PersonaConfig,
    turnNumber: number,
    sessionCount: number,
    relationshipStage: string
  ): SpontaneousElement[] {
    const elements: SpontaneousElement[] = [];

    // Only add spontaneous elements if:
    // 1. Not high emotion
    // 2. Not early in conversation (turn > 3)
    // 3. Relationship has developed
    if (turnNumber < 3) {
      return elements;
    }

    // Spontaneous thought (5% chance)
    if (Math.random() < 0.05 && sessionCount > 1 && persona.identity.id) {
      elements.push({
        type: 'thought',
        content: this.getPersonaThought(persona.identity.id),
        shouldUse: true,
      });
    }

    // Callback to previous topic (10% chance, only with returning users)
    if (Math.random() < 0.1 && sessionCount > 2 && analysis.context.topicsToCircleBack.length > 0) {
      elements.push({
        type: 'callback',
        content: `Consider referencing: "${analysis.context.topicsToCircleBack[0]}"`,
        shouldUse: true,
      });
    }

    // Light humor (3% chance, only with established relationships)
    if (Math.random() < 0.03 && relationshipStage !== 'stranger' && analysis.emotion.valence > 0) {
      elements.push({
        type: 'humor',
        content: 'A light, warm moment of humor could fit here.',
        shouldUse: true,
      });
    }

    // Persona vulnerability (2% chance, only with trusted relationships)
    if (
      Math.random() < 0.02 &&
      (relationshipStage === 'close_friend' || relationshipStage === 'trusted')
    ) {
      elements.push({
        type: 'vulnerability',
        content: 'Could share a small personal moment if relevant.',
        shouldUse: true,
      });
    }

    return elements;
  }

  private getPersonaThought(personaId: string): string {
    const thoughts: Record<string, string[]> = {
      ferni: [
        'Something my therapist said years ago just came to mind...',
        'I was journaling this morning and this thought kept coming up...',
        'You know what I was thinking about earlier?',
      ],
      'nayan-patel': [
        'You know, I was just thinking about something my father told me...',
        "I've been re-reading some old notes and...",
        'That reminds me of something...',
      ],
      'peter-john': [
        'I was at the mall yesterday and noticed something interesting...',
        'My daughter mentioned something that made me think...',
        'You know what gets me excited about this?',
      ],
      'maya-santos': [
        'I was looking at my own patterns this morning and...',
        'My grandmother used to say something about this...',
        'I had a similar moment recently...',
      ],
    };

    const personaThoughts = thoughts[personaId] || thoughts.ferni;
    return personaThoughts[Math.floor(Math.random() * personaThoughts.length)];
  }

  private buildToneGuidance(analysis: UnifiedAnalysisResult, focusedSupportMode: boolean): string {
    if (focusedSupportMode) {
      return 'Gentle, present, unhurried. Your presence matters more than your words.';
    }

    const toneMap: Record<string, string> = {
      gentle: 'Soft, caring, unhurried. Create safe space.',
      warm: 'Friendly, engaged, personal. Like talking to a good friend.',
      enthusiastic: 'Energetic, excited, celebratory. Match their joy!',
      calm: 'Measured, steady, grounding. Provide stability.',
      serious: 'Thoughtful, considered, respectful. This matters.',
      reassuring: "Confident, supportive, hopeful. You're not alone.",
    };

    return toneMap[analysis.emotion.suggestedTone] || toneMap.warm;
  }

  private buildLengthGuidance(analysis: UnifiedAnalysisResult): {
    min: number;
    max: number;
    note: string;
  } {
    const base = analysis.guidance.responseLength;

    if (analysis.signals.isRushed) {
      return { ...base, note: 'User is rushed. Be concise.' };
    }

    if (analysis.signals.isVenting) {
      return { min: 20, max: 50, note: 'User is venting. Listen more than speak.' };
    }

    if (analysis.signals.seekingAdvice && !analysis.signals.needsSupport) {
      return { min: 40, max: 120, note: 'User wants substance. Can be thorough.' };
    }

    return { ...base, note: 'Natural conversational length.' };
  }

  private buildNameUsageGuidance(
    userName: string | undefined,
    turnNumber: number,
    focusedSupportMode: boolean
  ): { shouldUse: boolean; frequency: 'once' | 'twice' | 'natural' } {
    if (!userName) {
      return { shouldUse: false, frequency: 'natural' };
    }

    // In focused support mode, name can be powerful but sparingly
    if (focusedSupportMode) {
      return { shouldUse: turnNumber > 1, frequency: 'once' };
    }

    // Don't overuse in general
    if (turnNumber < 3) {
      return { shouldUse: false, frequency: 'natural' };
    }

    return { shouldUse: Math.random() < 0.3, frequency: 'natural' };
  }

  private buildPromptInjection(params: {
    activeListening: ActiveListeningCue[];
    emotionalMirror: EmotionalMirror;
    spontaneousElements: SpontaneousElement[];
    toneGuidance: string;
    lengthGuidance: { min: number; max: number; note: string };
    nameUsage: { shouldUse: boolean; frequency: 'once' | 'twice' | 'natural' };
    focusedSupportMode: boolean;
    analysis: UnifiedAnalysisResult;
  }): string {
    const {
      activeListening,
      emotionalMirror,
      spontaneousElements,
      toneGuidance,
      lengthGuidance,
      nameUsage,
      focusedSupportMode,
      analysis,
    } = params;

    const sections: string[] = [];

    // FOCUSED SUPPORT MODE: Minimal, presence-focused
    if (focusedSupportMode) {
      sections.push('[HUMANIZATION - FOCUSED SUPPORT MODE]');
      sections.push('Your presence matters more than your words right now.');
      sections.push('');
      sections.push(`Tone: ${toneGuidance}`);
      sections.push(`Mirror: ${emotionalMirror.expression}`);
      if (activeListening.length > 0) {
        sections.push(`First: ${activeListening[0].content}`);
      }
      sections.push('');
      sections.push('Keep response focused and unhurried. No jokes, no tangents.');
      return sections.join('\n');
    }

    // NORMAL MODE: Full humanization
    sections.push('[HUMANIZATION]');

    // Emotional mirroring
    sections.push(`Emotional Mirror: ${emotionalMirror.expression}`);

    // Tone
    sections.push(`Tone: ${toneGuidance}`);

    // Active listening
    if (activeListening.length > 0) {
      const beforeCues = activeListening.filter((c) => c.timing === 'before_response');
      if (beforeCues.length > 0) {
        sections.push(`Before responding: ${beforeCues.map((c) => c.content).join('; ')}`);
      }
    }

    // Length
    sections.push(
      `Length: ${lengthGuidance.min}-${lengthGuidance.max} words. ${lengthGuidance.note}`
    );

    // Name usage
    if (nameUsage.shouldUse) {
      sections.push('Use their name naturally once.');
    }

    // Spontaneous elements
    const usableElements = spontaneousElements.filter((e) => e.shouldUse);
    if (usableElements.length > 0) {
      sections.push('');
      sections.push('Optional human touches:');
      for (const element of usableElements) {
        sections.push(`- [${element.type}] ${element.content}`);
      }
    }

    return sections.join('\n');
  }
}

// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================

/**
 * Quick humanization function - use for single calls
 */
export function humanize(input: HumanizationInput): HumanizationResult {
  return HumanizationOrchestrator.getInstance().humanize(input);
}

export default HumanizationOrchestrator;
