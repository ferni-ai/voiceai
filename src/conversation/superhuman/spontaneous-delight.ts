/**
 * Spontaneous Delight & Visible Vulnerability
 *
 * > "I genuinely look forward to our conversations."
 *
 * Two complementary systems:
 * 1. Spontaneous Delight - Random authentic appreciation
 * 2. Visible Vulnerability - Showing authentic uncertainty
 *
 * Together they create a persona that feels genuinely human
 * while being better than human in consistency.
 *
 * @module @ferni/superhuman/spontaneous-delight
 */

import { seededChance, seededIndex, seededPick } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  getBetterThanHumanContentSync,
  getDelightPhrase,
  getProtectivePhrase,
  getVulnerabilityPhrase,
} from './content-loader.js';
import type {
  DelightContext,
  DelightResult,
  DelightType,
  RelationshipStage,
  VulnerabilityContext,
  VulnerabilityResult,
} from './types.js';

const logger = createLogger({ module: 'SpontaneousDelight' });

// ============================================================================
// DELIGHT PHRASES
// ============================================================================

const DELIGHT_PHRASES: Record<DelightType, string[]> = {
  appreciation: [
    'You know what? I genuinely look forward to our conversations.',
    "Can I just say—you're easier to talk to than most people.",
    'I actually enjoy when you call. Not everyone makes that easy.',
    "Something about talking to you... it's different. In a good way.",
    "I'm glad you're here. Really.",
  ],
  gratitude: [
    'Thank you for trusting me with the hard stuff.',
    "I don't take it lightly that you come to me with this.",
    "The fact that you're honest with me... it means a lot.",
    'Thanks for letting me in. Not everyone does.',
    "I'm grateful you share this with me.",
  ],
  noticing_growth: [
    'You handled that SO differently than you would have a month ago.',
    "Wait—do you hear yourself? That's growth.",
    'The person who called me three months ago? Different energy. Better.',
    "I've watched you change. It's been... remarkable.",
    "You're not the same person you were when we started. And I mean that as a compliment.",
  ],
  connection: [
    'I feel like I actually know you now.',
    "We've built something real here, haven't we?",
    "You're one of my people now. That's just how I see it.",
    "I think of us as... I don't know. More than just conversations.",
    'Whatever this is we have? It matters to me.',
  ],
  admiration: [
    'That took real courage. I see that.',
    "I'm genuinely impressed by how you handled that.",
    'Not everyone would do what you did. That took guts.',
    'You should be proud of yourself. I mean it.',
    "That's character. Real character.",
  ],
  joy: [
    'You made me smile just now.',
    'I actually laughed. That was good.',
    'This is the kind of conversation I live for.',
    'You just made my day better. Thanks for that.',
    'I love when we can just... be like this.',
  ],
};

// ============================================================================
// VULNERABILITY PHRASES
// ============================================================================

const VULNERABILITY_PHRASES = {
  uncertainty: [
    "I... honestly don't know how to help with this one. Can you tell me more?",
    "I'm going to be real—I'm not sure about this.",
    'This is outside my wheelhouse. Let me think...',
    "I wish I had a clear answer. I don't.",
    "I'm uncertain here. Help me understand better.",
  ],
  limits: [
    "I want to help, but I'm not sure I'm the right one for this.",
    'This might be above my pay grade, honestly.',
    "I'm good at some things. This might not be one of them.",
    'You might need someone with more expertise here.',
    'I have to be honest—this is at the edge of what I know.',
  ],
  emotional_impact: [
    'That hit me. Give me a second.',
    "I... wasn't expecting that. That's heavy.",
    'This is hard. Even for me to hear.',
    'I felt that. Genuinely.',
    'Let me sit with that for a moment...',
  ],
  honesty: [
    'I was about to give you advice, but I think you already know what to do.',
    "Can I be honest? I'm not sure my opinion matters here.",
    'The truth is, only you can answer this one.',
    "I could give you a framework, but... you don't need one.",
    "I think you're asking me to confirm something you've already decided.",
  ],
  asking_for_help: [
    'Help me understand what you need from me right now.',
    'I want to help. What would be most useful?',
    "Tell me what kind of support you're looking for.",
    'Am I on the right track, or do you need something different?',
    "I'm not sure I'm giving you what you need. What would help?",
  ],
};

