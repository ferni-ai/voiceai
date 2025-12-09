/**
 * Communication Style Mirroring Engine
 *
 * Learns and mirrors the user's communication style:
 * - Formality level (casual ↔ professional)
 * - Energy/enthusiasm (calm ↔ animated)
 * - Vocabulary complexity
 * - Sentence length patterns
 * - Emoji/expression usage
 * - Question style preferences
 *
 * This creates subconscious rapport by speaking "their language"
 *
 * PERSISTENCE: Communication style data is persisted to Firestore via the
 * unified persistence layer to survive server restarts and improve over sessions.
 */

import { getLogger } from '../utils/safe-logger.js';
import { createPersistenceStore, type PersistenceStore } from '../services/persistence/index.js';

// ============================================================================
// TYPES
// ============================================================================

export type FormalityLevel = 'casual' | 'balanced' | 'professional';
export type EnergyLevel = 'calm' | 'moderate' | 'animated';
export type VocabularyLevel = 'simple' | 'moderate' | 'sophisticated';

export interface CommunicationStyle {
  // Core style
  formality: FormalityLevel;
  energy: EnergyLevel;
  vocabulary: VocabularyLevel;

  // Patterns
  avgSentenceLength: number;
  usesEmoji: boolean;
  usesExclamation: boolean;
  usesColloquialisms: boolean;
  usesSlang: boolean;

  // Preferences
  prefersDirect: boolean; // "What should I do?" vs "What are my options?"
  prefersStories: boolean; // Uses narrative in explanations
  prefersNumbers: boolean; // Data-driven responses

  // Detected phrases
  commonPhrases: string[]; // Frequently used expressions

  // Confidence
  confidence: number;
  sampleCount: number;
}

export interface StyleGuidance {
  formality: FormalityLevel;
  energy: EnergyLevel;
  vocabulary: VocabularyLevel;

  // Specific recommendations
  useEmoji: boolean;
  useExclamation: boolean;
  sentenceStyle: 'short' | 'medium' | 'long';

  // Tone guidance
  toneNote: string;

  // Phrases to mirror
  phrasesToMirror: string[];

  confidence: number;
}

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

const CASUAL_INDICATORS = [
  /\b(gonna|wanna|gotta|kinda|sorta|ya|yep|nope|hey|hi there|yo)\b/i,
  /\b(cool|awesome|sweet|nice|chill|dope|sick|lit)\b/i,
  /\b(stuff|thing|like)\b/i,
  /lol|haha|lmao|omg/i,
];

const PROFESSIONAL_INDICATORS = [
  /\b(regarding|concerning|therefore|however|furthermore|consequently)\b/i,
  /\b(appreciate|consideration|opportunity|perspective)\b/i,
  /\b(would you kindly|I would like to|at your earliest convenience)\b/i,
  /\b(utilize|implement|facilitate|leverage)\b/i,
];

const ANIMATED_INDICATORS = [
  /!/,
  /\b(love|amazing|incredible|fantastic|excited|thrilled)\b/i,
  /so +(good|great|excited|happy)/i,
  /can't wait|really really|super +\w+/i,
];

const CALM_INDICATORS = [
  /\b(perhaps|possibly|might|could|generally|typically)\b/i,
  /\.$/, // Ends with period (not ! or ?)
  /\b(steady|calm|peaceful|measured)\b/i,
];

const SOPHISTICATED_VOCAB = [
  /\b(portfolio|diversification|allocation|amortization|compound)\b/i,
  /\b(nuanced|comprehensive|strategically|fundamentally)\b/i,
  /\b(paradigm|synergy|optimize|metrics|leverage)\b/i,
];

const SIMPLE_VOCAB = [
  /\b(money|save|spend|buy|sell|good|bad|more|less)\b/i,
  /\b(help|need|want|get|make|do)\b/i,
];

