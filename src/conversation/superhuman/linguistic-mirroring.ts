/**
 * Linguistic Mirroring
 *
 * > "They just... get me."
 *
 * Subconsciously matches user's vocabulary, energy, and communication style.
 * Unlike humans who mirror awkwardly or inconsistently, we do it perfectly
 * and imperceptibly.
 *
 * Key capabilities:
 * - Vocabulary matching (their words, not ours)
 * - Energy/verbosity matching
 * - Metaphor domain adoption
 * - Formality calibration
 *
 * @module @ferni/superhuman/linguistic-mirroring
 */

import { seededChance, seededFloat, seededIndex, seededPick } from '../utils/random-generator.js';
import { createLogger } from '../../utils/safe-logger.js';
// 🦀 Rust-accelerated word counting
import { countWordsRust, isTokenCountingAvailable } from '../../memory/rust-accelerator.js';
import type { LinguisticProfile, MirroringApplication, MirroringResult } from './types.js';

const logger = createLogger({ module: 'LinguisticMirroring' });
const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_PROFILE: LinguisticProfile = {
  preferredTerms: new Map(),
  verbosityLevel: 'moderate',
  avgResponseLength: 50,
  metaphorDomains: [],
  comfortFillers: [],
  formalityLevel: 'balanced',
  usesContractions: true,
  sentenceComplexity: 'moderate',
  sampleCount: 0,
};

// Standard terms we might use → alternatives to detect in user speech
const TERM_VARIATIONS: Record<string, string[]> = {
  money: ['finances', 'cash', 'funds', 'bucks', 'dough', 'bread'],
  work: ['job', 'career', 'gig', 'hustle', 'occupation', 'profession'],
  problem: ['issue', 'challenge', 'situation', 'thing', 'stuff', 'deal'],
  worried: ['stressed', 'anxious', 'freaked out', 'nervous', 'concerned'],
  happy: ['glad', 'stoked', 'pumped', 'thrilled', 'excited', 'psyched'],
  thinking: ['pondering', 'mulling', 'considering', 'processing', 'chewing on'],
  understand: ['get it', 'follow', 'see', 'hear you', 'track'],
  difficult: ['hard', 'tough', 'rough', 'tricky', 'gnarly'],
  important: ['big', 'huge', 'major', 'serious', 'key'],
  children: ['kids', 'kiddos', 'little ones', 'children', 'youngsters'],
  spouse: ['partner', 'wife', 'husband', 'significant other', 'better half'],
};

// Metaphor domain keywords
const METAPHOR_DOMAINS: Record<string, string[]> = {
  sports: [
    'game',
    'score',
    'win',
    'team',
    'play',
    'coach',
    'goal',
    'tackle',
    'fumble',
    'slam dunk',
  ],
  nature: ['grow', 'bloom', 'root', 'branch', 'seed', 'harvest', 'weather', 'storm', 'sunshine'],
  journey: ['path', 'road', 'destination', 'milestone', 'crossroads', 'journey', 'step'],
  building: ['foundation', 'build', 'construct', 'blueprint', 'architect', 'framework'],
  war: ['battle', 'fight', 'strategy', 'attack', 'defense', 'victory', 'defeat', 'war'],
  music: ['rhythm', 'harmony', 'tune', 'note', 'vibe', 'beat', 'flow', 'jam'],
  food: ['digest', 'chew on', 'appetite', 'taste', 'flavor', 'recipe', 'ingredient'],
  water: ['flow', 'wave', 'deep', 'surface', 'drown', 'float', 'current', 'dive'],
};

// Comfort fillers to detect
const COMFORT_FILLERS = [
  'you know',
  'like',
  'I mean',
  'basically',
  'honestly',
  'literally',
  'actually',
  'kind of',
  'sort of',
  'right',
  'so',
  'anyway',
  'whatever',
];

// ============================================================================
// LINGUISTIC MIRRORING ENGINE
// ============================================================================

export class LinguisticMirroringEngine {
  private profile: LinguisticProfile;
  private userId: string;
  private messageSamples: string[] = [];

