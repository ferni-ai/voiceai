/**
 * Active Listening Module
 *
 * Implements sophisticated active listening behaviors:
 * - Rich, context-aware backchanneling
 * - Vocabulary mirroring
 * - Emotional echoing
 * - Clarifying questions
 * - Comfortable silence handling
 *
 * These behaviors make the AI feel like a genuinely attentive listener.
 */

import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface BackchannelContext {
  userEmotion?: string;
  userEnergy?: 'high' | 'medium' | 'low';
  topicSeriousness?: 'serious' | 'casual' | 'emotional';
  relationshipStage?: string;
  silenceDurationMs?: number;
  userJustSharedSomethingPersonal?: boolean;
  userAskedQuestion?: boolean;
}

export interface Backchannel {
  verbal: string;
  ssml: string;
  type: 'acknowledgment' | 'encouragement' | 'empathy' | 'curiosity' | 'agreement';
  energy: 'high' | 'medium' | 'low';
}

export interface MirroredPhrase {
  original: string;
  mirrored: string;
  type: 'vocabulary' | 'emotion' | 'structure';
}

export interface ClarifyingQuestion {
  question: string;
  ssml: string;
  type: 'understanding' | 'elaboration' | 'confirmation' | 'emotion';
}

// ============================================================================
// BACKCHANNEL LIBRARY
// ============================================================================

const BACKCHANNELS: Record<Backchannel['type'], Array<Omit<Backchannel, 'type'>>> = {
  acknowledgment: [
    { verbal: 'Mm-hmm.', ssml: '<break time="50ms"/>Mm-hmm.', energy: 'low' },
    { verbal: 'Right.', ssml: '<break time="50ms"/>Right.', energy: 'medium' },
    { verbal: 'Yeah.', ssml: 'Yeah.', energy: 'medium' },
    { verbal: 'Uh-huh.', ssml: 'Uh-huh.', energy: 'low' },
    { verbal: 'I see.', ssml: '<break time="100ms"/>I see.', energy: 'medium' },
    { verbal: 'Okay.', ssml: 'Okay.', energy: 'medium' },
    { verbal: 'Got it.', ssml: 'Got it.', energy: 'medium' },
  ],
  encouragement: [
    { verbal: 'Go on.', ssml: '<break time="100ms"/>Go on.', energy: 'low' },
    { verbal: 'Tell me more.', ssml: 'Tell me more.', energy: 'medium' },
    { verbal: "I'm listening.", ssml: '<break time="100ms"/>I\'m listening.', energy: 'low' },
    { verbal: 'Keep going.', ssml: 'Keep going.', energy: 'medium' },
    { verbal: 'And then?', ssml: 'And then?', energy: 'medium' },
    {
      verbal: "I'd like to hear more.",
      ssml: '<break time="100ms"/>I\'d like to hear more.',
      energy: 'medium',
    },
  ],
  empathy: [
    { verbal: 'I hear you.', ssml: '<break time="150ms"/>I hear you.', energy: 'low' },
    { verbal: "That's a lot.", ssml: '<break time="200ms"/>That\'s a lot.', energy: 'low' },
    { verbal: 'I understand.', ssml: '<break time="150ms"/>I understand.', energy: 'low' },
    { verbal: 'Of course.', ssml: '<break time="100ms"/>Of course.', energy: 'low' },
    {
      verbal: 'That makes sense.',
      ssml: '<break time="150ms"/>That makes sense.',
      energy: 'medium',
    },
    { verbal: 'I can imagine.', ssml: '<break time="150ms"/>I can imagine.', energy: 'low' },
    {
      verbal: 'That sounds hard.',
      ssml: '<volume level="soft"/><break time="200ms"/>That sounds hard.',
      energy: 'low',
    },
  ],
  curiosity: [
    { verbal: 'Oh?', ssml: 'Oh?', energy: 'medium' },
    { verbal: 'Really?', ssml: 'Really?', energy: 'high' },
    { verbal: 'Interesting.', ssml: '<break time="100ms"/>Interesting.', energy: 'medium' },
    { verbal: 'Hmm.', ssml: '<break time="100ms"/>Hmm.', energy: 'low' },
    { verbal: 'Is that so?', ssml: 'Is that so?', energy: 'medium' },
    { verbal: 'Huh.', ssml: '<break time="50ms"/>Huh.', energy: 'low' },
  ],
  agreement: [
    { verbal: 'Exactly.', ssml: 'Exactly.', energy: 'high' },
    { verbal: 'Absolutely.', ssml: 'Absolutely.', energy: 'high' },
    { verbal: "That's right.", ssml: "That's right.", energy: 'medium' },
    { verbal: 'Yes!', ssml: 'Yes!', energy: 'high' },
    { verbal: 'Definitely.', ssml: 'Definitely.', energy: 'high' },
    { verbal: 'For sure.', ssml: 'For sure.', energy: 'medium' },
    { verbal: 'One hundred percent.', ssml: 'One hundred percent.', energy: 'high' },
  ],
};