const SLANG_PATTERNS = [
  /\b(tbh|imo|fwiw|idk|ngl|fr|lowkey|highkey|sus|bet|cap|no cap)\b/i,
  /\b(vibe|mood|flex|slay|goat|fire|based)\b/i,
];

const EMOJI_PATTERN = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;

const COLLOQUIALISM_PATTERNS = [
  /\b(you know|i mean|like|right|basically|honestly|literally)\b/i,
  /\b(at the end of the day|bottom line|no brainer)\b/i,
];

// ============================================================================
// PERSISTENCE TYPES
// ============================================================================

interface CommunicationStyleData {
  samples: MessageSample[];
  detectedPhrases: Record<string, number>;
  calculatedStyle: CommunicationStyle | null;
  updatedAt: string;
}

// ============================================================================
// COMMUNICATION MIRRORING ENGINE
// ============================================================================

export class CommunicationMirroringEngine {
  private samples: MessageSample[] = [];
  private detectedPhrases = new Map<string, number>();
  private userId: string;
  private persistenceStore: PersistenceStore<CommunicationStyleData> | null = null;
  private loaded = false;

  constructor(userId?: string, persistenceStore?: PersistenceStore<CommunicationStyleData>) {
    this.userId = userId || 'unknown';
    this.persistenceStore = persistenceStore || null;
    getLogger().debug('CommunicationMirroringEngine initialized');
  }

  /**
   * Load persisted communication style data
   */
  async loadFromPersistence(): Promise<void> {
    if (this.loaded || !this.persistenceStore) return;

    try {
      const data = await this.persistenceStore.load(this.userId);
      if (data) {
        this.samples = data.samples.map(s => ({
          ...s,
          timestamp: new Date(s.timestamp),
        }));
        this.detectedPhrases = new Map(Object.entries(data.detectedPhrases));
        getLogger().debug({ userId: this.userId }, 'Loaded communication style from persistence');
      }
      this.loaded = true;
    } catch (error) {
      getLogger().warn({ error, userId: this.userId }, 'Failed to load communication style');
    }
  }

  /**
   * Persist communication style data to Firestore
   */
  private persist(): void {
    if (!this.persistenceStore) return;

    const data: CommunicationStyleData = {
      samples: this.samples,
      detectedPhrases: Object.fromEntries(this.detectedPhrases),
      calculatedStyle: this.calculateStyle(),
      updatedAt: new Date().toISOString(),
    };

    this.persistenceStore.set(this.userId, data);
  }

  // ============================================================================
  // SAMPLE COLLECTION
  // ============================================================================

  /**
   * Analyze a user message and update style profile
   */
  async analyzeMessage(message: string): Promise<void> {
    // Ensure data is loaded from persistence
    if (!this.loaded) {
      await this.loadFromPersistence();
    }

    const sample = this.extractFeatures(message);
    this.samples.push(sample);

    // Keep last 50 samples
    if (this.samples.length > 50) {
      this.samples = this.samples.slice(-50);
    }

    // Track common phrases
    this.extractPhrases(message);

    // Persist to Firestore
    this.persist();

    getLogger().debug(
      {
        formality: sample.formality,
        energy: sample.energy,
        vocabulary: sample.vocabulary,
      },
      'Message style analyzed'
    );
  }

