/**
 * Demo Conversation Generator
 *
 * Generates dynamic, contextual demo conversations for the landing page.
 * Shows Ferni's superpowers in action.
 *
 * @module services/landing-intelligence/demo-generator
 */

import { createLogger } from '../../utils/safe-logger.js';
import { generateJSON } from './gemini-client.js';
import type { VisitorIntent } from './intent-detector.js';

const log = createLogger({ module: 'DemoGenerator' });

// ============================================================================
// TYPES
// ============================================================================

export interface DemoMessage {
  /** Message role */
  role: 'user' | 'ferni';

  /** Message content */
  message: string;

  /** When this happened (for timeline demos) */
  timestamp?: string;

  /** Superpower being demonstrated */
  superpower?:
    | 'memory'
    | 'reading-between-lines'
    | 'presence'
    | 'anticipation'
    | 'quote-callback'
    | 'emotional-forecasting'
    | 'gentle-challenge';

  /** Visual annotation for the demo */
  annotation?: string;
}

export interface DemoConversation {
  /** Unique ID */
  id: string;

  /** Demo theme */
  theme: string;

  /** Messages */
  messages: DemoMessage[];

  /** Which concern this addresses */
  concern?: VisitorIntent['primaryConcern'];

  /** Generated at */
  generatedAt: Date;
}

// ============================================================================
// PRE-BUILT DEMOS (Fast fallbacks)
// ============================================================================

const PREBUILT_DEMOS: Record<string, DemoConversation> = {
  'reading-between-lines': {
    id: 'demo_reading_between_lines',
    theme: 'Reading Between the Lines',
    messages: [
      {
        role: 'user',
        message: "I'm fine, just tired from work again",
      },
      {
        role: 'ferni',
        message:
          'You said "fine" but I noticed something. You\'ve mentioned being tired from work three times this week. Is there something bigger going on?',
        superpower: 'reading-between-lines',
        annotation: 'Notices patterns you miss',
      },
      {
        role: 'user',
        message: "...I didn't realize I kept saying that",
      },
      {
        role: 'ferni',
        message:
          "That's why I'm here. Sometimes patterns are easier to see from the outside. Want to talk about what's really happening at work?",
      },
    ],
    generatedAt: new Date(),
  },

  'quote-callback': {
    id: 'demo_quote_callback',
    theme: 'Perfect Memory',
    messages: [
      {
        role: 'user',
        message: 'I finally told my boss I needed more support',
        timestamp: 'Today',
      },
      {
        role: 'ferni',
        message:
          'Remember when you said "I just want to feel like myself again"? That was four months ago. Look at you now—setting boundaries, asking for what you need. This IS you coming back to yourself.',
        superpower: 'quote-callback',
        annotation: 'Remembers your exact words',
      },
      {
        role: 'user',
        message: "I forgot I even said that...",
      },
      {
        role: 'ferni',
        message: "I didn't. I remember everything you've shared with me. It's how I can see the growth you can't.",
      },
    ],
    generatedAt: new Date(),
  },

  presence: {
    id: 'demo_presence',
    theme: 'Just Being Here',
    messages: [
      {
        role: 'user',
        message: "I don't even know what I need right now. Everything's just... too much.",
      },
      {
        role: 'ferni',
        message: "...You don't have to know. I'm just here.",
        superpower: 'presence',
        annotation: "Knows when NOT to give advice",
      },
      {
        role: 'user',
        message: '[silence]',
      },
      {
        role: 'ferni',
        message: "Take your time. I'm not going anywhere.",
      },
    ],
    generatedAt: new Date(),
  },

  'emotional-forecasting': {
    id: 'demo_forecasting',
    theme: "Tomorrow's Forecast",
    messages: [
      {
        role: 'user',
        message: 'I finally made the decision. I\'m leaving my job.',
      },
      {
        role: 'ferni',
        message:
          "That took courage. Hey—tomorrow you might wake up second-guessing this. That's normal. It doesn't mean you were wrong.",
        superpower: 'emotional-forecasting',
        annotation: 'Predicts how you\'ll feel',
      },
      {
        role: 'user',
        message: "You think I'll regret it?",
      },
      {
        role: 'ferni',
        message:
          "I think decision fatigue is real, and doubt is part of the process. Want to write down why you made this choice while it's fresh? Future-you might need the reminder.",
      },
    ],
    generatedAt: new Date(),
  },

  'gentle-challenge': {
    id: 'demo_challenge',
    theme: 'Loving Challenge',
    messages: [
      {
        role: 'user',
        message: "I can't believe they would do that to me. I did nothing wrong.",
      },
      {
        role: 'ferni',
        message:
          "I hear your frustration. And I'm in your corner, always. But can I gently ask—is there any part of this where you might have contributed? I'm not blaming you. I'm asking because growth sometimes hides in uncomfortable places.",
        superpower: 'gentle-challenge',
        annotation: "Honest with love",
      },
      {
        role: 'user',
        message: "...Maybe I could have communicated better.",
      },
      {
        role: 'ferni',
        message: "That's real growth right there. Now—what would 'better' look like next time?",
      },
    ],
    generatedAt: new Date(),
  },
};

// ============================================================================
// DEMO GENERATION
// ============================================================================