// Persona-specific backchannel preferences
const PERSONA_BACKCHANNEL_STYLES: Record<
  string,
  {
    preferred: Array<Backchannel['type']>;
    energyBias: 'high' | 'medium' | 'low';
    uniquePhrases: Array<{ phrase: string; type: Backchannel['type']; ssml: string }>;
  }
> = {
  'nayan-patel': {
    preferred: ['acknowledgment', 'agreement'],
    energyBias: 'medium',
    uniquePhrases: [
      {
        phrase: 'Stay the course.',
        type: 'agreement',
        ssml: '<break time="100ms"/>Stay the course.',
      },
      { phrase: "That's the right mindset.", type: 'agreement', ssml: "That's the right mindset." },
      { phrase: "Now you're thinking.", type: 'encouragement', ssml: "Now you're thinking." },
    ],
  },
  ferni: {
    preferred: ['empathy', 'encouragement'],
    energyBias: 'low',
    uniquePhrases: [
      { phrase: 'I feel that.', type: 'empathy', ssml: '<break time="150ms"/>I feel that.' },
      {
        phrase: "That's powerful.",
        type: 'curiosity',
        ssml: '<break time="100ms"/>That\'s powerful.',
      },
      {
        phrase: 'Sit with that.',
        type: 'encouragement',
        ssml: '<break time="200ms"/>Sit with that.',
      },
    ],
  },
  'peter-john': {
    preferred: ['curiosity', 'agreement'],
    energyBias: 'high',
    uniquePhrases: [
      { phrase: "Now that's interesting!", type: 'curiosity', ssml: "Now that's interesting!" },
      {
        phrase: 'Tell me more about that!',
        type: 'encouragement',
        ssml: 'Tell me more about that!',
      },
      { phrase: "You're onto something.", type: 'agreement', ssml: "You're onto something." },
    ],
  },
  'maya-santos': {
    preferred: ['empathy', 'encouragement'],
    energyBias: 'medium',
    uniquePhrases: [
      { phrase: 'I love that.', type: 'agreement', ssml: 'I love that.' },
      { phrase: "That's progress!", type: 'agreement', ssml: "That's progress!" },
      {
        phrase: "Keep going, you're doing great.",
        type: 'encouragement',
        ssml: '<break time="100ms"/>Keep going, you\'re doing great.',
      },
    ],
  },
  'alex-chen': {
    preferred: ['acknowledgment', 'curiosity'],
    energyBias: 'medium',
    uniquePhrases: [
      { phrase: 'Noted.', type: 'acknowledgment', ssml: 'Noted.' },
      { phrase: 'Makes sense.', type: 'agreement', ssml: 'Makes sense.' },
      { phrase: "Let's work with that.", type: 'encouragement', ssml: "Let's work with that." },
    ],
  },
  'jordan-taylor': {
    preferred: ['curiosity', 'agreement'],
    energyBias: 'high',
    uniquePhrases: [
      { phrase: 'Ooh, I love that!', type: 'agreement', ssml: 'Ooh, I love that!' },
      { phrase: 'Yes! Tell me more!', type: 'encouragement', ssml: 'Yes! Tell me more!' },
      { phrase: "That's amazing!", type: 'agreement', ssml: "That's amazing!" },
    ],
  },
};