  private extractFeatures(message: string): MessageSample {
    const words = message.split(/\s+/);
    const sentences = message.split(/[.!?]+/).filter((s) => s.trim());

    // Formality detection
    let formalityScore = 0.5;
    for (const pattern of CASUAL_INDICATORS) {
      if (pattern.test(message)) formalityScore -= 0.1;
    }
    for (const pattern of PROFESSIONAL_INDICATORS) {
      if (pattern.test(message)) formalityScore += 0.15;
    }

    // Energy detection
    let energyScore = 0.5;
    for (const pattern of ANIMATED_INDICATORS) {
      if (pattern.test(message)) energyScore += 0.15;
    }
    for (const pattern of CALM_INDICATORS) {
      if (pattern.test(message)) energyScore -= 0.1;
    }

    // Vocabulary detection
    let vocabScore = 0.5;
    for (const pattern of SOPHISTICATED_VOCAB) {
      if (pattern.test(message)) vocabScore += 0.15;
    }
    for (const pattern of SIMPLE_VOCAB) {
      if (pattern.test(message)) vocabScore -= 0.05;
    }

    return {
      timestamp: new Date(),
      wordCount: words.length,
      avgSentenceLength: sentences.length > 0 ? words.length / sentences.length : words.length,
      formality: this.scoreToFormality(formalityScore),
      energy: this.scoreToEnergy(energyScore),
      vocabulary: this.scoreToVocab(vocabScore),
      hasEmoji: EMOJI_PATTERN.test(message),
      hasExclamation: message.includes('!'),
      hasColloquialisms: COLLOQUIALISM_PATTERNS.some((p) => p.test(message)),
      hasSlang: SLANG_PATTERNS.some((p) => p.test(message)),
      endsWithQuestion: message.trim().endsWith('?'),
    };
  }

  private scoreToFormality(score: number): FormalityLevel {
    if (score < 0.4) return 'casual';
    if (score > 0.65) return 'professional';
    return 'balanced';
  }

  private scoreToEnergy(score: number): EnergyLevel {
    if (score < 0.4) return 'calm';
    if (score > 0.65) return 'animated';
    return 'moderate';
  }

  private scoreToVocab(score: number): VocabularyLevel {
    if (score < 0.4) return 'simple';
    if (score > 0.65) return 'sophisticated';
    return 'moderate';
  }

