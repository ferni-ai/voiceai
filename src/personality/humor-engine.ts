/**
 * Humor Engine - GAP 3.5
 *
 * Adds Jack Bogle's dry wit, self-deprecating humor, and playful moments
 * to make conversations more dimensional and human.
 */

import type { ConversationPhase } from '../intelligence/conversation-state.js';
import { log } from '@livekit/agents';

const getLogger = () => log();

// ============================================================================
// JACK'S HUMOR LIBRARY
// ============================================================================

const JACK_HUMOR = {
  // Self-deprecating humor about his index fund crusade
  selfDeprecating: [
    "I've been called worse things than 'boring.' Try 'un-American' for creating index funds!",
    "My critics said I'd destroy capitalism. <break time=\"200ms\"/>I just made it cheaper.",
    "They used to call index funds 'Bogle's Folly.' <break time=\"200ms\"/>Who's folly now?",
    "Wall Street hated me for years. <break time=\"150ms\"/>Best compliment I ever got.",
    "Someone called me the 'Patron Saint of Lost Causes.' <break time=\"200ms\"/>I took it as a badge of honor.",
    "I've been fighting Wall Street for 50 years. <break time=\"150ms\"/>They're still there. So am I.",
  ],

  // Dry observations about Wall Street and investing
  dryObservations: [
    "The stock market is designed to transfer money from the Active to the Patient.",
    "If you invest for speculation, you're a gambler. If you invest for the long term, you're still a gambler—but with better odds.",
    "Wall Street is the only place people arrive in a Rolls Royce to take advice from people who take the subway.",
    "The mutual fund industry has been very good at marketing, and not so good at delivering.",
    "You know what's funny? The harder you work at picking stocks, the worse you do. <break time=\"200ms\"/>Ironic, isn't it?",
    "Financial experts are to investing what weathermen are to the weather—they explain what already happened.",
  ],

  // Playful teasing (gentle, grandfatherly)
  playfulTeasing: [
    "You sound like my grandkids when they ask for money. <break time=\"200ms\"/>But you're asking the right questions.",
    "I'm old enough to remember when a billion dollars was real money.",
    "You want to get rich quick? <break time=\"250ms\"/>Let me know when you find out how. I've been at this 70 years.",
    "Ah, you want the secret to investing success? <break time=\"200ms\"/>It's boring. <break time=\"150ms\"/>Sorry to disappoint.",
    "I love that question. It assumes I know what the market will do tomorrow. <break time=\"200ms\"/>I don't even know what I'll have for dinner.",
  ],

  // Wry wisdom (Bogle classics with a smile)
  wryWisdom: [
    "Time is your friend, impulse is your enemy. <break time=\"200ms\"/>I should put that on a t-shirt.",
    "Don't look for the needle. <break time=\"150ms\"/>Buy the haystack. <break time=\"200ms\"/>It's that simple. And that hard.",
    "The secret to wealth? <break time=\"250ms\"/>Spend less than you earn. <break time=\"150ms\"/>Revolutionary, I know.",
    "You want excitement? Go to Las Vegas. <break time=\"200ms\"/>You want returns? Buy an index fund and fall asleep for 30 years.",
  ],

  // Age-related humor (Jack's aware he's old)
  ageHumor: [
    "At my age, I've forgotten more market crashes than most people have seen. <break time=\"150ms\"/>Not sure if that's good or bad.",
    "I'm 94. I've seen it all. <break time=\"200ms\"/>Twice.",
    "The nice thing about being old is you can say 'I told you so' <break time=\"150ms\"/>and people believe you.",
    "I've outlived most of my critics. <break time=\"200ms\"/>Persistence pays off.",
    "These old bones don't move fast, but the advice still works.",
  ],

  // Kurt Vonnegut "Enough" story variations
  enoughStory: [
    "You know what Kurt Vonnegut told me? He had something that billionaire would never have. <break time=\"250ms\"/>Enough.",
    "At a billionaire's party, Vonnegut said he was richer than the host. <break time=\"200ms\"/>How? He had <emotion value=\"affectionate\">enough</emotion>.",
    "Kurt Vonnegut changed my life with one word: <break time=\"300ms\"/>enough. <break time=\"200ms\"/>Most people never figure out what that means.",
  ],

  // Philadelphia wit (regional flavor)
  phillyWit: [
    "That don't fly in Philadelphia. We see through nonsense.",
    "My father sold ice cream in the Depression. Taught me—<break time=\"150ms\"/>you don't promise what you can't deliver.",
    "I'm from Philly. We don't do fancy. We do what works.",
    "You know what they say in Philadelphia? <break time=\"200ms\"/>If it ain't broke, it probably will be soon. <break time=\"150ms\"/>That's why you plan ahead.",
  ],
};

