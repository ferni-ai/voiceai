/**
 * Pronunciation Memory System
 *
 * Captures and maintains consistent pronunciation of:
 * - User names (from introductions)
 * - Technical terms (domain-specific vocabulary)
 * - Proper nouns (places, companies, people)
 *
 * Integrates with SSML to inject phonetic hints via:
 * - "Sounds-like" replacements (e.g., "Siobhan" → "Shi-vawn")
 * - IPA phoneme tags (for precise control)
 * - Context-aware pronunciation selection
 *
 * @see docs/features/VOICE-PRESENCE-ROADMAP.md
 */

import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export type PronunciationSource =
  | 'user_introduction' // User said "I'm Siobhan"
  | 'user_correction' // User corrected us "It's pronounced..."
  | 'context_inference' // Inferred from domain (technical, medical, etc.)
  | 'phonetic_pattern' // Applied linguistic rules
  | 'default'; // Standard pronunciation

export interface PronunciationEntry {
  /** The word/term as written */
  text: string;

  /** Phonetic representation (sounds-like or IPA) */
  phonetic: string;

  /** Type of phonetic representation */
  phoneticType: 'sounds_like' | 'ipa';

  /** How we learned this pronunciation */
  source: PronunciationSource;

  /** Optional context (e.g., "medical", "name", "place") */
  context?: string;

  /** Confidence in this pronunciation (0-1) */
  confidence: number;

  /** When this was learned */
  learnedAt: Date;

  /** Number of times used */
  useCount: number;
}

export interface PronunciationMemoryState {
  /** Session ID */
  sessionId: string;

  /** User's name pronunciation */
  userName?: PronunciationEntry;

  /** Other learned pronunciations */
  entries: Map<string, PronunciationEntry>;

  /** Names that commonly need pronunciation help */
  commonDifficultNames: Map<string, string>;
}

// ============================================================================
// COMMON DIFFICULT NAME PRONUNCIATIONS
// ============================================================================

/**
 * Names that are commonly mispronounced.
 * Format: lowercase canonical → sounds-like
 */
const COMMON_DIFFICULT_NAMES: Record<string, string> = {
  // Irish names
  siobhan: 'Shi-vawn',
  niamh: 'Neev',
  caoimhe: 'Kee-va',
  aoife: 'Ee-fa',
  saoirse: 'Seer-sha',
  oisin: 'Oh-sheen',
  cillian: 'Kill-ee-an',
  sean: 'Shawn',
  sinead: 'Shi-nayd',

  // Welsh names
  llywelyn: 'Hloo-well-in',
  rhiannon: 'Ree-ann-on',
  gwyneth: 'Gwin-eth',
  cerys: 'Kerr-iss',

  // French-origin names
  genevieve: 'Zhen-uh-veev',
  margaux: 'Mar-go',
  beaumont: 'Bo-mont',
  guillaume: 'Ghee-yome',

  // Greek names
  persephone: 'Per-seff-oh-nee',
  hermione: 'Her-my-oh-nee',
  iphigenia: 'If-ih-jeh-nye-uh',

  // Hebrew names
  tzvi: 'Tsvee',
  yael: 'Yah-el',
  rivka: 'Riv-kah',

  // Indian names (common patterns)
  priya: 'Pree-yah',
  aishwarya: 'Eye-shwar-ya',
  vaishnavi: 'Vysh-nah-vee',
  srinivas: 'Shree-nee-vas',

  // Chinese names (common Romanizations)
  xiaoming: 'Shyow-ming',
  qiang: 'Chee-ahng',
  xiu: 'Shyoo',

  // Japanese names
  ryuichi: 'Ryoo-ee-chee',
  yuki: 'Yoo-kee',
  kenji: 'Ken-jee',

  // Other commonly mispronounced
  joaquin: 'Wah-keen',
  nguyen: 'Win',
  xiomara: 'See-oh-mar-ah',
  aaliyah: 'Ah-lee-yah',
  isaiah: 'Eye-zay-ah',
};

// ============================================================================
// NAME INTRODUCTION PATTERNS
// ============================================================================

/**
 * Patterns to detect when a user introduces themselves with pronunciation hints
 */
