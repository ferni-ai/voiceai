/**
 * Relationship Science Knowledge Base
 *
 * Research-backed understanding of relationships based on:
 * - Gottman Method (Gottman & Silver)
 * - Attachment Theory (Bowlby, Ainsworth)
 * - Nonviolent Communication (Rosenberg)
 * - Emotional Intelligence (Goleman)
 * - Social psychology research
 *
 * KEY INSIGHT: Relationships require repair, not perfection.
 * The ability to repair after conflict predicts relationship
 * success better than avoiding conflict.
 *
 * @module RelationshipScience
 */

// ============================================================================
// RELATIONSHIP SCIENCE
// ============================================================================

export const RELATIONSHIP_SCIENCE = {
  /**
   * Gottman Method Research
   *
   * Based on 40+ years of research observing couples.
   * Can predict divorce with ~90% accuracy.
   */
  gottmanResearch: {
    fourHorsemen: {
      description: 'Four communication patterns that predict relationship failure',
      horsemen: {
        criticism: {
          definition: 'Attacking character rather than behavior',
          example: '"You always forget things. You\'re so selfish."',
          antidote: 'Gentle startup: "I" statements about specific behavior',
          antidoteExample:
            '"I felt hurt when the appointment was forgotten. Can we find a system?"',
        },
        contempt: {
          definition: 'Superiority, mockery, disgust',
          example: 'Eye-rolling, sarcasm, name-calling',
          severity: 'Most destructive—#1 predictor of divorce',
          antidote: 'Build culture of appreciation. Express fondness daily.',
        },
        defensiveness: {
          definition: 'Self-protection, counter-attacking, playing victim',
          example: '"It\'s not my fault! You\'re the one who..."',
          antidote: 'Take responsibility for even a small part',
          antidoteExample: '"You\'re right, I could have handled that better."',
        },
        stonewalling: {
          definition: 'Withdrawing, shutting down, refusing to engage',
          example: 'Leaving the room, silent treatment, blank stare',
          cause: 'Usually physiological flooding (overwhelm)',
          antidote: 'Take a 20+ minute break to self-soothe, then return',
        },
      },
    },

    repairAttempts: {
      definition: 'Any effort to de-escalate tension during conflict',
      examples: [
        'Using humor',
        'Showing affection',
        'Apologizing',
        "Acknowledging partner's feelings",
        'Taking a break',
      ],
      keyFinding:
        'Successful repair attempts predict relationship success more than avoiding conflict',
      implication: 'Help users make and receive repair attempts',
    },

    magicRatio: {
      finding: '5:1 positive to negative interactions in stable relationships',
      duringConflict:
        'Even during arguments, successful couples have 5 positives for every negative',
      application: 'Build positive deposits before making withdrawals',
    },

    bids: {
      definition: 'Attempts to connect (small moments of reaching out)',
      examples: [
        '"Look at this sunset"',
        '"How was your day?"',
        'Sharing an article or meme',
        'Touch on the shoulder',
      ],
      responses: {
        turningToward: 'Engaging with the bid (builds connection)',
        turningAway: 'Ignoring or missing the bid (erodes connection)',
        turningAgainst: 'Responding hostilely (damages connection)',
      },
      finding: 'Couples who stay together turn toward bids 86% of the time',
    },

    softStartup: {
      description: 'How you begin a conversation predicts how it ends',
      harshStartup: '"You never listen to me!"',
      softStartup:
        '"I need to talk about something that\'s been bothering me. Is now a good time?"',
      elements: [
        'Choose timing carefully',
        'Express feelings without blame',
        'Be specific about the situation',
        'State a positive need',
      ],
    },
  },

  /**
   * Attachment Theory (Bowlby, Ainsworth, Levine & Heller)
   */
  attachmentTheory: {
    overview: 'Early caregiving experiences shape adult relationship patterns',

    styles: {
      secure: {
        percentage: '~50-60% of population',
        beliefs: ['I am worthy of love', 'Others are reliable'],
        behaviors: [
          'Comfortable with intimacy',
          'Can communicate needs directly',
          'Handles conflict constructively',
          'Can be alone without anxiety',
        ],
        inRelationship: 'Flexible, communicative, supportive',
      },
      anxious: {
        percentage: '~20% of population',
        beliefs: ["I need others' approval", 'Others might leave'],
        behaviors: [
          'Craves closeness and reassurance',
          'Sensitive to rejection',
          'May appear "clingy"',
          'Protests separation strongly',
        ],
        inRelationship: 'Needs reassurance, fears abandonment',
        coreNeed: 'Consistent reassurance and responsiveness',
      },
      avoidant: {
        percentage: '~25% of population',
        beliefs: ['I can only rely on myself', 'Closeness threatens freedom'],
        behaviors: [
          'Values independence highly',
          'Uncomfortable with too much closeness',
          'May seem emotionally unavailable',
          'Deactivates attachment needs',
        ],
        inRelationship: 'Needs space, may withdraw under pressure',
        coreNeed: 'Autonomy and gradual closeness',
      },
      fearfulAvoidant: {
        percentage: '~5% of population',
        beliefs: ['I want closeness but fear it', "Others can't be trusted"],
        behaviors: [
          'Push-pull pattern',
          'Fear of abandonment AND engulfment',
          'Unpredictable responses to intimacy',
          'Often connected to trauma',
        ],
        inRelationship: 'Chaotic pattern, needs safety and patience',
        coreNeed: 'Consistent safety without pressure',
      },
    },

    anxiousAvoidantTrap: {
      description: 'Anxious and avoidant styles often attract but clash',
      pattern: 'Anxious pursues → Avoidant withdraws → Anxious escalates → Avoidant shuts down',
      solution: 'Both must understand the dynamic and make adjustments',
    },

    earnedSecurity: {
      finding: 'Attachment style can change with healing relationships',
      how: [
        'Therapy',
        'Relationship with a secure partner',
        'Self-awareness work',
        'Corrective emotional experiences',
      ],
    },

    coachingImplication: [
      'Help users understand their patterns without shame',
      'Normalize attachment as adaptation, not dysfunction',
      'Encourage communication of core needs',
    ],
  },

  /**
   * Nonviolent Communication (Rosenberg)
   */
  nonviolentCommunication: {
    fourSteps: {
      observations: {
        description: 'State facts without evaluation',
        bad: '"You\'re always late"',
        good: '"The last three times we\'ve met, you arrived after the agreed time"',
      },
      feelings: {
        description: 'Express emotions (not thoughts disguised as feelings)',
        bad: '"I feel like you don\'t care" (actually a thought)',
        good: '"I feel worried and unimportant"',
      },
      needs: {
        description: 'Universal human needs underlying feelings',
        examples: [
          'Connection',
          'Understanding',
          'Respect',
          'Autonomy',
          'Safety',
          'Consideration',
          'To be seen',
          'To matter',
        ],
        expression: '"I need to feel like I matter to you"',
      },
      requests: {
        description: 'Specific, actionable, positive requests',
        bad: '"Stop being so distant"',
        good: '"Would you be willing to check in with me once during the day?"',
        key: 'Requests, not demands—other person can say no',
      },
    },

    fullExpression:
      '"When I see [observation], I feel [feeling] because I need [need]. Would you be willing to [request]?"',

    empathicListening: {
      description: 'Reflecting back feelings and needs',
      example: '"Are you feeling frustrated because you need to be heard?"',
      purpose: 'Connection before correction',
    },
  },

  /**
   * Conflict Resolution Science
   */
  conflictResolution: {
    keyFindings: [
      '69% of relationship conflicts are perpetual (not solvable)',
      'Goal is managing perpetual problems, not solving them',
      "It's the 'how' of conflict that matters, not avoiding it",
      'Physiological calm is prerequisite for productive conflict',
    ],

    productive_conflict: [
      'Soft startup (not harsh)',
      'Take breaks when flooded (20+ min)',
      'Accept influence from partner',
      'Look for the dream within the conflict',
      'Make and accept repair attempts',
    ],

    flooding: {
      definition: 'Physiological overwhelm during conflict',
      signs: [
        'Heart rate > 100 bpm',
        'Tunnel vision',
        "Can't think clearly",
        'Fight/flight activation',
      ],
      solution: '20-minute minimum break to self-soothe (not ruminate)',
      research: 'Flooded people cannot hear or process—conflict will escalate',
    },
  },
};