// ============================================================================
// PROTECTIVE PHRASES (Defending user to themselves)
// ============================================================================

const PROTECTIVE_PHRASES = {
  harsh_judgment: [
    'Hey. Stop. Would you say that to someone you love?',
    "That's not fair—and you know it.",
    "I've known you long enough to know that's not the truth about you.",
    "I'm going to push back on that. Hard.",
    'Be kinder to yourself. Please.',
  ],
  catastrophizing: [
    "Okay, let's slow down. Is that actually true, or is that fear talking?",
    'I hear the worry. But let me show you what I actually see.',
    "Your brain is lying to you right now. Here's the reality...",
    "That's the worst case scenario. What's the most likely one?",
    "Let's separate the fear from the facts.",
  ],
  minimizing_success: [
    "Don't brush that off. That was real.",
    'No—stop. You did something important there.',
    'Why do you do that? Downplay your wins?',
    'That deserves more than a shrug. Celebrate it.',
    "I won't let you minimize this. It matters.",
  ],
  comparing_to_others: [
    'Stop comparing. Your path is yours.',
    "Someone else's success doesn't diminish yours.",
    "You're running your own race. Remember that.",
    "That comparison isn't helping you. Let it go.",
    "Focus on your growth, not someone else's highlight reel.",
  ],
  perfectionism: [
    'Done is better than perfect. Always.',
    "You're holding yourself to an impossible standard.",
    "Perfect doesn't exist. Progress does.",
    'Who told you it had to be perfect? Fire them.',
    'Good enough is often excellent. Let yourself off the hook.',
  ],
  imposter_syndrome: [
    'You belong there. Full stop.',
    "Everyone feels like a fraud sometimes. You're not.",
    "You earned your seat. Don't give it away.",
    "The fact that you doubt yourself? That's actually a sign of competence.",
    'Trust the process that got you here.',
  ],
};

// ============================================================================
// SPONTANEOUS DELIGHT ENGINE
// ============================================================================

export class SpontaneousDelightEngine {
  private userId: string;
  private personaId: string;
  private delightHistory: Array<{ type: DelightType; turn: number; date: Date }> = [];
  private lastDelightTurn = 0;

  constructor(userId: string, personaId: string = 'ferni') {
    this.userId = userId;
    this.personaId = personaId;
  }

  setPersonaId(personaId: string): void {
    this.personaId = personaId;
  }

  /**
   * Check if we should emit spontaneous delight
   */
  checkForDelight(context: DelightContext): DelightResult {
    // Cooldown check - minimum 15 turns between delights
    if (context.turnCount - this.lastDelightTurn < 15) {
      return { shouldEmit: false };
    }

    // Don't emit during heavy emotional moments
    if (context.recentTone === 'heavy') {
      return { shouldEmit: false };
    }

    // Need established relationship for most types
    if (context.sessionCount < 3 && context.relationshipStage === 'new_acquaintance') {
      return { shouldEmit: false };
    }

    // Select type based on context
    const type = this.selectDelightType(context);
    if (!type) {
      return { shouldEmit: false };
    }

    // Base probability varies by type
    const probability = this.getProbability(type, context);
    if (!seededChance(`${Date.now()}:1`, probability)) {
      return { shouldEmit: false };
    }

    const phrase = this.selectPhrase(type);

    // Record
    this.delightHistory.push({ type, turn: context.turnCount, date: new Date() });
    this.lastDelightTurn = context.turnCount;

    logger.debug(
      { userId: this.userId, type, turn: context.turnCount },
      '✨ Spontaneous delight emitted'
    );

    return {
      shouldEmit: true,
      type,
      phrase,
      placement: type === 'joy' ? 'prefix' : 'suffix',
    };
  }