  constructor(userId: string, existingProfile?: Partial<LinguisticProfile>) {
    this.userId = userId;
    this.profile = {
      ...DEFAULT_PROFILE,
      preferredTerms: new Map(existingProfile?.preferredTerms || []),
      ...(existingProfile || {}),
    };
  }

  // ==========================================================================
  // LEARNING FROM USER
  // ==========================================================================

  /**
   * Analyze a user message to learn their linguistic patterns
   */
  analyzeMessage(message: string): void {
    this.messageSamples.push(message);
    this.profile.sampleCount++;

    // Learn vocabulary preferences
    this.learnVocabulary(message);

    // Learn verbosity
    this.learnVerbosity(message);

    // Learn metaphor domains
    this.learnMetaphorDomains(message);

    // Learn comfort fillers
    this.learnComfortFillers(message);

    // Learn formality
    this.learnFormality(message);

    // Learn contraction usage
    this.learnContractions(message);

    // Learn sentence complexity
    this.learnSentenceComplexity(message);

    logger.debug(
      {
        userId: this.userId,
        sampleCount: this.profile.sampleCount,
        verbosity: this.profile.verbosityLevel,
        formality: this.profile.formalityLevel,
      },
      '🪞 Linguistic pattern learned'
    );
  }

  // ==========================================================================
  // MIRRORING APPLICATION
  // ==========================================================================

  /**
   * Apply linguistic mirroring to a response
   */
  applyMirroring(response: string): MirroringResult {
    // Need enough samples to mirror effectively
    if (this.profile.sampleCount < 3) {
      return {
        mirroredResponse: response,
        appliedMirroring: [],
      };
    }

    let mirroredResponse = response;
    const appliedMirroring: MirroringApplication[] = [];

    // 1. Apply vocabulary mirroring
    const vocabResult = this.applyVocabularyMirroring(mirroredResponse);
    mirroredResponse = vocabResult.text;
    appliedMirroring.push(...vocabResult.applications);

    // 2. Apply contraction mirroring
    const contractionResult = this.applyContractionMirroring(mirroredResponse);
    mirroredResponse = contractionResult.text;
    appliedMirroring.push(...contractionResult.applications);

    // 3. Apply formality mirroring
    const formalityResult = this.applyFormalityMirroring(mirroredResponse);
    mirroredResponse = formalityResult.text;
    appliedMirroring.push(...formalityResult.applications);

    // 4. Add comfort fillers occasionally (if user uses them)
    const fillerResult = this.addComfortFillers(mirroredResponse);
    mirroredResponse = fillerResult.text;
    appliedMirroring.push(...fillerResult.applications);

    return {
      mirroredResponse,
      appliedMirroring,
    };
  }

  /**
   * Get energy-appropriate response length guidance
   */
  getResponseLengthGuidance(): { min: number; max: number; target: number } {
    const avg = this.profile.avgResponseLength;

    switch (this.profile.verbosityLevel) {
      case 'terse':
        return { min: 10, max: Math.max(40, avg * 1.2), target: Math.max(25, avg) };
      case 'verbose':
        return { min: avg * 0.8, max: avg * 1.5, target: avg * 1.1 };
      default:
        return { min: 30, max: 100, target: 60 };
    }
  }

  /**
   * Check if response energy matches user
   */
  checkEnergyMatch(
    response: string,
    userMessage: string
  ): { matches: boolean; suggestion?: string } {
    // 🦀 Rust-accelerated word counting
    const userWordCount = RUST_COUNTING_AVAILABLE
      ? countWordsRust(userMessage)
      : userMessage.split(/\s+/).length;
    const responseWordCount = RUST_COUNTING_AVAILABLE
      ? countWordsRust(response)
      : response.split(/\s+/).length;

    // If user is terse but response is long, suggest shortening
    if (this.profile.verbosityLevel === 'terse' && responseWordCount > userWordCount * 3) {
      return {
        matches: false,
        suggestion: 'Consider a shorter response to match user energy',
      };
    }

    // If user is verbose but response is short, might seem dismissive
    if (this.profile.verbosityLevel === 'verbose' && responseWordCount < userWordCount * 0.3) {
      return {
        matches: false,
        suggestion: 'Consider elaborating to match user engagement',
      };
    }

    return { matches: true };
  }