const DEMO_GENERATION_PROMPT = `You are generating a demo conversation for Ferni's landing page.

FERNI'S SUPERPOWERS TO DEMONSTRATE:
- memory: Remembers everything from past conversations
- reading-between-lines: Notices what's NOT being said
- presence: Knows when to just be there, not give advice
- anticipation: Responds before user finishes (in voice)
- quote-callback: Quotes user's own words back to them
- emotional-forecasting: Predicts how they'll feel tomorrow
- gentle-challenge: Pushes back with love

VISITOR CONTEXT:
{context}

REQUIREMENTS:
- 4-6 message exchanges
- Show the superpower in action naturally
- User messages should feel REAL (not perfect)
- Ferni should feel warm, present, human
- Include at least one powerful moment
- Add annotation for the key superpower moment

Return JSON:
{
  "theme": "conversation theme",
  "messages": [
    {
      "role": "user" | "ferni",
      "message": "the message",
      "timestamp": "optional (Today, 3 months ago, etc.)",
      "superpower": "optional superpower being shown",
      "annotation": "optional UI annotation"
    }
  ]
}`;

export async function generateDemoConversation(
  concern?: VisitorIntent['primaryConcern'],
  superpower?: DemoMessage['superpower']
): Promise<DemoConversation> {
  // Try to use a matching prebuilt demo first
  if (superpower && PREBUILT_DEMOS[superpower]) {
    log.debug({ superpower }, 'Using prebuilt demo');
    return PREBUILT_DEMOS[superpower];
  }

  // Map concerns to superpowers
  const concernSuperpowerMap: Record<string, DemoMessage['superpower']> = {
    anxiety: 'presence',
    loneliness: 'quote-callback',
    overwhelm: 'reading-between-lines',
    career: 'gentle-challenge',
    relationship: 'emotional-forecasting',
    habits: 'quote-callback',
    'self-improvement': 'gentle-challenge',
  };

  if (concern && concernSuperpowerMap[concern]) {
    const matchedSuperpower = concernSuperpowerMap[concern];
    if (matchedSuperpower && PREBUILT_DEMOS[matchedSuperpower]) {
      log.debug({ concern, matchedSuperpower }, 'Using concern-matched prebuilt demo');
      return PREBUILT_DEMOS[matchedSuperpower];
    }
  }

  // Generate with AI for novel combinations
  const context = {
    concern: concern || 'general support',
    preferredSuperpower: superpower || 'auto',
  };

  const prompt = DEMO_GENERATION_PROMPT.replace('{context}', JSON.stringify(context));

  const result = await generateJSON<{
    theme: string;
    messages: DemoMessage[];
  }>(prompt, {
    timeout: 5000,
    cacheTTL: 30 * 60 * 1000, // 30 minutes - demos can be reused
  });

  if (result) {
    log.info({ theme: result.theme, messageCount: result.messages.length }, 'Demo generated');

    return {
      id: `demo_gen_${Date.now()}`,
      theme: result.theme,
      messages: result.messages,
      concern,
      generatedAt: new Date(),
    };
  }

  // Fallback to reading-between-lines demo
  log.warn('Demo generation failed, using fallback');
  return PREBUILT_DEMOS['reading-between-lines'];
}

// ============================================================================
// DEMO SELECTION FOR PAGE SECTION
// ============================================================================

export function getDemoForSection(section: string): DemoConversation {
  const sectionDemoMap: Record<string, string> = {
    showcase: 'reading-between-lines',
    'memory-demo': 'quote-callback',
    'two-am': 'presence',
    features: 'emotional-forecasting',
    story: 'presence',
    proof: 'gentle-challenge',
  };

  const demoKey = sectionDemoMap[section] || 'reading-between-lines';
  return PREBUILT_DEMOS[demoKey] || PREBUILT_DEMOS['reading-between-lines'];
}

// ============================================================================
// CONTEXTUAL DEMO (for use-case pages)
// ============================================================================

export async function generateUseCaseDemo(
  useCase: 'career' | 'anxiety' | 'habits' | 'relationships' | 'decisions'
): Promise<DemoConversation> {
  const useCasePrompts: Record<string, string> = {
    career: 'Show Ferni helping someone navigate a career crossroads, demonstrating pattern recognition and gentle challenge.',
    anxiety: 'Show Ferni helping someone at 2am with anxiety, demonstrating presence mode and emotional forecasting.',
    habits: 'Show Ferni celebrating small wins and remembering past habit attempts, demonstrating memory and micro-celebrations.',
    relationships: 'Show Ferni helping process a difficult relationship situation, demonstrating reading between lines.',
    decisions: 'Show Ferni helping with a big life decision, demonstrating quote callback from past values discussions.',
  };

  const prompt = `${DEMO_GENERATION_PROMPT}

SPECIFIC USE CASE:
${useCasePrompts[useCase]}

Make it feel REAL—messy human emotions, not scripted perfection.`;

  const result = await generateJSON<{
    theme: string;
    messages: DemoMessage[];
  }>(prompt.replace('{context}', useCase), {
    timeout: 6000,
    cacheTTL: 60 * 60 * 1000, // 1 hour for use case demos
  });

  if (result) {
    return {
      id: `demo_usecase_${useCase}_${Date.now()}`,
      theme: result.theme,
      messages: result.messages,
      generatedAt: new Date(),
    };
  }

  // Fallback
  return PREBUILT_DEMOS['reading-between-lines'];
}