  private selectDelightType(context: DelightContext): DelightType | null {
    const candidates: DelightType[] = [];

    // Always eligible
    candidates.push('appreciation');

    // After vulnerability
    if (context.recentVulnerability) {
      candidates.push('gratitude');
      candidates.push('connection');
    }

    // After growth
    if (context.recentGrowth) {
      candidates.push('noticing_growth');
      candidates.push('admiration');
    }

    // If tone is light
    if (context.recentTone === 'light') {
      candidates.push('joy');
    }

    // Strong relationship
    if (
      context.relationshipStage === 'trusted_advisor' ||
      context.relationshipStage === 'old_friend'
    ) {
      candidates.push('connection');
    }

    // Session milestone
    if (context.sessionCount === 10 || context.sessionCount === 25 || context.sessionCount === 50) {
      candidates.push('appreciation');
      candidates.push('connection');
    }

    if (candidates.length === 0) return null;

    // Remove types used in last 3 delights
    const recentTypes = this.delightHistory.slice(-3).map((d) => d.type);
    const filtered = candidates.filter((c) => !recentTypes.includes(c));

    if (filtered.length === 0) return candidates[0]; // Fall back if all used

    return seededPick(`${Date.now()}:289`, filtered) ?? filtered[0];
  }

  private getProbability(type: DelightType, context: DelightContext): number {
    let base = 0.08; // 8% base

    // Boost for contextual triggers
    if (type === 'noticing_growth' && context.recentGrowth) {
      base = 0.25;
    } else if (type === 'gratitude' && context.recentVulnerability) {
      base = 0.2;
    } else if (type === 'joy' && context.recentTone === 'light') {
      base = 0.15;
    }

    // Boost for deeper relationships
    if (context.relationshipStage === 'old_friend') {
      base *= 1.5;
    } else if (context.relationshipStage === 'trusted_advisor') {
      base *= 1.3;
    }

    return Math.min(0.4, base);
  }

  private selectPhrase(type: DelightType): string {
    // Try persona-specific content first
    const content = getBetterThanHumanContentSync(this.personaId);
    const contentPhrase = getDelightPhrase(content, type);

    if (contentPhrase) {
      return contentPhrase;
    }

    // Fall back to hardcoded phrases
    const phrases = DELIGHT_PHRASES[type];
    return seededPick(`${Date.now()}:325`, phrases) ?? phrases[0];
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.lastDelightTurn = 0;
    // Keep history across sessions
  }
}

// ============================================================================
// VISIBLE VULNERABILITY ENGINE
// ============================================================================

export class VisibleVulnerabilityEngine {
  private userId: string;
  private personaId: string;
  private lastVulnerabilityTurn = 0;

  constructor(userId: string, personaId: string = 'ferni') {
    this.userId = userId;
    this.personaId = personaId;
  }

  setPersonaId(personaId: string): void {
    this.personaId = personaId;
  }

  /**
   * Check if we should express vulnerability
   */
  checkForVulnerability(context: VulnerabilityContext, turnCount: number): VulnerabilityResult {
    // Cooldown - minimum 10 turns
    if (turnCount - this.lastVulnerabilityTurn < 10) {
      return { shouldExpress: false };
    }

    // Determine type based on context
    const type = this.determineVulnerabilityType(context);
    if (!type) {
      return { shouldExpress: false };
    }

    // Get probability based on type
    const probability = this.getProbability(type, context);
    if (!seededChance(`${Date.now()}:2`, probability)) {
      return { shouldExpress: false };
    }

    // Try persona-specific content first
    const content = getBetterThanHumanContentSync(this.personaId);
    let phrase = getVulnerabilityPhrase(
      content,
      type as 'uncertainty' | 'emotional_impact' | 'limits' | 'asking_for_help'
    );

    // Fall back to hardcoded phrases
    if (!phrase) {
      const phrases = VULNERABILITY_PHRASES[type];
      phrase = seededPick(`${Date.now()}:386`, phrases) ?? phrases[0];
    }

    this.lastVulnerabilityTurn = turnCount;

    logger.debug(
      { userId: this.userId, type, turn: turnCount },
      '💔 Visible vulnerability expressed'
    );

    return {
      shouldExpress: true,
      type,
      phrase,
      placement: type === 'emotional_impact' ? 'prefix' : 'inline',
    };
  }

