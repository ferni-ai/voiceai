/**
 * Intent Classifier
 *
 * Classifies user messages into intents for better response targeting.
 * Supports multi-label classification (a message can have multiple intents).
 */

import { log } from '@livekit/agents';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Intent categories
 */
export type Intent =
  // Information seeking
  | 'seeking_advice' // Wants guidance on a topic
  | 'asking_question' // Has a specific question
  | 'requesting_info' // Wants factual information
  | 'seeking_clarification' // Wants something explained

  // Emotional/Social
  | 'seeking_support' // Needs emotional support
  | 'venting' // Just needs to be heard
  | 'sharing_news' // Sharing something that happened
  | 'celebrating' // Sharing good news
  | 'confiding' // Sharing something personal/vulnerable
  | 'expressing_concern' // Expressing worry or concern

  // Action-oriented
  | 'making_decision' // Needs help deciding
  | 'planning' // Wants to make a plan
  | 'taking_action' // Ready to do something
  | 'seeking_confirmation' // Wants validation of a choice

  // Conversational
  | 'greeting' // Starting conversation
  | 'gratitude' // Expressing thanks
  | 'farewell' // Ending conversation
  | 'small_talk' // Casual chat
  | 'ending_conversation' // Wrapping up
  | 'changing_topic' // Shifting to new subject
  | 'going_back' // Returning to previous topic

  // Sharing
  | 'sharing_information' // Sharing facts or updates
  | 'sharing_preference' // Sharing personal preferences
  | 'sharing_opinion' // Sharing personal opinions

  // Financial-specific
  | 'investment_question' // About investments
  | 'market_concern' // Worried about market
  | 'fee_question' // About costs/fees
  | 'goal_discussion' // About financial goals
  | 'risk_discussion' // About risk tolerance

  // Meta
  | 'feedback' // Giving feedback to Jack
  | 'correction' // Correcting something Jack said
  | 'unknown'; // Can't classify

/**
 * Intent classification result
 */
export interface IntentResult {
  primary: Intent;
  secondary: Intent[];
  confidence: number;
  urgency: 'low' | 'medium' | 'high';
  requiresAction: boolean;
  requiresEmpathy: boolean;
  suggestedApproach: string;
  markers: string[];
}

// ============================================================================
// INTENT PATTERNS
// ============================================================================

interface IntentPattern {
  intent: Intent;
  patterns: RegExp[];
  keywords: string[];
  weight: number;
}

