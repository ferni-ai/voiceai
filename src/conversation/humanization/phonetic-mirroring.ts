/**
 * Phonetic Style Mirroring
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Beyond vocabulary, mirror pronunciation patterns and casual speech forms.
 * When users say "gonna", agent says "gonna". When users say "going to",
 * agent says "going to". This creates subconscious rapport.
 *
 * **What we mirror:**
 * - Contractions vs. full forms (gonna/going to)
 * - Regional markers (y'all, you guys, folks)
 * - Filler preferences (um, uh, like)
 * - Tag questions (right?, you know?)
 *
 * @module @ferni/humanization/phonetic-mirroring
 */

import { createLogger } from '../../utils/safe-logger.js';

const logger = createLogger({ module: 'PhoneticMirroring' });

// ============================================================================
// TYPES
// ============================================================================

export interface PhoneticProfile {
  /** Contraction style detected */
  contractionStyle: 'full' | 'contracted' | 'reduced' | 'mixed';

  /** Uses casual reductions (gonna, wanna) */
  usesReductions: boolean;

  /** Specific reductions detected */
  detectedReductions: string[];

  /** Regional markers detected */
  regionalMarkers: string[];

  /** Preferred filler sounds */
  fillerPreference: 'um' | 'uh' | 'like' | 'you know' | 'none';

  /** Uses tag questions */
  usesTagQuestions: boolean;

  /** Tag question style */
  tagQuestionStyle: string[];

  /** Sample count for confidence */
  sampleCount: number;

  /** Confidence in profile (0-1) */
  confidence: number;
}

export interface PhoneticMirroringConfig {
  /** Minimum samples before mirroring */
  minSamples: number;

  /** How aggressively to mirror (0-1) */
  mirroringStrength: number;

  /** Enable reduction mirroring */
  mirrorReductions: boolean;

  /** Enable regional marker mirroring */
  mirrorRegional: boolean;

  /** Enable tag question mirroring */
  mirrorTagQuestions: boolean;
}

// ============================================================================
// REDUCTION PATTERNS
// ============================================================================

/**
 * Formal -> Casual reductions
 */
const REDUCTION_PATTERNS: Record<
  string,
  {
    formal: string;
    casual: string;
    regex: RegExp;
  }