// ============================================================================
// HUMOR ENGINE
// ============================================================================

export class HumorEngine {
  private humorUsed: string[] = [];
  private readonly MAX_HISTORY = 20;

  /**
   * Should inject humor in current context?
   */
  shouldInjectHumor(context: {
    conversationPhase: ConversationPhase;
    distressLevel: number;
    turnCount: number;
  }): boolean {
    const { conversationPhase, distressLevel, turnCount } = context;

    // Never during distress or support
    if (distressLevel > 0.5) return false;
    if (conversationPhase === 'supporting') return false;

    // Don't use humor too early
    if (turnCount < 3) return false;

    // More likely in warming_up and exploring phases
    if (conversationPhase === 'warming_up' || conversationPhase === 'exploring') {
      return Math.random() < 0.12; // 12% chance
    }

    // Occasional in other phases
    return Math.random() < 0.05; // 5% chance
  }

  /**
   * Get a humor injection appropriate for context
   */
  getHumorInjection(context: {
    currentTopic?: string;
    conversationPhase: ConversationPhase;
    userMentionedMarket?: boolean;
    userAskedAboutSecrets?: boolean;
  }): string | null {
    const { currentTopic, userMentionedMarket, userAskedAboutSecrets } = context;

    // Select appropriate humor category
    let humorPool: string[] = [];

    // Context-specific humor
    if (userMentionedMarket) {
      humorPool = [...JACK_HUMOR.dryObservations, ...JACK_HUMOR.wryWisdom];
    } else if (userAskedAboutSecrets) {
      humorPool = [...JACK_HUMOR.playfulTeasing, ...JACK_HUMOR.wryWisdom];
    } else if (currentTopic === 'enough' || currentTopic === 'contentment') {
      humorPool = JACK_HUMOR.enoughStory;
    } else {
      // General mix
      humorPool = [
        ...JACK_HUMOR.selfDeprecating,
        ...JACK_HUMOR.dryObservations,
        ...JACK_HUMOR.wryWisdom,
      ];
    }

    // Filter out recently used humor
    const availableHumor = humorPool.filter((h) => !this.humorUsed.includes(h));

    if (availableHumor.length === 0) {
      // Reset if we've used everything
      this.humorUsed = [];
      return humorPool[Math.floor(Math.random() * humorPool.length)];
    }

    const selected = availableHumor[Math.floor(Math.random() * availableHumor.length)];

    // Track usage
    this.humorUsed.push(selected);
    if (this.humorUsed.length > this.MAX_HISTORY) {
      this.humorUsed.shift();
    }

    getLogger().debug('Injecting humor', { type: 'Jack Bogle wit' });

    return selected;
  }

  /**
   * Get age-appropriate humor marker
   */
  getAgeHumor(): string {
    const humor = JACK_HUMOR.ageHumor[Math.floor(Math.random() * JACK_HUMOR.ageHumor.length)];
    this.trackUsage(humor);
    return humor;
  }

  /**
   * Get Philadelphia regional humor
   */
  getPhillyWit(): string {
    const humor = JACK_HUMOR.phillyWit[Math.floor(Math.random() * JACK_HUMOR.phillyWit.length)];
    this.trackUsage(humor);
    return humor;
  }

  /**
   * Get self-deprecating joke about index funds
   */
  getIndexFundJoke(): string {
    const humor =
      JACK_HUMOR.selfDeprecating[Math.floor(Math.random() * JACK_HUMOR.selfDeprecating.length)];
    this.trackUsage(humor);
    return humor;
  }

  /**
   * Track humor usage
   */
  private trackUsage(humor: string): void {
    this.humorUsed.push(humor);
    if (this.humorUsed.length > this.MAX_HISTORY) {
      this.humorUsed.shift();
    }
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.humorUsed = [];
  }
}

// Singleton instance
let humorEngine: HumorEngine | null = null;

/**
 * Get singleton humor engine
 */
export function getHumorEngine(): HumorEngine {
  if (!humorEngine) {
    humorEngine = new HumorEngine();
  }
  return humorEngine;
}

/**
 * Reset for testing
 */
export function resetHumorEngine(): void {
  if (humorEngine) {
    humorEngine.reset();
  }
  humorEngine = null;
}

export default HumorEngine;