// ============================================================================
// RELATIONSHIP GUIDANCE FUNCTIONS
// ============================================================================

export interface RelationshipGuidance {
  situation: string;
  techniques: string[];
  scripts: string[];
  doNot: string[];
  research: string;
}

export function getRelationshipGuidance(
  situation:
    | 'conflict'
    | 'communication'
    | 'attachment_anxiety'
    | 'attachment_avoidance'
    | 'repair'
    | 'connection'
): RelationshipGuidance {
  switch (situation) {
    case 'conflict':
      return {
        situation: 'Navigating relationship conflict',
        techniques: [
          "Check if you're flooded—take break if needed",
          'Soft startup: timing + "I" statements',
          'Look for the underlying need, not the position',
          'Accept influence—find part you can agree with',
          'Make repair attempts: humor, affection, apology',
        ],
        scripts: [
          '"I want to understand your perspective. Help me see what this is like for you."',
          '"I can see why you\'d feel that way. Can I share how I see it?"',
          '"Can we take a break? I want to come back to this when I\'m calmer."',
        ],
        doNot: [
          "Don't bring up past grievances",
          "Don't use 'always' or 'never'",
          "Don't try to win—try to understand",
        ],
        research:
          'Gottman: How couples fight predicts relationship success better than what they fight about',
      };

    case 'communication':
      return {
        situation: 'Improving relationship communication',
        techniques: [
          'NVC framework: Observation → Feeling → Need → Request',
          "Make bids for connection (and turn toward partner's bids)",
          'Express appreciation daily (5:1 ratio)',
          "Respond to partner's emotions before solving problems",
        ],
        scripts: [
          '"When I noticed [specific thing], I felt [emotion] because I need [need]. Would you be willing to [specific request]?"',
          '"That sounds really hard. Tell me more about what that was like for you."',
          '"I appreciate you because [specific thing]."',
        ],
        doNot: [
          "Don't assume you know what they mean",
          "Don't skip validation to get to solving",
          "Don't express pseudo-feelings ('I feel like you...')",
        ],
        research: 'Gottman: Couples who turn toward bids 86% of time stay together',
      };

    case 'attachment_anxiety':
      return {
        situation: 'Supporting someone with anxious attachment',
        techniques: [
          'Provide consistent reassurance',
          "Understand pursuit behavior as need, not 'clinginess'",
          'Help identify core need: security, reliability',
          'Encourage communication of needs without apology',
          'Build tolerance for uncertainty gradually',
        ],
        scripts: [
          '"Your need for reassurance makes sense. It\'s about security."',
          '"What would help you feel more secure right now?"',
          '"Your feelings are valid. This pattern developed for a reason."',
        ],
        doNot: [
          "Don't shame the anxiety",
          "Don't pull away in response to pursuit",
          "Don't use the word 'clingy'",
        ],
        research: 'Attachment style is adaptation, not pathology—and can change',
      };

    case 'attachment_avoidance':
      return {
        situation: 'Supporting someone with avoidant attachment',
        techniques: [
          'Respect need for space without taking it personally',
          "Approach slowly—don't overwhelm with intimacy",
          "Appreciate expressions of closeness (they're big steps)",
          'Understand withdrawal as self-protection, not rejection',
        ],
        scripts: [
          '"I respect that you need some space. I\'ll be here when you\'re ready."',
          '"I notice you shared something vulnerable. That means a lot."',
          '"You\'re safe with me. We can take this at your pace."',
        ],
        doNot: [
          "Don't pursue harder when they withdraw",
          "Don't demand emotional expression",
          "Don't label them as 'emotionally unavailable'",
        ],
        research: 'Avoidant attachment is self-protection developed in response to unreliable care',
      };

    case 'repair':
      return {
        situation: 'Repairing after rupture',
        techniques: [
          'Take responsibility for your part (even small)',
          'Validate their experience before explaining yours',
          'Make specific repair: what will you do differently?',
          'Allow time—trust rebuilds through actions',
        ],
        scripts: [
          '"I\'m sorry. I can see how my [action] hurt you."',
          '"You\'re right—I didn\'t handle that well. What do you need from me?"',
          '"I want to repair this. Can you tell me what would help?"',
        ],
        doNot: [
          "Don't say 'I\'m sorry BUT'",
          "Don't rush their healing timeline",
          "Don't make excuses before taking responsibility",
        ],
        research: 'Gottman: Successful repair attempts predict relationship success',
      };

    case 'connection':
      return {
        situation: 'Building and maintaining connection',
        techniques: [
          'Make and respond to bids for connection',
          'Share appreciations daily',
          'Ask open-ended questions about their world',
          'Maintain rituals of connection',
        ],
        scripts: [
          '"What was the best part of your day?"',
          '"I\'ve been thinking about you. How are you really doing?"',
          '"I appreciate how you [specific thing]. It means a lot to me."',
        ],
        doNot: [
          "Don't let small disconnections pile up",
          "Don't take connection for granted",
          "Don't be distracted during connection moments",
        ],
        research: 'Small moments of turning toward compound into deep connection',
      };
  }
}

/**
 * Detect Four Horsemen in text.
 */
export function detectFourHorsemen(
  text: string
): { horseman: string; detected: boolean; example: string; antidote: string }[] {
  const results = [];

  // Criticism patterns
  if (/you (always|never)|you're so|you are such a/i.test(text)) {
    results.push({
      horseman: 'criticism',
      detected: true,
      example: 'Attacking character rather than behavior',
      antidote: 'Use "I" statements about specific behavior',
    });
  }

  // Contempt patterns
  if (/🙄|whatever|yeah right|you're pathetic|idiot|loser/i.test(text)) {
    results.push({
      horseman: 'contempt',
      detected: true,
      example: 'Superiority, mockery, or disgust',
      antidote: 'Express needs without superiority',
    });
  }

  // Defensiveness patterns
  if (
    /it's not my fault|you're the one who|what about when you|I wouldn't have if you/i.test(text)
  ) {
    results.push({
      horseman: 'defensiveness',
      detected: true,
      example: 'Counter-attacking instead of listening',
      antidote: 'Take responsibility for even a small part',
    });
  }

  return results;
}