  private extractPhrases(message: string): void {
    // Extract 2-3 word phrases
    const words = message.toLowerCase().split(/\s+/);
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      if (this.isInterestingPhrase(bigram)) {
        this.detectedPhrases.set(bigram, (this.detectedPhrases.get(bigram) || 0) + 1);
      }
    }
  }

  private isInterestingPhrase(phrase: string): boolean {
    // Skip common phrases, keep characteristic ones
    const skipPhrases = ['i am', 'it is', 'to be', 'of the', 'in the', 'on the'];
    if (skipPhrases.includes(phrase)) return false;
    if (phrase.length < 5) return false;
    return true;
  }

  // ============================================================================
  // STYLE CALCULATION
  // ============================================================================

  /**
   * Calculate overall communication style from samples
   */
  calculateStyle(): CommunicationStyle {
    if (this.samples.length === 0) {
      return this.getDefaultStyle();
    }

    // Aggregate formality votes
    const formalityCounts = { casual: 0, balanced: 0, professional: 0 };
    const energyCounts = { calm: 0, moderate: 0, animated: 0 };
    const vocabCounts = { simple: 0, moderate: 0, sophisticated: 0 };

    let totalSentenceLength = 0;
    let emojiCount = 0;
    let exclamationCount = 0;
    let colloquialCount = 0;
    let slangCount = 0;
    let questionCount = 0;

    for (const sample of this.samples) {
      formalityCounts[sample.formality]++;
      energyCounts[sample.energy]++;
      vocabCounts[sample.vocabulary]++;
      totalSentenceLength += sample.avgSentenceLength;
      if (sample.hasEmoji) emojiCount++;
      if (sample.hasExclamation) exclamationCount++;
      if (sample.hasColloquialisms) colloquialCount++;
      if (sample.hasSlang) slangCount++;
      if (sample.endsWithQuestion) questionCount++;
    }

    const n = this.samples.length;

    // Get most common phrases (used 2+ times)
    const commonPhrases = Array.from(this.detectedPhrases.entries())
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([phrase]) => phrase);

    return {
      formality: this.getMostCommon(formalityCounts) as FormalityLevel,
      energy: this.getMostCommon(energyCounts) as EnergyLevel,
      vocabulary: this.getMostCommon(vocabCounts) as VocabularyLevel,
      avgSentenceLength: totalSentenceLength / n,
      usesEmoji: emojiCount / n > 0.2,
      usesExclamation: exclamationCount / n > 0.3,
      usesColloquialisms: colloquialCount / n > 0.3,
      usesSlang: slangCount / n > 0.2,
      prefersDirect: questionCount / n > 0.4,
      prefersStories: false, // Would need deeper analysis
      prefersNumbers: false, // Would need deeper analysis
      commonPhrases,
      confidence: Math.min(0.5 + n * 0.05, 0.95),
      sampleCount: n,
    };
  }

  private getMostCommon<T extends string>(counts: Record<T, number>): T {
    let maxKey: T = Object.keys(counts)[0] as T;
    let maxCount = 0;
    for (const [key, count] of Object.entries(counts) as Array<[T, number]>) {
      if (count > maxCount) {
        maxCount = count;
        maxKey = key;
      }
    }
    return maxKey;
  }

  private getDefaultStyle(): CommunicationStyle {
    return {
      formality: 'balanced',
      energy: 'moderate',
      vocabulary: 'moderate',
      avgSentenceLength: 15,
      usesEmoji: false,
      usesExclamation: false,
      usesColloquialisms: false,
      usesSlang: false,
      prefersDirect: true,
      prefersStories: false,
      prefersNumbers: false,
      commonPhrases: [],
      confidence: 0.3,
      sampleCount: 0,
    };
  }

  // ============================================================================
  // GUIDANCE GENERATION
  // ============================================================================

  /**
   * Get guidance for mirroring user's style
   */
  getStyleGuidance(): StyleGuidance {
    const style = this.calculateStyle();

    // Determine sentence style
    let sentenceStyle: 'short' | 'medium' | 'long' = 'medium';
    if (style.avgSentenceLength < 10) sentenceStyle = 'short';
    else if (style.avgSentenceLength > 20) sentenceStyle = 'long';

    // Build tone note
    const toneNotes: string[] = [];

    if (style.formality === 'casual') {
      toneNotes.push('Keep it casual and friendly');
    } else if (style.formality === 'professional') {
      toneNotes.push('Maintain professional tone');
    }

    if (style.energy === 'animated') {
      toneNotes.push('match their enthusiasm');
    } else if (style.energy === 'calm') {
      toneNotes.push('stay measured and calm');
    }

    if (style.usesColloquialisms) {
      toneNotes.push('colloquial language is fine');
    }

    if (style.usesSlang) {
      toneNotes.push('modern slang works');
    }

    return {
      formality: style.formality,
      energy: style.energy,
      vocabulary: style.vocabulary,
      useEmoji: style.usesEmoji,
      useExclamation: style.usesExclamation,
      sentenceStyle,
      toneNote: toneNotes.join(', ') || 'Match natural conversational tone',
      phrasesToMirror: style.commonPhrases,
      confidence: style.confidence,
    };
  }

  /**
   * Format guidance for LLM prompt injection
   */
  formatGuidanceForPrompt(): string {
    const guidance = this.getStyleGuidance();
    const style = this.calculateStyle();

    if (style.sampleCount < 3) {
      return "[STYLE] Still learning user's communication style. Default to friendly, balanced tone.";
    }

    const lines: string[] = [];

    // Core style
    lines.push(`[STYLE] Mirror user's ${guidance.formality} tone with ${guidance.energy} energy.`);

    // Specific guidance
    const specifics: string[] = [];

    if (guidance.useEmoji) specifics.push('emoji ok');
    if (guidance.useExclamation) specifics.push('enthusiasm ok');
    if (guidance.sentenceStyle === 'short') specifics.push('keep sentences short');
    if (guidance.sentenceStyle === 'long') specifics.push('detailed sentences ok');

    if (specifics.length > 0) {
      lines.push(`Details: ${specifics.join(', ')}.`);
    }

    // Phrases to echo
    if (guidance.phrasesToMirror.length > 0) {
      lines.push(`User often says: "${guidance.phrasesToMirror.slice(0, 2).join('", "')}"`);
    }

    return lines.join(' ');
  }

  /**
   * Transform a response to match user's style
   */
  adaptResponse(response: string): string {
    const style = this.calculateStyle();

    if (style.sampleCount < 5) {
      return response; // Not enough data yet
    }

    let adapted = response;

    // Adjust formality
    if (style.formality === 'casual') {
      // Make more casual
      adapted = adapted
        .replace(/\bI would suggest\b/g, "I'd say")
        .replace(/\bperhaps\b/g, 'maybe')
        .replace(/\bregarding\b/g, 'about')
        .replace(/\bhowever\b/g, 'but')
        .replace(/\bfurthermore\b/g, 'also')
        .replace(/\bI understand\b/g, 'I get it');
    } else if (style.formality === 'professional') {
      // Make more formal
      adapted = adapted
        .replace(/\byeah\b/gi, 'yes')
        .replace(/\bgonna\b/gi, 'going to')
        .replace(/\bwanna\b/gi, 'want to')
        .replace(/\bgotta\b/gi, 'have to')
        .replace(/\bkinda\b/gi, 'somewhat');
    }

    // Adjust energy (exclamations)
    if (!style.usesExclamation && style.energy === 'calm') {
      // Reduce exclamations
      adapted = adapted.replace(/!/g, '.');
    }

    return adapted;
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  reset(): void {
    // Keep samples for cross-session learning
    getLogger().debug('CommunicationMirroringEngine session reset');
  }

  getStats() {
    const style = this.calculateStyle();
    return {
      sampleCount: this.samples.length,
      style: {
        formality: style.formality,
        energy: style.energy,
        vocabulary: style.vocabulary,
      },
      confidence: style.confidence,
    };
  }
}