  // ==========================================================================
  // LEARNING METHODS
  // ==========================================================================

  private learnVocabulary(message: string): void {
    const messageLower = message.toLowerCase();

    for (const [standard, variations] of Object.entries(TERM_VARIATIONS)) {
      for (const variant of variations) {
        if (messageLower.includes(variant)) {
          this.profile.preferredTerms.set(standard, variant);
        }
      }
    }
  }

  private learnVerbosity(message: string): void {
    // 🦀 Rust-accelerated word counting
    const wordCount = RUST_COUNTING_AVAILABLE
      ? countWordsRust(message)
      : message.split(/\s+/).length;

    // Running average
    this.profile.avgResponseLength =
      (this.profile.avgResponseLength * (this.profile.sampleCount - 1) + wordCount) /
      this.profile.sampleCount;

    // Categorize
    if (this.profile.avgResponseLength < 20) {
      this.profile.verbosityLevel = 'terse';
    } else if (this.profile.avgResponseLength > 60) {
      this.profile.verbosityLevel = 'verbose';
    } else {
      this.profile.verbosityLevel = 'moderate';
    }
  }

  private learnMetaphorDomains(message: string): void {
    const messageLower = message.toLowerCase();

    for (const [domain, keywords] of Object.entries(METAPHOR_DOMAINS)) {
      for (const keyword of keywords) {
        if (messageLower.includes(keyword)) {
          if (!this.profile.metaphorDomains.includes(domain)) {
            this.profile.metaphorDomains.push(domain);
          }
          break;
        }
      }
    }

    // Keep top 3 domains
    this.profile.metaphorDomains = this.profile.metaphorDomains.slice(0, 3);
  }

  private learnComfortFillers(message: string): void {
    const messageLower = message.toLowerCase();

    for (const filler of COMFORT_FILLERS) {
      if (messageLower.includes(filler)) {
        if (!this.profile.comfortFillers.includes(filler)) {
          this.profile.comfortFillers.push(filler);
        }
      }
    }

    // Keep top 5 fillers
    this.profile.comfortFillers = this.profile.comfortFillers.slice(0, 5);
  }

  private learnFormality(message: string): void {
    const indicators = {
      casual: [
        /\b(gonna|wanna|gotta|kinda|sorta)\b/i,
        /\b(yeah|nah|nope|yep|yup)\b/i,
        /\b(cool|awesome|sweet|dope|sick)\b/i,
        /!{2,}/,
        /\blol\b/i,
        /\bhaha\b/i,
      ],
      formal: [
        /\b(would you|could you|may I|if you please)\b/i,
        /\b(certainly|indeed|furthermore|however|therefore)\b/i,
        /\b(apologize|appreciate|grateful)\b/i,
      ],
    };

    let casualScore = 0;
    let formalScore = 0;

    for (const pattern of indicators.casual) {
      if (pattern.test(message)) casualScore++;
    }

    for (const pattern of indicators.formal) {
      if (pattern.test(message)) formalScore++;
    }

    // Update formality level based on trend
    if (casualScore > formalScore + 1) {
      this.profile.formalityLevel = 'casual';
    } else if (formalScore > casualScore + 1) {
      this.profile.formalityLevel = 'formal';
    }
  }