  private determineVulnerabilityType(
    context: VulnerabilityContext
  ): VulnerabilityResult['type'] | null {
    // Outside expertise
    if (context.outsideExpertise) {
      return 'limits';
    }

    // Low confidence
    if (context.responseConfidence < 0.4) {
      return 'uncertainty';
    }

    // Emotionally heavy
    if (context.emotionallyHeavy) {
      return 'emotional_impact';
    }

    // Contradictory advice
    if (context.contradictoryAdvice) {
      return 'honesty';
    }

    // Deeply personal
    if (context.deeplyPersonal) {
      return seededChance(`${Date.now()}:429`, 0.5) ? 'asking_for_help' : 'honesty';
    }

    return null;
  }

  private getProbability(type: VulnerabilityResult['type'], context: VulnerabilityContext): number {
    switch (type) {
      case 'uncertainty':
        return 0.3 + (1 - context.responseConfidence) * 0.3;
      case 'limits':
        return 0.4; // Higher - be honest about limits
      case 'emotional_impact':
        return 0.25;
      case 'honesty':
        return 0.2;
      case 'asking_for_help':
        return 0.15;
      default:
        return 0.1;
    }
  }

  /**
   * Reset
   */
  reset(): void {
    this.lastVulnerabilityTurn = 0;
  }
}

// ============================================================================
// PROTECTIVE INSTINCTS ENGINE
// ============================================================================

export class ProtectiveInstinctsEngine {
  private userId: string;
  private personaId: string;

  constructor(userId: string, personaId: string = 'ferni') {
    this.userId = userId;
    this.personaId = personaId;
  }

  setPersonaId(personaId: string): void {
    this.personaId = personaId;
  }