> = {
  gonna: {
    formal: 'going to',
    casual: 'gonna',
    regex: /\b(gonna|going to)\b/gi,
  },
  wanna: {
    formal: 'want to',
    casual: 'wanna',
    regex: /\b(wanna|want to)\b/gi,
  },
  gotta: {
    formal: 'got to|have to',
    casual: 'gotta',
    regex: /\b(gotta|got to|have to)\b/gi,
  },
  hafta: {
    formal: 'have to',
    casual: 'hafta',
    regex: /\b(hafta|have to)\b/gi,
  },
  kinda: {
    formal: 'kind of',
    casual: 'kinda',
    regex: /\b(kinda|kind of)\b/gi,
  },
  sorta: {
    formal: 'sort of',
    casual: 'sorta',
    regex: /\b(sorta|sort of)\b/gi,
  },
  lotta: {
    formal: 'lot of',
    casual: 'lotta',
    regex: /\b(lotta|lot of)\b/gi,
  },
  outta: {
    formal: 'out of',
    casual: 'outta',
    regex: /\b(outta|out of)\b/gi,
  },
  cuz: {
    formal: 'because',
    casual: 'cuz',
    regex: /\b(cuz|because)\b/gi,
  },
  prolly: {
    formal: 'probably',
    casual: 'prolly',
    regex: /\b(prolly|probably)\b/gi,
  },
  dunno: {
    formal: "don't know",
    casual: 'dunno',
    regex: /\b(dunno|don't know)\b/gi,
  },
  lemme: {
    formal: 'let me',
    casual: 'lemme',
    regex: /\b(lemme|let me)\b/gi,
  },
  gimme: {
    formal: 'give me',
    casual: 'gimme',
    regex: /\b(gimme|give me)\b/gi,
  },
};

/**
 * Regional markers
 */
const REGIONAL_MARKERS: Record<
  string,
  {
    pattern: RegExp;
    alternatives: string[];
    region?: string;
  }
> = {
  yall: {
    pattern: /\b(y'all|yall)\b/gi,
    alternatives: ['you all', 'you guys'],
    region: 'Southern US',
  },
  you_guys: {
    pattern: /\byou guys\b/gi,
    alternatives: ['you all', "y'all"],
    region: 'Northern/Western US',
  },
  folks: {
    pattern: /\bfolks\b/gi,
    alternatives: ['people', 'everyone'],
    region: 'General',
  },
  reckon: {
    pattern: /\breckon\b/gi,
    alternatives: ['think', 'suppose'],
    region: 'Southern US/UK',
  },
  ain: {
    pattern: /\bain't\b/gi,
    alternatives: ["isn't", "aren't", "haven't"],
    region: 'Casual/Regional',
  },
};

/**
 * Filler patterns
 */
const FILLER_PATTERNS = {
  um: /\bum+\b/gi,
  uh: /\buh+\b/gi,
  like: /\blike\b/gi, // As filler, not comparison
  'you know': /\byou know\b/gi,
  'I mean': /\bI mean\b/gi,
};

/**
 * Tag question patterns
 */
const TAG_QUESTION_PATTERNS = [
  /,\s*right\?/gi,
  /,\s*yeah\?/gi,
  /,\s*you know\?/gi,
  /,\s*isn't it\?/gi,
  /,\s*don't you think\?/gi,
  /,\s*huh\?/gi,
];

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: PhoneticMirroringConfig = {
  minSamples: 3,
  mirroringStrength: 0.7,
  mirrorReductions: true,
  mirrorRegional: true,
  mirrorTagQuestions: true,
};

// ============================================================================
// PHONETIC MIRRORING ENGINE
// ============================================================================

export class PhoneticMirroringEngine {
  private profile: PhoneticProfile;
  private config: PhoneticMirroringConfig;
  private messageHistory: string[] = [];

  constructor(config: Partial<PhoneticMirroringConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.profile = this.createInitialProfile();
    logger.debug('PhoneticMirroringEngine initialized');
  }

  /**
   * Analyze a user message and update profile
   */
  analyzeMessage(message: string): void {
    this.messageHistory.push(message);

    // Keep last 20 messages
    if (this.messageHistory.length > 20) {
      this.messageHistory.shift();
    }

    // Rebuild profile from all messages
    this.rebuildProfile();
  }

  /**
   * Get current phonetic profile
   */
  getProfile(): PhoneticProfile {
    return { ...this.profile };
  }

  /**
   * Apply phonetic mirroring to response
   */
  mirror(response: string): { text: string; appliedMirrorings: string[] } {
    const appliedMirrorings: string[] = [];

    // Check if we have enough samples
    if (this.profile.sampleCount < this.config.minSamples) {
      return { text: response, appliedMirrorings };
    }

    let result = response;

    // Mirror reductions
    if (this.config.mirrorReductions && this.profile.usesReductions) {
      for (const reduction of this.profile.detectedReductions) {
        const pattern = REDUCTION_PATTERNS[reduction];
        if (pattern && Math.random() < this.config.mirroringStrength) {
          // Replace formal with casual
          const before = result;
          result = result.replace(new RegExp(`\\b${pattern.formal}\\b`, 'gi'), pattern.casual);
          if (result !== before) {
            appliedMirrorings.push(`reduction:${reduction}`);
          }
        }
      }
    }

    // Mirror regional markers
    if (this.config.mirrorRegional && this.profile.regionalMarkers.length > 0) {
      for (const marker of this.profile.regionalMarkers) {
        const pattern = REGIONAL_MARKERS[marker];
        if (pattern && Math.random() < this.config.mirroringStrength) {
          // Replace alternatives with the user's marker
          for (const alt of pattern.alternatives) {
            const before = result;
            result = result.replace(
              new RegExp(`\\b${alt}\\b`, 'gi'),
              marker === 'yall' ? "y'all" : marker
            );
            if (result !== before) {
              appliedMirrorings.push(`regional:${marker}`);
              break;
            }
          }
        }
      }
    }

    // Add tag questions occasionally
    if (
      this.config.mirrorTagQuestions &&
      this.profile.usesTagQuestions &&
      Math.random() < this.config.mirroringStrength * 0.3
    ) {
      // Only add to statements (end with period)
      if (result.trim().endsWith('.')) {
        const tagStyle = this.profile.tagQuestionStyle[0] || 'right?';
        result = result.trim().slice(0, -1) + ', ' + tagStyle;
        appliedMirrorings.push(`tag_question:${tagStyle}`);
      }
    }

    if (appliedMirrorings.length > 0) {
      logger.debug(
        {
          appliedMirrorings,
          profileConfidence: this.profile.confidence,
        },
        '🔊 Phonetic mirroring applied'
      );
    }

    return { text: result, appliedMirrorings };
  }

  /**
   * Check if user uses a specific reduction
   */
  usesReduction(reduction: string): boolean {
    return this.profile.detectedReductions.includes(reduction);
  }

  /**
   * Get user's filler preference
   */
  getFillerPreference(): string | null {
    return this.profile.fillerPreference === 'none' ? null : this.profile.fillerPreference;
  }

  /**
   * Reset engine
   */
  reset(): void {
    this.profile = this.createInitialProfile();
    this.messageHistory = [];
    logger.debug('PhoneticMirroringEngine reset');
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private createInitialProfile(): PhoneticProfile {
    return {
      contractionStyle: 'mixed',
      usesReductions: false,
      detectedReductions: [],
      regionalMarkers: [],
      fillerPreference: 'none',
      usesTagQuestions: false,
      tagQuestionStyle: [],
      sampleCount: 0,
      confidence: 0,
    };
  }

  private rebuildProfile(): void {
    const allText = this.messageHistory.join(' ');
    const profile = this.createInitialProfile();

    // Detect reductions
    for (const [name, pattern] of Object.entries(REDUCTION_PATTERNS)) {
      if (pattern.regex.test(allText)) {
        // Check if they use casual form
        if (new RegExp(`\\b${pattern.casual}\\b`, 'gi').test(allText)) {
          profile.usesReductions = true;
          profile.detectedReductions.push(name);
        }
      }
    }

    // Detect regional markers
    for (const [name, pattern] of Object.entries(REGIONAL_MARKERS)) {
      if (pattern.pattern.test(allText)) {
        profile.regionalMarkers.push(name);
      }
    }

    // Detect filler preference
    const fillerCounts: Record<string, number> = {};
    for (const [name, pattern] of Object.entries(FILLER_PATTERNS)) {
      const matches = allText.match(pattern);
      fillerCounts[name] = matches?.length || 0;
    }

    const topFiller = Object.entries(fillerCounts)
      .sort((a, b) => b[1] - a[1])
      .find(([_, count]) => count >= 2);

    if (topFiller) {
      profile.fillerPreference = topFiller[0] as PhoneticProfile['fillerPreference'];
    }

    // Detect tag questions
    for (const pattern of TAG_QUESTION_PATTERNS) {
      const matches = allText.match(pattern);
      if (matches && matches.length > 0) {
        profile.usesTagQuestions = true;
        // Extract the tag style
        const tag = matches[0].replace(/^,\s*/, '');
        if (!profile.tagQuestionStyle.includes(tag)) {
          profile.tagQuestionStyle.push(tag);
        }
      }
    }

    // Detect contraction style
    const hasContractions = /\b(don't|won't|can't|it's|that's|I'm|you're)\b/i.test(allText);
    const hasFull = /\b(do not|will not|can not|it is|that is|I am|you are)\b/i.test(allText);
    const hasReductions = profile.usesReductions;

    if (hasReductions) {
      profile.contractionStyle = 'reduced';
    } else if (hasContractions && !hasFull) {
      profile.contractionStyle = 'contracted';
    } else if (hasFull && !hasContractions) {
      profile.contractionStyle = 'full';
    } else {
      profile.contractionStyle = 'mixed';
    }

    // Calculate confidence
    profile.sampleCount = this.messageHistory.length;
    profile.confidence = Math.min(1, profile.sampleCount / 10);

    // Boost confidence if we found strong signals
    if (profile.detectedReductions.length >= 2) profile.confidence += 0.1;
    if (profile.regionalMarkers.length >= 1) profile.confidence += 0.1;
    if (profile.usesTagQuestions) profile.confidence += 0.05;

    profile.confidence = Math.min(1, profile.confidence);

    this.profile = profile;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

const engines = new Map<string, PhoneticMirroringEngine>();

export function getPhoneticMirroringEngine(sessionId: string): PhoneticMirroringEngine {
  if (!engines.has(sessionId)) {
    engines.set(sessionId, new PhoneticMirroringEngine());
  }
  return engines.get(sessionId)!;
}

export function resetPhoneticMirroringEngine(sessionId: string): void {
  const engine = engines.get(sessionId);
  if (engine) {
    engine.reset();
    engines.delete(sessionId);
  }
}

export function resetAllPhoneticMirroringEngines(): void {
  engines.clear();
}

export default PhoneticMirroringEngine;