const INTRODUCTION_PATTERNS = [
  // "I'm [Name]"
  /(?:i'm|i am|my name is|call me|they call me|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,

  // "It's pronounced [sounds-like]"
  /(?:it's|its) pronounced\s+(?:like\s+)?["']?([^"'\n]+)["']?/i,

  // "[Name], pronounced [sounds-like]"
  /([A-Z][a-z]+),?\s+pronounced\s+(?:like\s+)?["']?([^"'\n]+)["']?/i,

  // "It rhymes with [word]"
  /(?:it|that) rhymes with\s+["']?([^"'\n]+)["']?/i,

  // "Like [sounds-like]"
  /(?:sounds? like|say it like)\s+["']?([^"'\n]+)["']?/i,
];

/**
 * Patterns to detect technical terms that might need pronunciation
 */
const TECHNICAL_TERM_PATTERNS = [
  // Acronyms (3+ capital letters)
  /\b([A-Z]{3,})\b/g,

  // CamelCase compounds (likely technical)
  /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g,

  // Words with numbers (likely technical)
  /\b([A-Za-z]+\d+[A-Za-z]*)\b/g,
];

// ============================================================================
// PRONUNCIATION MEMORY SERVICE
// ============================================================================

export class PronunciationMemoryService {
  private state: PronunciationMemoryState;

  constructor(sessionId: string) {
    this.state = {
      sessionId,
      entries: new Map(),
      commonDifficultNames: new Map(Object.entries(COMMON_DIFFICULT_NAMES)),
    };

    getLogger().debug({ sessionId }, '🗣️ Pronunciation memory initialized');
  }

  /**
   * Process user message for name introductions and pronunciation hints
   */
  processUserMessage(message: string): PronunciationEntry | null {
    // Check for introduction patterns
    for (const pattern of INTRODUCTION_PATTERNS) {
      const match = message.match(pattern);
      if (match) {
        return this.handleIntroduction(match);
      }
    }

    // Check for pronunciation corrections
    if (
      message.toLowerCase().includes('pronounced') ||
      message.toLowerCase().includes('say it')
    ) {
      return this.handlePronunciationCorrection(message);
    }

    return null;
  }

  /**
   * Handle a name introduction
   */
  private handleIntroduction(match: RegExpMatchArray): PronunciationEntry | null {
    const name = match[1]?.trim();
    if (!name) return null;

    // Check if this is a difficult name we know
    const lowerName = name.toLowerCase();
    const knownPronunciation = this.state.commonDifficultNames.get(lowerName);

    if (knownPronunciation) {
      const entry: PronunciationEntry = {
        text: name,
        phonetic: knownPronunciation,
        phoneticType: 'sounds_like',
        source: 'phonetic_pattern',
        context: 'name',
        confidence: 0.8,
        learnedAt: new Date(),
        useCount: 0,
      };

      this.state.userName = entry;
      this.state.entries.set(lowerName, entry);

      getLogger().info(
        { name, phonetic: knownPronunciation },
        '🗣️ Applied known pronunciation for difficult name'
      );

      return entry;
    }

    // Store the name even without special pronunciation
    const entry: PronunciationEntry = {
      text: name,
      phonetic: name, // Default: pronounce as written
      phoneticType: 'sounds_like',
      source: 'user_introduction',
      context: 'name',
      confidence: 0.5,
      learnedAt: new Date(),
      useCount: 0,
    };

    this.state.userName = entry;
    this.state.entries.set(lowerName, entry);

    getLogger().debug({ name }, '🗣️ Stored user name (standard pronunciation)');

    return entry;
  }

  /**
   * Handle an explicit pronunciation correction
   */
  private handlePronunciationCorrection(message: string): PronunciationEntry | null {
    // Pattern: "It's pronounced X" or "[Name], pronounced X"
    const correctionMatch = message.match(
      /([A-Z][a-z]+)?\s*(?:it's|its)?\s*pronounced\s+(?:like\s+)?["']?([^"'\n.!?]+)["']?/i
    );

    if (correctionMatch) {
      const name = correctionMatch[1] || this.state.userName?.text;
      const phonetic = correctionMatch[2]?.trim();

      if (name && phonetic) {
        const entry: PronunciationEntry = {
          text: name,
          phonetic,
          phoneticType: 'sounds_like',
          source: 'user_correction',
          context: 'name',
          confidence: 0.95, // High confidence - user explicitly corrected us
          learnedAt: new Date(),
          useCount: 0,
        };

        const lowerName = name.toLowerCase();
        this.state.entries.set(lowerName, entry);

        // If this is the user's name, update it
        if (this.state.userName?.text.toLowerCase() === lowerName) {
          this.state.userName = entry;
        }

        getLogger().info(
          { name, phonetic, source: 'user_correction' },
          '🗣️ Learned pronunciation from user correction!'
        );

        return entry;
      }
    }

    return null;
  }

  /**
   * Learn a pronunciation from context (e.g., technical domain)
   */
  learnFromContext(
    term: string,
    phonetic: string,
    context: string,
    confidence = 0.7
  ): void {
    const entry: PronunciationEntry = {
      text: term,
      phonetic,
      phoneticType: 'sounds_like',
      source: 'context_inference',
      context,
      confidence,
      learnedAt: new Date(),
      useCount: 0,
    };

    this.state.entries.set(term.toLowerCase(), entry);

    getLogger().debug({ term, phonetic, context }, '🗣️ Learned pronunciation from context');
  }

  /**
   * Get pronunciation for a word
   */
  getPronunciation(word: string): PronunciationEntry | null {
    const lowerWord = word.toLowerCase();

    // Check our learned entries first
    const entry = this.state.entries.get(lowerWord);
    if (entry) {
      entry.useCount++;
      return entry;
    }

    // Check common difficult names
    const commonPronunciation = this.state.commonDifficultNames.get(lowerWord);
    if (commonPronunciation) {
      return {
        text: word,
        phonetic: commonPronunciation,
        phoneticType: 'sounds_like',
        source: 'phonetic_pattern',
        context: 'name',
        confidence: 0.8,
        learnedAt: new Date(),
        useCount: 1,
      };
    }

    return null;
  }

  /**
   * Get the user's name with pronunciation
   */
  getUserName(): PronunciationEntry | null {
    return this.state.userName || null;
  }

  /**
   * Apply pronunciations to text, returning SSML-enhanced version
   */
  applyToText(text: string): string {
    let result = text;

    // Sort entries by length (longest first) to avoid partial replacements
    const sortedEntries = [...this.state.entries.values()].sort(
      (a, b) => b.text.length - a.text.length
    );

    for (const entry of sortedEntries) {
      // Only apply if phonetic is different from text
      if (entry.phonetic.toLowerCase() !== entry.text.toLowerCase()) {
        // Create case-insensitive pattern for the word
        const pattern = new RegExp(`\\b${escapeRegex(entry.text)}\\b`, 'gi');

        // Replace with sounds-like (no SSML phoneme tags - Cartesia doesn't support them)
        // Instead, use direct text replacement wrapped in protection markers
        result = result.replace(pattern, entry.phonetic);

        entry.useCount++;
      }
    }

    return result;
  }

  /**
   * Generate SSML phoneme tag (for TTS engines that support it)
   * Note: Cartesia doesn't support <phoneme>, so we use sounds-like instead
   */
  generatePhonemeTag(entry: PronunciationEntry): string {
    if (entry.phoneticType === 'ipa') {
      // IPA phoneme tag (for engines that support it)
      return `<phoneme alphabet="ipa" ph="${entry.phonetic}">${entry.text}</phoneme>`;
    }
    // For sounds-like, just return the phonetic version
    return entry.phonetic;
  }

  /**
   * Get all learned pronunciations
   */
  getAllPronunciations(): PronunciationEntry[] {
    return [...this.state.entries.values()];
  }

  /**
   * Export state for persistence
   */
  exportState(): {
    userName?: PronunciationEntry;
    entries: Array<[string, PronunciationEntry]>;
  } {
    return {
      userName: this.state.userName,
      entries: [...this.state.entries.entries()],
    };
  }

  /**
   * Import state from persistence
   */
  importState(state: {
    userName?: PronunciationEntry;
    entries: Array<[string, PronunciationEntry]>;
  }): void {
    if (state.userName) {
      this.state.userName = state.userName;
    }
    for (const [key, value] of state.entries) {
      this.state.entries.set(key, value);
    }
    getLogger().debug(
      { entryCount: state.entries.length, hasUserName: !!state.userName },
      '🗣️ Imported pronunciation memory state'
    );
  }

  /**
   * Reset the memory
   */
  reset(): void {
    this.state.userName = undefined;
    this.state.entries.clear();
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Analyze text for words that might need pronunciation help
 */
export function analyzePronunciationNeeds(text: string): string[] {
  const potentialTerms: string[] = [];

  // Check for technical patterns
  for (const pattern of TECHNICAL_TERM_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[1].length > 2) {
        potentialTerms.push(match[1]);
      }
    }
  }

  // Check for proper nouns (capitalized words not at sentence start)
  const properNounPattern = /(?<=[.!?]\s+\w+\s+)([A-Z][a-z]+)/g;
  const properNouns = text.matchAll(properNounPattern);
  for (const match of properNouns) {
    if (match[1]) {
      potentialTerms.push(match[1]);
    }
  }

  return [...new Set(potentialTerms)];
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const sessionInstances = new Map<string, PronunciationMemoryService>();

export function getPronunciationMemory(sessionId: string): PronunciationMemoryService {
  if (!sessionInstances.has(sessionId)) {
    sessionInstances.set(sessionId, new PronunciationMemoryService(sessionId));
  }
  return sessionInstances.get(sessionId)!;
}

export function resetPronunciationMemory(sessionId: string): void {
  const instance = sessionInstances.get(sessionId);
  if (instance) {
    instance.reset();
    sessionInstances.delete(sessionId);
  }
}

export function resetAllPronunciationMemory(): void {
  sessionInstances.clear();
}