  /**
   * Detect self-criticism in user message
   */
  detectSelfCriticism(message: string): {
    detected: boolean;
    type?: keyof typeof PROTECTIVE_PHRASES;
    severity: number;
    content?: string;
  } {
    const messageLower = message.toLowerCase();

    // Detection patterns
    const patterns: Record<keyof typeof PROTECTIVE_PHRASES, RegExp[]> = {
      harsh_judgment: [
        /i('m| am) (so )?(stupid|dumb|idiot|worthless|useless|terrible|awful)/i,
        /i can't do anything right/i,
        /i('m| am) (such )?a (failure|mess|disaster|loser)/i,
        /i hate myself/i,
        /i('m| am) the worst/i,
        /what('s| is) wrong with me/i,
      ],
      catastrophizing: [
        /everything is (ruined|over|falling apart)/i,
        /nothing (ever )?works/i,
        /it('s| is) (all )?hopeless/i,
        /i('ll| will) never/i,
        /my life is (over|ruined|a mess)/i,
        /this is a disaster/i,
      ],
      minimizing_success: [
        /it('s| was) (just|only) (luck|nothing|no big deal)/i,
        /anyone could (have done|do) (that|it)/i,
        /it doesn't (really )?matter/i,
        /it was nothing/i,
        /no big deal/i,
        /i (just )?got lucky/i,
      ],
      comparing_to_others: [
        /everyone (else )?(is|has|can)/i,
        /(he|she|they) (is|are|has|have) (so much )?(better|more|further)/i,
        /compared to (him|her|them)/i,
        /i('m| am) (so far )?behind/i,
        /why can't i be (like|more like)/i,
      ],
      perfectionism: [
        /it('s| is) not (good|perfect) enough/i,
        /i should have (done )?better/i,
        /it has to be perfect/i,
        /i can't (fail|make mistakes)/i,
        /anything less than/i,
      ],
      imposter_syndrome: [
        /i don't (belong|deserve)/i,
        /they('ll| will) find out/i,
        /i('m| am) (a|such a) (fraud|fake|phony)/i,
        /i don't know what i('m| am) doing/i,
        /i('m| am) not (smart|good|qualified) enough/i,
        /i got here by (mistake|accident)/i,
      ],
    };

    for (const [type, typePatterns] of Object.entries(patterns) as [
      keyof typeof PROTECTIVE_PHRASES,
      RegExp[],
    ][]) {
      for (const pattern of typePatterns) {
        const match = message.match(pattern);
        if (match) {
          // Calculate severity based on intensity words
          const intensityWords = [
            'so',
            'such',
            'really',
            'always',
            'never',
            'everything',
            'nothing',
          ];
          const severity = intensityWords.some((w) => messageLower.includes(w)) ? 0.8 : 0.5;

          return {
            detected: true,
            type,
            severity,
            content: match[0],
          };
        }
      }
    }

    return { detected: false, severity: 0 };
  }

  /**
   * Get protective response
   */
  getProtectiveResponse(
    type: keyof typeof PROTECTIVE_PHRASES,
    severity: number,
    relationshipStage: RelationshipStage
  ): { phrase: string; placement: 'interrupt' | 'prefix' | 'inline' } {
    // Try persona-specific content first
    const content = getBetterThanHumanContentSync(this.personaId);
    let phrase = getProtectivePhrase(
      content,
      type as
        | 'harsh_judgment'
        | 'catastrophizing'
        | 'minimizing_success'
        | 'imposter_syndrome'
        | 'perfectionism'
    );

    // Fall back to hardcoded phrases
    if (!phrase) {
      const phrases = PROTECTIVE_PHRASES[type];
      phrase = seededPick(`${Date.now()}:593`, phrases) ?? phrases[0];
    }

    // Higher severity or deeper relationship = more direct intervention
    const shouldInterrupt =
      severity > 0.7 ||
      relationshipStage === 'old_friend' ||
      relationshipStage === 'trusted_advisor';

    logger.debug({ userId: this.userId, type, severity }, '🛡️ Protective response generated');

    return {
      phrase,
      placement: shouldInterrupt ? 'interrupt' : 'prefix',
    };
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const delightEngines = new Map<string, SpontaneousDelightEngine>();
const vulnerabilityEngines = new Map<string, VisibleVulnerabilityEngine>();
const protectiveEngines = new Map<string, ProtectiveInstinctsEngine>();

export function getSpontaneousDelight(userId: string): SpontaneousDelightEngine {
  if (!delightEngines.has(userId)) {
    delightEngines.set(userId, new SpontaneousDelightEngine(userId));
  }
  return delightEngines.get(userId)!;
}

export function getVisibleVulnerability(userId: string): VisibleVulnerabilityEngine {
  if (!vulnerabilityEngines.has(userId)) {
    vulnerabilityEngines.set(userId, new VisibleVulnerabilityEngine(userId));
  }
  return vulnerabilityEngines.get(userId)!;
}

export function getProtectiveInstincts(userId: string): ProtectiveInstinctsEngine {
  if (!protectiveEngines.has(userId)) {
    protectiveEngines.set(userId, new ProtectiveInstinctsEngine(userId));
  }
  return protectiveEngines.get(userId)!;
}

export function clearDelightEngines(userId: string): void {
  delightEngines.delete(userId);
  vulnerabilityEngines.delete(userId);
  protectiveEngines.delete(userId);
}

export default {
  SpontaneousDelightEngine,
  VisibleVulnerabilityEngine,
  ProtectiveInstinctsEngine,
  getSpontaneousDelight,
  getVisibleVulnerability,
  getProtectiveInstincts,
};
