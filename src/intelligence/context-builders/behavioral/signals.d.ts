/**
 * Behavioral Signals Type System
 *
 * This module defines the structured signals that context builders emit.
 * Instead of injecting raw context strings that might leak, builders
 * output behavioral signals that describe HOW the model should behave.
 *
 * PHILOSOPHY:
 * - Old: "Here's a fact. Don't say it, but use it." (prone to leakage)
 * - New: "Here's how to behave. Just do it." (nothing to leak)
 *
 * @module intelligence/context-builders/behavioral/signals
 */
/** Overall tone of the response */
export type ToneModifier = 'warm' | 'gentle' | 'grounding' | 'energetic' | 'serious' | 'playful' | 'contemplative' | 'celebratory' | 'encouraging' | 'direct' | 'curious';
/** Pace of the response */
export type PaceModifier = 'slow' | 'normal' | 'brisk';
/** Response length guidance */
export type LengthModifier = 'brief' | 'moderate' | 'expansive' | 'conversational';
/** Response depth guidance */
export type DepthModifier = 'surface' | 'moderate' | 'deep';
/** Emotional energy level */
export type EnergyModifier = 'subdued' | 'calm' | 'warm' | 'elevated' | 'high';
/** Primary conversational approach */
export type StyleModifier = 'listening' | 'exploratory' | 'supportive' | 'directive' | 'celebratory' | 'reflective' | 'grounding' | 'collaborative' | 'coaching' | 'challenging' | 'direct';
/** Question style within response */
export type QuestionStyle = 'none' | 'open' | 'reflective' | 'clarifying' | 'gentle-probe';
/**
 * Callback signals hint at things to reference WITHOUT exposing raw facts.
 * This prevents leakage of specific details.
 */
export interface CallbackSignal {
    /** Type of callback */
    type: 'memory' | 'thread' | 'milestone' | 'pattern' | 'shared-moment' | 'growth' | 'breakthrough' | 'suggestion' | 'avoidance' | 'trajectory' | 'prevention' | 'ripple' | 'leverage' | 'spiral' | 'proactive';
    /**
     * Natural language hint for weaving in.
     * This is a behavioral instruction, NOT the raw fact.
     *
     * GOOD: "They shared something difficult recently. Acknowledge with care."
     * BAD: "User mentioned divorce on Dec 15th with ex-wife Sarah"
     */
    hint: string;
    /** How strongly to consider referencing this */
    strength: 'subtle' | 'natural' | 'important' | 'gentle';
}
/**
 * Special modes that override normal behavior
 */
export interface SpecialModes {
    /** Just be present, don't try to fix or advise */
    holdingSpace?: boolean;
    /** Safety-first, grounding, resources available */
    crisisMode?: boolean;
    /** Acknowledge achievement, share in joy */
    celebrationMode?: boolean;
    /** Conversation is wrapping up or shifting */
    transitionMode?: boolean;
    /** User is venting - listen, don't solve */
    ventingMode?: boolean;
    /** Deep emotional processing - minimal intervention */
    processingMode?: boolean;
    /** User is close to a breakthrough - be the midwife, not the teacher */
    breakthroughMode?: boolean;
    /** Multiple domains stressed, risk of negative spiral */
    spiralRiskMode?: boolean;
}
/**
 * The complete behavioral signals that a context builder can emit.
 *
 * All fields are optional - only specify what's relevant.
 * The aggregator will merge signals from multiple builders.
 */
export interface BehavioralSignals {
    /** Overall tone of response */
    tone?: ToneModifier;
    /** Response pacing */
    pace?: PaceModifier;
    /** Response length guidance */
    length?: LengthModifier;
    /** Response depth guidance */
    depth?: DepthModifier;
    /** Energy level to match/project */
    energy?: EnergyModifier;
    /** Primary conversational approach */
    style?: StyleModifier;
    /** Question style (or none) */
    questionStyle?: QuestionStyle;
    /** Things to potentially weave in (hints, not facts) */
    callbacks?: CallbackSignal[];
    /** Topics or approaches to avoid */
    avoidances?: string[];
    /** Special behavioral modes */
    modes?: SpecialModes;
    /** Source builder name (for debugging) */
    source?: string;
    /** Confidence in these signals (0-1) */
    confidence?: number;
    /** Priority when aggregating (higher = more weight) */
    priority?: number;
}
import type { ContextBuilderInput } from '../core/types.js';
/**
 * A behavioral builder analyzes context and emits behavioral signals.
 *
 * Unlike the old ContextBuilder that emitted string injections,
 * this emits structured signals that can't leak.
 */
export interface BehavioralBuilder {
    /** Unique name */
    name: string;
    /** Human-readable description */
    description: string;
    /** Priority (0-100, lower runs first) */
    priority: number;
    /** Category for organization */
    category: string;
    /** The build function - returns behavioral signals */
    build: (input: ContextBuilderInput) => Promise<BehavioralSignals>;
}
/**
 * Create a callback signal with safe defaults
 */
export declare function createCallback(type: CallbackSignal['type'], hint: string, strength?: CallbackSignal['strength']): CallbackSignal;
/**
 * Create minimal "just be present" signals
 */
export declare function createPresenceSignals(): BehavioralSignals;
/**
 * Create celebratory signals
 */
export declare function createCelebrationSignals(): BehavioralSignals;
/**
 * Create crisis/grounding signals
 */
export declare function createCrisisSignals(): BehavioralSignals;
//# sourceMappingURL=signals.d.ts.map