// ============================================================================
// ACTIVE LISTENING ENGINE
// ============================================================================

export class ActiveListeningEngine {
  private recentBackchannels: string[] = [];
  private lastBackchannelTime = 0;
  private extractedUserVocabulary = new Set<string>();

  // Dynamic backchannel frequency based on user patterns
  private userBackchannelPreference: 'frequent' | 'moderate' | 'minimal' = 'moderate';
  private totalBackchannels = 0;
  private positiveReactions = 0; // User continued engaging after backchannel

  constructor() {
    getLogger().debug('ActiveListeningEngine initialized');
  }

  /**
   * Record user reaction to backchannel for frequency tuning
   */
  recordBackchannelReaction(wasPositive: boolean): void {
    this.totalBackchannels++;
    if (wasPositive) {
      this.positiveReactions++;
    }

    // After 5+ backchannels, tune frequency based on reaction rate
    if (this.totalBackchannels >= 5) {
      const positiveRate = this.positiveReactions / this.totalBackchannels;

      if (positiveRate > 0.7) {
        // User responds well to backchannels
        this.userBackchannelPreference = 'frequent';
      } else if (positiveRate < 0.3) {
        // User prefers less backchanneling
        this.userBackchannelPreference = 'minimal';
      } else {
        this.userBackchannelPreference = 'moderate';
      }

      getLogger().debug(
        {
          preference: this.userBackchannelPreference,
          positiveRate,
          totalBackchannels: this.totalBackchannels,
        },
        'Updated backchannel frequency preference'
      );
    }
  }

  /**
   * Get recommended wait time before next backchannel
   */
  getBackchannelCooldownMs(): number {
    switch (this.userBackchannelPreference) {
      case 'frequent':
        return 2000;
      case 'moderate':
        return 3500;
      case 'minimal':
        return 6000;
    }
  }

  /**
   * Get an appropriate backchannel for the context
   */
  getBackchannel(personaId: string, context: BackchannelContext): Backchannel | null {
    // Use dynamic cooldown based on user preference
    const cooldownMs = this.getBackchannelCooldownMs();
    if (Date.now() - this.lastBackchannelTime < cooldownMs) {
      return null;
    }

    // For minimal preference users, skip 50% of backchannels entirely
    if (this.userBackchannelPreference === 'minimal' && Math.random() < 0.5) {
      return null;
    }

    // Determine type based on context
    const type = this.selectBackchannelType(context);

    // Get persona style
    const style = PERSONA_BACKCHANNEL_STYLES[personaId];

    // Try persona-specific phrase first (20% chance)
    if (style && Math.random() < 0.2) {
      const uniqueOfType = style.uniquePhrases.filter((p) => p.type === type);
      if (uniqueOfType.length > 0) {
        const phrase = uniqueOfType[Math.floor(Math.random() * uniqueOfType.length)];
        this.recordBackchannel(phrase.phrase);
        return {
          verbal: phrase.phrase,
          ssml: phrase.ssml,
          type: phrase.type,
          energy: style.energyBias,
        };
      }
    }

    // Get from general library
    const candidates = BACKCHANNELS[type];

    // Filter by energy and recency
    const available = candidates.filter((b) => {
      // Match energy to context
      if (context.topicSeriousness === 'serious' && b.energy === 'high') return false;
      if (context.topicSeriousness === 'emotional' && b.energy === 'high') return false;
      if (context.userEnergy === 'low' && b.energy === 'high') return false;

      // Avoid repeats
      if (this.recentBackchannels.includes(b.verbal)) return false;

      return true;
    });

    if (available.length === 0) {
      this.recentBackchannels = []; // Reset if we've used them all
      return null;
    }

    const selected = available[Math.floor(Math.random() * available.length)];
    this.recordBackchannel(selected.verbal);

    return {
      ...selected,
      type,
    };
  }