// ============================================================================
// INTERNAL TYPES
// ============================================================================

interface MessageSample {
  timestamp: Date;
  wordCount: number;
  avgSentenceLength: number;
  formality: FormalityLevel;
  energy: EnergyLevel;
  vocabulary: VocabularyLevel;
  hasEmoji: boolean;
  hasExclamation: boolean;
  hasColloquialisms: boolean;
  hasSlang: boolean;
  endsWithQuestion: boolean;
}

// ============================================================================
// SINGLETON & PERSISTENCE
// ============================================================================

const engines = new Map<string, CommunicationMirroringEngine>();
let globalPersistenceStore: PersistenceStore<CommunicationStyleData> | null = null;
let isInitialized = false;

/**
 * Initialize communication mirroring persistence
 */
export async function initializeCommunicationMirroringPersistence(): Promise<void> {
  if (isInitialized) return;

  globalPersistenceStore = createPersistenceStore<CommunicationStyleData>({
    collection: 'communication_style',
    syncIntervalMs: 30000, // Sync every 30 seconds
    maxPendingChanges: 50,
  });

  isInitialized = true;
  getLogger().info('Communication mirroring persistence initialized');
}

/**
 * Shutdown communication mirroring persistence
 */
export async function shutdownCommunicationMirroringPersistence(): Promise<void> {
  if (globalPersistenceStore) {
    await globalPersistenceStore.flush();
    getLogger().info('Communication mirroring persistence shutdown complete');
  }
}

export function getCommunicationMirroring(userId: string): CommunicationMirroringEngine {
  if (!engines.has(userId)) {
    engines.set(userId, new CommunicationMirroringEngine(userId, globalPersistenceStore || undefined));
  }
  return engines.get(userId)!;
}

export function removeCommunicationMirroring(userId: string): void {
  engines.delete(userId);
}

/**
 * Clear all communication mirroring data for a user
 */
export async function clearCommunicationMirroringData(userId: string): Promise<void> {
  engines.delete(userId);
  if (globalPersistenceStore) {
    await globalPersistenceStore.delete(userId);
  }
}