  private learnContractions(message: string): void {
    const contractionPattern =
      /\b(I'm|you're|we're|they're|isn't|aren't|won't|can't|don't|didn't|couldn't|wouldn't|shouldn't)\b/i;
    const expandedPattern =
      /\b(I am|you are|we are|they are|is not|are not|will not|cannot|do not|did not|could not|would not|should not)\b/i;

    const hasContractions = contractionPattern.test(message);
    const hasExpanded = expandedPattern.test(message);

    if (hasContractions && !hasExpanded) {
      this.profile.usesContractions = true;
    } else if (hasExpanded && !hasContractions) {
      this.profile.usesContractions = false;
    }
  }

  private learnSentenceComplexity(message: string): void {
    const sentences = message.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length === 0) return;

    // 🦀 Rust-accelerated word counting
    const msgWordCount = RUST_COUNTING_AVAILABLE
      ? countWordsRust(message)
      : message.split(/\s+/).length;
    const avgWordsPerSentence = msgWordCount / sentences.length;

    // Check for complex constructions
    const complexIndicators = [
      /\b(although|whereas|nevertheless|furthermore|consequently)\b/i,
      /,\s*(which|who|that)\s/i,
      /;\s/,
    ];

    const hasComplexIndicators = complexIndicators.some((p) => p.test(message));

    if (avgWordsPerSentence < 10 && !hasComplexIndicators) {
      this.profile.sentenceComplexity = 'simple';
    } else if (avgWordsPerSentence > 20 || hasComplexIndicators) {
      this.profile.sentenceComplexity = 'complex';
    } else {
      this.profile.sentenceComplexity = 'moderate';
    }
  }

  // ==========================================================================
  // MIRRORING APPLICATION METHODS
  // ==========================================================================

  private applyVocabularyMirroring(text: string): {
    text: string;
    applications: MirroringApplication[];
  } {
    let result = text;
    const applications: MirroringApplication[] = [];

    for (const entry of Array.from(this.profile.preferredTerms.entries())) {
      const [standard, preferred] = entry;
      // Create regex that matches the standard term (word boundary)
      const regex = new RegExp(`\\b${standard}\\b`, 'gi');

      if (regex.test(result)) {
        const original = result;
        result = result.replace(regex, preferred);

        if (result !== original) {
          applications.push({
            type: 'vocabulary',
            original: standard,
            mirrored: preferred,
          });
        }
      }
    }

    return { text: result, applications };
  }

  private applyContractionMirroring(text: string): {
    text: string;
    applications: MirroringApplication[];
  } {
    let result = text;
    const applications: MirroringApplication[] = [];

    const contractionMap: Record<string, string> = {
      'I am': "I'm",
      'you are': "you're",
      'we are': "we're",
      'they are': "they're",
      'is not': "isn't",
      'are not': "aren't",
      'will not': "won't",
      'can not': "can't",
      'do not': "don't",
      'did not': "didn't",
      'could not': "couldn't",
      'would not': "wouldn't",
      'should not': "shouldn't",
      'it is': "it's",
      'that is': "that's",
      'there is': "there's",
      'here is': "here's",
    };

    // Create reverse map
    const expansionMap: Record<string, string> = {};
    for (const [expanded, contracted] of Object.entries(contractionMap)) {
      expansionMap[contracted] = expanded;
    }

    if (this.profile.usesContractions) {
      // User uses contractions - contract our response
      for (const [expanded, contracted] of Object.entries(contractionMap)) {
        const regex = new RegExp(`\\b${expanded}\\b`, 'gi');
        if (regex.test(result)) {
          const original = result;
          result = result.replace(regex, contracted);
          if (result !== original) {
            applications.push({
              type: 'formality',
              original: expanded,
              mirrored: contracted,
            });
          }
        }
      }
    } else {
      // User doesn't use contractions - expand ours
      for (const [contracted, expanded] of Object.entries(expansionMap)) {
        const regex = new RegExp(`\\b${contracted.replace("'", "'")}\\b`, 'gi');
        if (regex.test(result)) {
          const original = result;
          result = result.replace(regex, expanded);
          if (result !== original) {
            applications.push({
              type: 'formality',
              original: contracted,
              mirrored: expanded,
            });
          }
        }
      }
    }

    return { text: result, applications };
  }