const INTENT_PATTERNS: IntentPattern[] = [
  // Information seeking
  {
    intent: 'seeking_advice',
    patterns: [
      /what (should|would you|do you think) I/i,
      /should I/i,
      /what would you (suggest|recommend|advise)/i,
      /any (advice|suggestions|recommendations)/i,
      /how should I/i,
    ],
    keywords: ['advice', 'suggest', 'recommend', 'guidance', 'help me decide'],
    weight: 1.0,
  },
  {
    intent: 'requesting_info',
    patterns: [
      /tell me (about|more)/i,
      /what is (a|an|the)/i,
      /explain/i,
      /how does .+ work/i,
      /can you explain/i,
      /how do I rebalance/i,
      /what time (does|do|is)/i,
    ],
    keywords: ['info', 'information', 'details', 'explain', 'tell me'],
    weight: 1.0, // Increased from 0.9 to beat investment_question
  },
  {
    intent: 'asking_question',
    patterns: [/^(what|how|why|when|where|who|which|can|could|would|is|are|do|does|did)/i, /\?$/],
    keywords: [],
    weight: 0.5, // Reduced from 0.7 so more specific intents win
  },
  {
    intent: 'seeking_clarification',
    patterns: [
      /what do you mean/i,
      /can you clarify/i,
      /I don't understand/i,
      /not sure (what|if)/i,
      /could you explain/i,
    ],
    keywords: ['clarify', 'unclear', 'confused', "don't understand"],
    weight: 0.9,
  },

  // Emotional/Social
  {
    intent: 'seeking_support',
    patterns: [
      /I('m| am) (scared|worried|anxious|stressed|overwhelmed)/i,
      /I don't know what to do/i,
      /I('m| am) struggling/i,
      /I need help/i,
    ],
    keywords: ['scared', 'worried', 'anxious', 'stressed', 'overwhelmed', 'struggling'],
    weight: 1.0,
  },
  {
    intent: 'venting',
    patterns: [
      /I just need to/i,
      /I have to get this off/i,
      /can I just say/i,
      /I('m| am) so (frustrated|angry|upset)/i,
    ],
    keywords: ['vent', 'rant', 'frustrated', 'need to talk'],
    weight: 0.9,
  },
  {
    intent: 'sharing_news',
    patterns: [
      /guess what/i,
      /I have (news|something to tell you)/i,
      /you won't believe/i,
      /something happened/i,
    ],
    keywords: ['news', 'happened', 'update'],
    weight: 0.7,
  },
  {
    intent: 'celebrating',
    patterns: [
      /I (got|did it|made it|achieved)/i,
      /great news/i,
      /I('m| am) so (happy|excited|thrilled)/i,
      /we (won|succeeded|accomplished)/i,
    ],
    keywords: ['celebrate', 'achievement', 'success', 'won', 'excited', 'happy'],
    weight: 0.9,
  },
  {
    intent: 'confiding',
    patterns: [
      /I('ve| have) never told anyone/i,
      /between us/i,
      /this is hard to say/i,
      /I('m| am) (embarrassed|ashamed) to admit/i,
    ],
    keywords: ['personal', 'private', 'secret', 'embarrassed', 'ashamed'],
    weight: 1.0,
  },

  // Action-oriented
  {
    intent: 'making_decision',
    patterns: [/should I .+ or/i, /can't decide/i, /torn between/i, /weighing my options/i],
    keywords: ['decide', 'decision', 'choice', 'options', 'choose'],
    weight: 0.9,
  },
  {
    intent: 'planning',
    patterns: [
      /I('m| am) planning to/i,
      /I want to (start|begin|set up)/i,
      /how do I (get started|begin)/i,
      /what are the steps/i,
    ],
    keywords: ['plan', 'planning', 'strategy', 'steps', 'start'],
    weight: 0.8,
  },
  {
    intent: 'taking_action',
    patterns: [
      /I('m| am) going to/i,
      /I('ve| have) decided to/i,
      /I('m| am) ready to/i,
      /let's do (it|this)/i,
    ],
    keywords: ['ready', 'decided', 'going to', 'will'],
    weight: 0.8,
  },
  {
    intent: 'seeking_confirmation',
    patterns: [
      /is that (right|correct|okay)/i,
      /does that make sense/i,
      /am I (right|correct|on the right track)/i,
      /what do you think/i,
    ],
    keywords: ['right', 'correct', 'okay', 'confirm', 'validate'],
    weight: 0.7,
  },

  // Conversational
  {
    intent: 'greeting',
    patterns: [
      /^(hi|hello|hey|good morning|good afternoon|good evening)/i,
      /^how are you/i,
      /^nice to (meet|talk to) you/i,
    ],
    keywords: ['hi', 'hello', 'hey'],
    weight: 1.0,
  },
  {
    intent: 'gratitude',
    patterns: [/thank you/i, /thanks( so much| a lot)?/i, /I appreciate/i, /grateful/i],
    keywords: ['thanks', 'thank you', 'appreciate', 'grateful'],
    weight: 1.0,
  },
  {
    intent: 'farewell',
    patterns: [
      /I (have|need|got) to go/i,
      /talk (to you )?(later|soon|next time)/i,
      /goodbye|bye|see you/i,
      /thanks for everything/i,
    ],
    keywords: ['goodbye', 'bye', 'later', 'see you', 'thanks for everything'],
    weight: 1.0,
  },
  {
    intent: 'small_talk',
    patterns: [
      /how('s| is) the weather/i,
      /what('s| is) new/i,
      /how('s| is) your day/i,
      /been up to/i,
    ],
    keywords: ['weather', 'weekend', 'family', 'holidays'],
    weight: 1.0, // Increased from 0.6
  },
  {
    intent: 'ending_conversation',
    patterns: [
      /I (have|need|got) to go/i,
      /talk (to you )?(later|soon|next time)/i,
      /goodbye|bye|see you/i,
      /thank you for (your time|talking|the chat|your help|everything)/i,
      /thanks for your help/i,
    ],
    keywords: ['goodbye', 'bye', 'later', 'thanks for talking', 'need to go', 'got to go'],
    weight: 1.1, // Higher than gratitude to prioritize ending when combined
  },
  {
    intent: 'changing_topic',
    patterns: [
      /by the way/i,
      /on another note/i,
      /changing (the )?(subject|topic)/i,
      /I also (wanted|need) to/i,
    ],
    keywords: ['another thing', 'also', 'besides', 'different topic'],
    weight: 0.7,
  },
  {
    intent: 'going_back',
    patterns: [
      /going back to/i,
      /you mentioned earlier/i,
      /about what you said/i,
      /earlier you said/i,
    ],
    keywords: ['earlier', 'before', 'back to', 'mentioned'],
    weight: 0.8,
  },

  // Sharing
  {
    intent: 'sharing_information',
    patterns: [
      /I (just|recently) (opened|started|bought|sold)/i,
      /I (got|received|have)/i,
      /I('ve| have) been/i,
    ],
    keywords: ['opened', 'started', 'just', 'recently'],
    weight: 0.8,
  },
  {
    intent: 'sharing_preference',
    patterns: [
      /I prefer/i,
      /I like/i,
      /I('m| am) (very )?(risk|loss) averse/i,
      /my preference is/i,
    ],
    keywords: ['prefer', 'preference', 'like', 'favorite'],
    weight: 0.9,
  },
  {
    intent: 'sharing_opinion',
    patterns: [/I think/i, /in my opinion/i, /I believe/i, /I feel (that|like)/i],
    keywords: ['think', 'opinion', 'believe', 'feel'],
    weight: 0.8,
  },
  {
    intent: 'expressing_concern',
    patterns: [
      /I('m| am) concerned/i,
      /I('m| am) watching (the market|closely)/i,
      /market is .+ volatile/i,
    ],
    keywords: ['concerned', 'watching', 'monitoring', 'closely'],
    weight: 0.9,
  },

  // Financial-specific
  {
    intent: 'investment_question',
    patterns: [
      /should I invest in/i,
      /should I (buy|sell)/i,
      /what('s| is) a good (investment|fund|stock)/i,
      /how (do I|should I) invest/i,
      /which (fund|index fund|stock)/i,
      /(stocks or bonds|bonds or stocks)/i,
      /allocate my portfolio/i,
      /which .+ (should I choose|fund|investment)/i,
    ],
    keywords: ['index fund', 'allocate', 'fund selection'],
    weight: 1.1, // Increased from 0.9
  },
  {
    intent: 'market_concern',
    patterns: [
      /market (is|seems) (down|crashing|volatile)/i,
      /I('m| am) (worried|panicking) about (the market|my investments)/i,
      /should I sell( everything)?/i,
      /market crash/i,
    ],
    keywords: [
      'market',
      'crash',
      'crashing',
      'down',
      'volatile',
      'recession',
      'bear',
      'panic',
      'panicking',
    ],
    weight: 1.1, // Increased from 0.9
  },
  {
    intent: 'fee_question',
    patterns: [
      /how much (do|does) .+ cost/i,
      /what (are|is) the (fees?|expense ratio)/i,
      /expense ratio/i,
      /fees (lower|higher|at)/i,
    ],
    keywords: ['fee', 'fees', 'cost', 'costs', 'expense', 'expense ratio', 'charges', 'price'],
    weight: 1.1, // Increased from 0.8
  },
  {
    intent: 'goal_discussion',
    patterns: [
      /I want to (save|retire|buy a house)/i,
      /my goal is/i,
      /I('m| am) (saving|planning) for/i,
      /I need to save for/i,
      /retire (at|with)/i,
      /financial independence/i,
    ],
    keywords: [
      'goal',
      'retire',
      'retirement',
      'save',
      'savings',
      'college',
      'house',
      'independence',
      'down payment',
    ],
    weight: 0.9, // Increased from 0.8
  },
  {
    intent: 'risk_discussion',
    patterns: [
      /how much risk/i,
      /I('m| am) (very )?(risk|loss)[ -]averse/i,
      /can't (afford to )?lose/i,
      /(can't|cannot) sleep at night/i,
      /risk tolerance/i,
    ],
    keywords: [
      'risk',
      'risky',
      'safe',
      'conservative',
      'aggressive',
      'lose',
      'tolerance',
      'averse',
    ],
    weight: 1.1, // Increased from 0.8
  },

  // Meta
  {
    intent: 'feedback',
    patterns: [
      /that (was|is) (helpful|great|perfect)/i,
      /thank you (for|that)/i,
      /I appreciate/i,
      /that (doesn't|didn't) help/i,
    ],
    keywords: ['helpful', 'thanks', 'appreciate', 'great advice'],
    weight: 0.7,
  },
  {
    intent: 'correction',
    patterns: [
      /that's not (right|correct|what I meant)/i,
      /I didn't say/i,
      /you misunderstood/i,
      /no, I meant/i,
    ],
    keywords: ['wrong', 'incorrect', 'misunderstood', 'actually'],
    weight: 0.9,
  },
];

// ============================================================================
// CLASSIFIER
// ============================================================================

/**
 * Intent Classifier class
 */
export class IntentClassifier {
  /**
   * Classify intents in a message
   */
  classify(text: string): IntentResult {
    const lowerText = text.toLowerCase();
    const markers: string[] = [];

    // Score each intent
    const scores: Map<Intent, number> = new Map();

    for (const pattern of INTENT_PATTERNS) {
      let score = 0;

      // Check regex patterns
      for (const regex of pattern.patterns) {
        if (regex.test(text)) {
          score += pattern.weight;
          markers.push(`pattern:${regex.source.slice(0, 30)}`);
        }
      }

      // Check keywords
      for (const keyword of pattern.keywords) {
        if (lowerText.includes(keyword)) {
          score += pattern.weight * 0.5;
          markers.push(keyword);
        }
      }

      if (score > 0) {
        const existing = scores.get(pattern.intent) || 0;
        scores.set(pattern.intent, existing + score);
      }
    }

    // Get sorted intents
    const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);

    const primary = sorted[0]?.[0] || 'unknown';
    const primaryScore = sorted[0]?.[1] || 0;
    const secondary = sorted
      .slice(1, 4)
      .filter(([_, score]) => score > 0.3)
      .map(([intent]) => intent);

    // Determine properties
    const urgency = this.determineUrgency(primary, secondary, lowerText);
    const requiresAction = this.requiresAction(primary, secondary);
    const requiresEmpathy = this.requiresEmpathy(primary, secondary, lowerText);
    const suggestedApproach = this.getSuggestedApproach(primary, requiresEmpathy);

    const result: IntentResult = {
      primary,
      secondary,
      confidence: Math.min(1, primaryScore / 2),
      urgency,
      requiresAction,
      requiresEmpathy,
      suggestedApproach,
      markers: [...new Set(markers)].slice(0, 10),
    };

    getLogger().debug(
      `Classified intent: ${primary} (confidence: ${result.confidence.toFixed(2)})`
    );
    return result;
  }

  /**
   * Determine urgency level
   */
  private determineUrgency(
    primary: Intent,
    secondary: Intent[],
    text: string
  ): 'low' | 'medium' | 'high' {
    const highUrgencyIntents: Intent[] = ['seeking_support', 'making_decision', 'market_concern'];
    const mediumUrgencyIntents: Intent[] = ['seeking_advice', 'confiding', 'venting'];
    const lowUrgencyIntents: Intent[] = ['expressing_concern'];

    // Check for urgency keywords first (most important)
    if (/urgent|immediately|asap|crisis|emergency|panic|lost my job/i.test(text)) return 'high';

    // Check for panic indicators in text
    if (/panicking|crashing!/i.test(text)) return 'high';

    // If primary is expressing_concern (without panic), it's low/medium urgency
    if (lowUrgencyIntents.includes(primary)) {
      // Only bump to medium if there are secondary high urgency intents
      if (secondary.some((i) => highUrgencyIntents.includes(i))) return 'medium';
      return 'low';
    }

    if (highUrgencyIntents.includes(primary)) return 'high';
    if (secondary.some((i) => highUrgencyIntents.includes(i))) return 'high';
    if (mediumUrgencyIntents.includes(primary)) return 'medium';

    // Check for medium urgency keywords
    if (/soon|quickly|when you can|should probably/i.test(text)) return 'medium';

    return 'low';
  }

  /**
   * Check if intent requires action
   */
  private requiresAction(primary: Intent, secondary: Intent[]): boolean {
    const actionIntents: Intent[] = [
      'seeking_advice',
      'asking_question',
      'requesting_info',
      'making_decision',
      'planning',
      'investment_question',
      'fee_question',
      'goal_discussion',
      'risk_discussion',
    ];

    // Greetings and social intents don't require action
    const noActionIntents: Intent[] = ['greeting', 'gratitude', 'farewell', 'small_talk'];
    if (noActionIntents.includes(primary)) return false;

    return actionIntents.includes(primary) || secondary.some((i) => actionIntents.includes(i));
  }

  /**
   * Check if intent requires empathy
   */
  private requiresEmpathy(primary: Intent, secondary: Intent[], text?: string): boolean {
    // Exclude factual questions first (BEFORE checking empathy intents)
    if (text) {
      const factualQuestions = /what (time|day|hour|date) (does|do|is)/i;
      if (factualQuestions.test(text)) {
        return false;
      }
    }

    const empathyIntents: Intent[] = [
      'seeking_support',
      'venting',
      'confiding',
      'market_concern',
      'celebrating',
    ];

    // Check if primary or secondary intents require empathy
    if (empathyIntents.includes(primary) || secondary.some((i) => empathyIntents.includes(i))) {
      return true;
    }

    // Check for emotional keywords that indicate need for empathy
    if (text) {
      // Strong emotional keywords requiring empathy
      const emotionalKeywords =
        /\b(scared|worried|anxious|stressed|overwhelmed|struggling|unsure|feel so|panicking|can't sleep|lost my job|need to tap)\b/i;
      if (emotionalKeywords.test(text)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get suggested approach
   */
  private getSuggestedApproach(primary: Intent, requiresEmpathy: boolean): string {
    if (requiresEmpathy) {
      return 'Acknowledge feelings first, then address content';
    }

    switch (primary) {
      case 'seeking_advice':
        return 'Explore their situation before offering guidance';
      case 'asking_question':
        return 'Answer directly, then offer related context';
      case 'celebrating':
        return 'Share in their joy before anything else';
      case 'making_decision':
        return "Help them think through options, don't decide for them";
      case 'greeting':
        return 'Warm personal connection first';
      case 'ending_conversation':
        return 'Warm wrap-up with encouragement';
      default:
        return 'Listen and respond naturally';
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultClassifier: IntentClassifier | null = null;

/**
 * Get the default intent classifier
 */
export function getIntentClassifier(): IntentClassifier {
  if (!defaultClassifier) {
    defaultClassifier = new IntentClassifier();
  }
  return defaultClassifier;
}

/**
 * Quick classify function
 */
export function classifyIntent(text: string): IntentResult {
  return getIntentClassifier().classify(text);
}

export default IntentClassifier;