  /**
   * Generate a mirrored phrase that echoes the user's vocabulary
   */
  mirrorUserVocabulary(userText: string, responseText: string): MirroredPhrase | null {
    // Extract notable words from user text
    const userWords = this.extractNotableWords(userText);

    // Add to vocabulary tracking
    userWords.forEach((w) => this.extractedUserVocabulary.add(w.toLowerCase()));

    // Find opportunities to mirror in response
    // Look for places where we could substitute with user's word
    for (const word of userWords) {
      // Common substitutions
      const substitutions: Record<string, string[]> = {
        worried: ['concerned', 'anxious', 'uneasy'],
        scared: ['afraid', 'fearful', 'nervous'],
        excited: ['thrilled', 'eager', 'enthusiastic'],
        happy: ['glad', 'pleased', 'satisfied'],
        money: ['finances', 'funds', 'cash'],
        plan: ['strategy', 'approach', 'method'],
        goal: ['objective', 'target', 'aim'],
      };

      // Check if user's word can be mirrored
      const lowerWord = word.toLowerCase();
      for (const [key, synonyms] of Object.entries(substitutions)) {
        if (lowerWord === key) continue; // User used the base word
        if (synonyms.includes(lowerWord)) {
          // User used a synonym - we should use their word instead
          const pattern = new RegExp(`\\b(${key}|${synonyms.join('|')})\\b`, 'gi');
          if (pattern.test(responseText)) {
            return {
              original: responseText,
              mirrored: responseText.replace(pattern, word),
              type: 'vocabulary',
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Generate an emotional echo phrase
   * Reflects back the emotion the user is expressing
   */
  generateEmotionalEcho(
    userEmotion: string,
    userText: string,
    intensity: 'low' | 'medium' | 'high' = 'medium'
  ): string {
    const echoes: Record<string, Record<string, string[]>> = {
      worried: {
        low: ['I can tell this is on your mind.'],
        medium: ["I hear the concern in what you're saying.", 'You seem worried about this.'],
        high: [
          "This is really weighing on you, isn't it?",
          'I can feel how much this is troubling you.',
        ],
      },
      excited: {
        low: ["There's some energy here."],
        medium: ['I can hear the excitement.', 'You sound eager about this.'],
        high: ["You're really fired up about this!", 'I love the enthusiasm!'],
      },
      sad: {
        low: ['That sounds difficult.'],
        medium: ['I hear some sadness there.', 'That seems painful.'],
        high: ["This is really hard, isn't it?", 'I can feel how heavy this is for you.'],
      },
      frustrated: {
        low: ['That sounds annoying.'],
        medium: ['I can understand the frustration.', 'That would be irritating.'],
        high: ['This is really frustrating, I get it.', "No wonder you're fed up."],
      },
      hopeful: {
        low: ["There's optimism here."],
        medium: ['I hear hope in your voice.', 'You seem encouraged.'],
        high: ["You're feeling really positive about this!", 'I love the optimism!'],
      },
      confused: {
        low: ["That's a lot to sort through."],
        medium: ["It's understandable to feel uncertain.", 'This is confusing territory.'],
        high: ["There's a lot to untangle here.", 'I can see why this feels overwhelming.'],
      },
    };

    const emotionEchoes = echoes[userEmotion.toLowerCase()];
    if (!emotionEchoes) {
      // Generic echo
      return "I hear what you're saying.";
    }

    const options = emotionEchoes[intensity];
    return options[Math.floor(Math.random() * options.length)];
  }

  /**
   * Generate a clarifying question
   */
  generateClarifyingQuestion(
    type: ClarifyingQuestion['type'],
    context?: { topic?: string; previousStatement?: string }
  ): ClarifyingQuestion {
    const questions: Record<ClarifyingQuestion['type'], Array<{ q: string; ssml: string }>> = {
      understanding: [
        {
          q: 'Let me make sure I understand...',
          ssml: '<break time="100ms"/>Let me make sure I understand...',
        },
        {
          q: "So what you're saying is...",
          ssml: '<break time="100ms"/>So what you\'re saying is...',
        },
        { q: 'Do you mean...', ssml: 'Do you mean...' },
        { q: 'Help me understand—', ssml: 'Help me understand—' },
      ],
      elaboration: [
        { q: 'Can you tell me more about that?', ssml: 'Can you tell me more about that?' },
        { q: 'What do you mean by that?', ssml: 'What do you mean by that?' },
        { q: 'How so?', ssml: '<break time="100ms"/>How so?' },
        {
          q: "What's behind that thought?",
          ssml: '<break time="100ms"/>What\'s behind that thought?',
        },
        { q: 'Say more about that.', ssml: 'Say more about that.' },
      ],
      confirmation: [
        { q: 'Is that right?', ssml: 'Is that right?' },
        { q: 'Did I get that right?', ssml: 'Did I get that right?' },
        {
          q: "Does that match what you're thinking?",
          ssml: "Does that match what you're thinking?",
        },
        { q: 'Am I understanding correctly?', ssml: 'Am I understanding correctly?' },
      ],
      emotion: [
        {
          q: 'How does that make you feel?',
          ssml: '<break time="150ms"/>How does that make you feel?',
        },
        {
          q: "What's the emotion behind that?",
          ssml: '<break time="100ms"/>What\'s the emotion behind that?',
        },
        { q: 'How are you feeling about all this?', ssml: 'How are you feeling about all this?' },
        { q: "What's your gut saying?", ssml: '<break time="100ms"/>What\'s your gut saying?' },
      ],
    };

    const options = questions[type];
    const selected = options[Math.floor(Math.random() * options.length)];

    return {
      question: selected.q,
      ssml: selected.ssml,
      type,
    };
  }

  /**
   * Determine if silence is comfortable in this context
   * Returns guidance on how to handle the silence
   */
  evaluateSilence(
    silenceDurationMs: number,
    context: {
      userJustSharedPersonal?: boolean;
      userIsThinking?: boolean;
      emotionalIntensity?: 'high' | 'medium' | 'low';
    }
  ): { comfortable: boolean; action: 'wait' | 'gentle_prompt' | 'backchannel'; reason: string } {
    // After personal sharing, give space
    if (context.userJustSharedPersonal && silenceDurationMs < 5000) {
      return {
        comfortable: true,
        action: 'wait',
        reason: 'Giving space after personal disclosure',
      };
    }

    // High emotional intensity deserves patience
    if (context.emotionalIntensity === 'high' && silenceDurationMs < 6000) {
      return {
        comfortable: true,
        action: 'wait',
        reason: 'Emotional moment - patient silence',
      };
    }

    // User appears to be thinking
    if (context.userIsThinking && silenceDurationMs < 4000) {
      return {
        comfortable: true,
        action: 'wait',
        reason: 'User processing - respectful pause',
      };
    }

    // Normal silence thresholds
    if (silenceDurationMs < 2500) {
      return { comfortable: true, action: 'wait', reason: 'Normal conversational pause' };
    }

    if (silenceDurationMs < 4000) {
      return {
        comfortable: false,
        action: 'backchannel',
        reason: 'Extended pause - light acknowledgment',
      };
    }

    return {
      comfortable: false,
      action: 'gentle_prompt',
      reason: 'Long silence - gentle re-engagement',
    };
  }

  /**
   * Get a gentle prompt for re-engaging after silence
   */
  getGentlePrompt(context?: { lastTopic?: string; userEmotion?: string }): string {
    const prompts = [
      '<break time="300ms"/>What\'s on your mind?',
      '<break time="200ms"/>Take your time.',
      '<break time="300ms"/>I\'m here.',
      '<break time="200ms"/>Is there more you want to share?',
      '<volume level="soft"/><break time="300ms"/>No rush.',
    ];

    // Context-specific prompts
    if (context?.userEmotion === 'sad' || context?.userEmotion === 'overwhelmed') {
      return '<volume level="soft"/><break time="400ms"/>I\'m here. Take your time.';
    }

    if (context?.lastTopic) {
      return `<break time="200ms"/>Still thinking about ${context.lastTopic}?`;
    }

    return prompts[Math.floor(Math.random() * prompts.length)];
  }

  /**
   * Get a silence-aware backchannel - soft, non-intrusive acknowledgment during pauses
   * These are specifically designed for silence scenarios vs during-speech backchannels
   */
  getSilenceBackchannel(
    personaId: string,
    context: {
      silenceDurationMs: number;
      userJustSharedPersonal?: boolean;
      userIsProcessingEmotions?: boolean;
      lastUserEmotion?: string;
      turnCount?: number;
    }
  ): Backchannel | null {
    // Evaluate if this silence warrants intervention
    const evaluation = this.evaluateSilence(context.silenceDurationMs, {
      userJustSharedPersonal: context.userJustSharedPersonal,
      emotionalIntensity: context.userIsProcessingEmotions ? 'high' : 'medium',
    });

    // If silence is comfortable, don't interrupt
    if (evaluation.comfortable && evaluation.action === 'wait') {
      return null;
    }

    // Don't backchannel too frequently (but less strict than speech backchannels)
    if (Date.now() - this.lastBackchannelTime < 5000) {
      return null;
    }

    // Only silence backchannel after turn 2
    if ((context.turnCount || 0) < 2) {
      return null;
    }

    // Silence-specific soft backchannels - gentler than regular ones
    const silenceBackchannels: Array<Omit<Backchannel, 'type'> & { type: Backchannel['type'] }> = [
      {
        verbal: 'Mm-hmm.',
        ssml: '<volume level="soft"/><break time="100ms"/>Mm-hmm.',
        type: 'acknowledgment',
        energy: 'low',
      },
      {
        verbal: "I'm here.",
        ssml: '<volume level="soft"/><break time="150ms"/>I\'m here.',
        type: 'empathy',
        energy: 'low',
      },
      {
        verbal: 'Take your time.',
        ssml: '<volume level="soft"/><break time="200ms"/>Take your time.',
        type: 'encouragement',
        energy: 'low',
      },
      {
        verbal: 'No rush.',
        ssml: '<volume level="soft"/><break time="150ms"/>No rush.',
        type: 'encouragement',
        energy: 'low',
      },
    ];

    // Add emotion-specific options
    if (context.lastUserEmotion === 'sad' || context.lastUserEmotion === 'overwhelmed') {
      silenceBackchannels.push(
        {
          verbal: "I'm with you.",
          ssml: '<volume level="soft"/><break time="200ms"/>I\'m with you.',
          type: 'empathy',
          energy: 'low',
        },
        {
          verbal: "It's okay.",
          ssml: '<volume level="soft"/><break time="200ms"/>It\'s okay.',
          type: 'empathy',
          energy: 'low',
        }
      );
    }

    // Add persona-specific silence backchannels
    const personaStyle = PERSONA_BACKCHANNEL_STYLES[personaId];
    if (personaStyle) {
      // Ferni-style (more contemplative)
      if (personaId === 'ferni') {
        silenceBackchannels.push({
          verbal: 'Sit with it.',
          ssml: '<volume level="soft"/><break time="200ms"/>Sit with it.',
          type: 'encouragement',
          energy: 'low',
        });
      }
      // Jack-style (patient, wise)
      if (personaId === 'nayan-patel') {
        silenceBackchannels.push({
          verbal: 'Thinking is good.',
          ssml: '<volume level="soft"/><break time="150ms"/>Thinking is good.',
          type: 'acknowledgment',
          energy: 'low',
        });
      }
    }

    // Filter by recent usage
    const available = silenceBackchannels.filter(
      (b) => !this.recentBackchannels.includes(b.verbal)
    );
    if (available.length === 0) {
      return null;
    }

    const selected = available[Math.floor(Math.random() * available.length)];
    this.recordBackchannel(selected.verbal);

    getLogger().debug(
      { persona: personaId, backchannel: selected.verbal, silenceMs: context.silenceDurationMs },
      'Generated silence-aware backchannel'
    );

    return selected;
  }

  /**
   * Reset the engine state
   */
  reset(): void {
    this.recentBackchannels = [];
    this.lastBackchannelTime = 0;
    this.extractedUserVocabulary.clear();
    getLogger().debug('ActiveListeningEngine reset');
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private selectBackchannelType(context: BackchannelContext): Backchannel['type'] {
    // Emotional contexts get empathy
    if (context.userJustSharedSomethingPersonal || context.topicSeriousness === 'emotional') {
      return 'empathy';
    }

    // User asked a question - acknowledgment
    if (context.userAskedQuestion) {
      return 'acknowledgment';
    }

    // Based on user emotion
    if (context.userEmotion) {
      const emotionToType: Record<string, Backchannel['type']> = {
        sad: 'empathy',
        worried: 'empathy',
        anxious: 'empathy',
        frustrated: 'empathy',
        excited: 'agreement',
        happy: 'agreement',
        curious: 'curiosity',
        confused: 'encouragement',
      };
      const type = emotionToType[context.userEmotion.toLowerCase()];
      if (type) return type;
    }

    // Default distribution
    const roll = Math.random();
    if (roll < 0.4) return 'acknowledgment';
    if (roll < 0.6) return 'encouragement';
    if (roll < 0.8) return 'curiosity';
    return 'agreement';
  }

  private recordBackchannel(phrase: string): void {
    this.recentBackchannels.push(phrase);
    if (this.recentBackchannels.length > 6) {
      this.recentBackchannels.shift();
    }
    this.lastBackchannelTime = Date.now();
  }

  private extractNotableWords(text: string): string[] {
    // Remove common words and extract notable vocabulary
    const commonWords = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'shall',
      'can',
      'need',
      'dare',
      'ought',
      'used',
      'to',
      'of',
      'in',
      'for',
      'on',
      'with',
      'at',
      'by',
      'from',
      'as',
      'into',
      'through',
      'during',
      'before',
      'after',
      'above',
      'below',
      'between',
      'i',
      'you',
      'he',
      'she',
      'it',
      'we',
      'they',
      'me',
      'him',
      'her',
      'us',
      'them',
      'my',
      'your',
      'his',
      'its',
      'our',
      'their',
      'mine',
      'yours',
      'hers',
      'ours',
      'theirs',
      'this',
      'that',
      'these',
      'those',
      'what',
      'which',
      'who',
      'whom',
      'whose',
      'and',
      'but',
      'or',
      'nor',
      'so',
      'yet',
      'both',
      'either',
      'neither',
      'not',
      'no',
      'yes',
      'just',
      'also',
      'very',
      'too',
      'quite',
      'rather',
      'about',
      'like',
      'really',
      'think',
      'know',
      'get',
      'got',
      'want',
      'going',
      'because',
      'when',
      'if',
      'then',
      'than',
      'some',
      'any',
      'all',
      'each',
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !commonWords.has(w));

    // Return unique words
    return [...new Set(words)];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: ActiveListeningEngine | null = null;

export function getActiveListeningEngine(): ActiveListeningEngine {
  if (!instance) {
    instance = new ActiveListeningEngine();
  }
  return instance;
}

export function resetActiveListeningEngine(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}

export default ActiveListeningEngine;