  private applyFormalityMirroring(text: string): {
    text: string;
    applications: MirroringApplication[];
  } {
    let result = text;
    const applications: MirroringApplication[] = [];

    if (this.profile.formalityLevel === 'casual') {
      // Make more casual
      const casualizations: [RegExp, string][] = [
        [/\byes\b/gi, 'yeah'],
        [/\bno\b(?!\w)/gi, 'nah'],
        [/\bvery\b/gi, 'really'],
        [/\bperhaps\b/gi, 'maybe'],
        [/\bcertainly\b/gi, 'sure'],
        [/\bexcellent\b/gi, 'awesome'],
      ];

      for (const [pattern, replacement] of casualizations) {
        if (pattern.test(result) && seededChance(`${Date.now()}:512`, 0.5)) {
          const original = result;
          result = result.replace(pattern, replacement);
          if (result !== original) {
            applications.push({
              type: 'formality',
              original: pattern.source,
              mirrored: replacement,
            });
          }
        }
      }
    } else if (this.profile.formalityLevel === 'formal') {
      // Make more formal
      const formalizations: [RegExp, string][] = [
        [/\byeah\b/gi, 'yes'],
        [/\bnah\b/gi, 'no'],
        [/\bawesome\b/gi, 'excellent'],
        [/\bcool\b/gi, 'good'],
        [/\bgonna\b/gi, 'going to'],
        [/\bwanna\b/gi, 'want to'],
      ];

      for (const [pattern, replacement] of formalizations) {
        if (pattern.test(result)) {
          const original = result;
          result = result.replace(pattern, replacement);
          if (result !== original) {
            applications.push({
              type: 'formality',
              original: pattern.source,
              mirrored: replacement,
            });
          }
        }
      }
    }

    return { text: result, applications };
  }

  private addComfortFillers(text: string): { text: string; applications: MirroringApplication[] } {
    // Only if user uses fillers and we have samples
    if (this.profile.comfortFillers.length === 0 || !seededChance(`${Date.now()}:1`, 0.2)) {
      return { text, applications: [] };
    }

    const filler =
      seededPick(`${Date.now()}:filler`, this.profile.comfortFillers) ??
      this.profile.comfortFillers[0];

    // Don't double up fillers
    if (text.toLowerCase().includes(filler)) {
      return { text, applications: [] };
    }

    // Add filler naturally at sentence boundary
    const sentences = text.split(/(?<=[.!?])\s+/);
    if (sentences.length < 2) {
      return { text, applications: [] };
    }

    // Insert after first sentence occasionally
    const insertPoint = 1;
    const result = [
      sentences[0],
      `${filler.charAt(0).toUpperCase() + filler.slice(1)}, ${sentences.slice(insertPoint).join(' ').toLowerCase().charAt(0)}${sentences.slice(insertPoint).join(' ').slice(1)}`,
    ].join(' ');

    return {
      text: result,
      applications: [
        {
          type: 'energy',
          original: '',
          mirrored: filler,
        },
      ],
    };
  }

  // ==========================================================================
  // STATE ACCESS
  // ==========================================================================

  /**
   * Get current linguistic profile
   */
  getProfile(): LinguisticProfile {
    return {
      ...this.profile,
      preferredTerms: new Map(this.profile.preferredTerms),
    };
  }

  /**
   * Get preferred term for a standard term
   */
  getPreferredTerm(standard: string): string {
    return this.profile.preferredTerms.get(standard) || standard;
  }

  /**
   * Export for persistence
   */
  export(): Omit<LinguisticProfile, 'preferredTerms'> & { preferredTerms: [string, string][] } {
    return {
      ...this.profile,
      preferredTerms: Array.from(this.profile.preferredTerms.entries()),
    };
  }

  /**
   * Import from persistence
   */
  import(
    data: Omit<LinguisticProfile, 'preferredTerms'> & { preferredTerms: [string, string][] }
  ): void {
    this.profile = {
      ...data,
      preferredTerms: new Map(data.preferredTerms),
    };
  }

  /**
   * Reset
   */
  reset(): void {
    this.profile = { ...DEFAULT_PROFILE, preferredTerms: new Map() };
    this.messageSamples = [];
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const engines = new Map<string, LinguisticMirroringEngine>();

export function getLinguisticMirroring(
  userId: string,
  existingProfile?: Partial<LinguisticProfile>
): LinguisticMirroringEngine {
  if (!engines.has(userId)) {
    engines.set(userId, new LinguisticMirroringEngine(userId, existingProfile));
  }
  return engines.get(userId)!;
}

export function clearLinguisticMirroring(userId: string): void {
  engines.delete(userId);
}

export default LinguisticMirroringEngine;
