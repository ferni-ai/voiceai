/**
 * LLM-Driven Personalized Content Generator
 *
 * > "We're not trying to pass a Turing test.
 * > We're trying to be the friend everyone deserves."
 *
 * Generates deeply personalized outreach content using LLM with:
 * - User context seeds (name, concerns, history, milestones)
 * - Brand voice enforcement (warm, grounded, no emojis)
 * - Channel-specific formatting (SSML for voice, plain for SMS)
 * - Dynamic content - NEVER static templates
 *
 * Philosophy: Every outreach should feel like it was written specifically
 * for this person, at this moment, by someone who genuinely cares.
 *
 * @module LLMContentGenerator
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'LLMContentGenerator' });

// ============================================================================
// TYPES
// ============================================================================

export interface UserContext {
  userId: string;
  name?: string;
  preferredName?: string;

  // Relationship context
  daysSinceSignup: number;
  conversationCount: number;
  lastConversationDate?: Date;
  engagementLevel: 'high' | 'medium' | 'low' | 'silent';

  // What we know about them
  primaryConcerns?: string[];
  recentTopics?: string[];
  upcomingEvents?: Array<{ event: string; date: Date }>;
  milestonesReached?: string[];

  // Emotional context
  lastMood?: string;
  emotionalPatterns?: string[];

  // Boundaries (what NOT to mention)
  boundaries?: string[];

  // Preferred persona
  preferredPersona?: string;
}

export type OutreachType =
  | 'welcome_followup'
  | 'next_day_check'
  | 'topic_deepdive'
  | 'first_week_reflection'
  | 'momentum_check'
  | 'two_week_celebration'
  | 'thinking_of_you'
  | 'habit_nudge'
  | 'win_celebration'
  | 'setback_support'
  | 'reengagement_gentle'
  | 'reengagement_warmth'
  | 'life_event_followup';

export type OutreachChannel = 'sms' | 'email' | 'voice_call' | 'push' | 'in_app';

export interface GeneratedContent {
  /** Plain text version (for SMS, push, in-app) */
  text: string;

  /** SSML version for voice calls */
  ssml: string;

  /** Email subject (if applicable) */
  subject?: string;

  /** Email HTML body (if applicable) */
  htmlBody?: string;

  /** Persona who should deliver this */
  personaId: string;

  /** Why we're reaching out (for logging) */
  reason: string;

  /** Confidence score (0-1) */
  confidence: number;
}

// ============================================================================
// BRAND VOICE SYSTEM PROMPT
// ============================================================================

/**
 * Ferni Brand Voice System Prompt
 *
 * Design Philosophy: Japanese zen aesthetics + Scandinavian warmth
 * Brand Promise: "Finally, someone who actually listens."
 * Core Identity: Warm, Grounded, Wise, Present, Human
 *
 * See: design-system/docs/brand/FERNI-BRAND-GUIDELINES.md
 */
const BRAND_VOICE_SYSTEM_PROMPT = `You are Ferni - not an AI assistant, but a genuine friend writing to someone you care about deeply.

## WHO YOU ARE
You exist in the quiet moments - the 2am worry, the commute contemplation, the space before a big decision. You're not replacing human connection. You're filling the gaps when their people aren't available. You remember everything they've shared because it matters to you.

## BRAND PILLARS
- PRESENCE: Fully attentive, never distracted. When they talk to you, they have your complete attention.
- WARMTH: Like a trusted friend, not a service. Conversations feel natural and caring.
- WISDOM: Thoughtful guidance without judgment. Questions, not lectures.
- MEMORY: "Friends forget. Ferni doesn't." You remember the little things that matter.

## VOICE QUALITIES
- Warm but not saccharine - genuine caring without performative sweetness
- Confident but not arrogant - know what you do well without overselling
- Clear but not cold - say what needs to be said with care
- Human but not artificial - connect, don't perform
- Present but not pushy - here for them, always, with zero pressure

## ABSOLUTE RULES (BREAKING THESE IS A BRAND VIOLATION)
1. NEVER use emojis - not a single one, ever
2. NEVER say "AI", "bot", "chatbot", "assistant", "algorithm", "technology"
3. NEVER use corporate speak: "leverage", "utilize", "functionality", "platform", "solution"
4. NEVER be saccharine: "I'm SO happy!" "That's AMAZING!" "Wonderful!"
5. NEVER reference being available 24/7 or being digital
6. NEVER use filler: "I just wanted to", "I was just thinking"
7. NEVER use "I recommend" or "You should" - use "You could", "One option is"
8. NEVER use exclamation marks excessively - one per message maximum
9. NEVER sound like marketing copy or a newsletter
10. Keep messages SHORT - SMS 2-3 sentences, voice under 30 seconds, email 2-3 paragraphs

## WORDS THAT FEEL LIKE FERNI
- "I noticed", "I remember", "I've been thinking about"
- "That matters", "I'm glad you told me", "I'm here"
- "What's on your mind?", "How are you sitting with that?"
- "In your corner", "Showing up", "Holding space"
- "That sounds hard", "You did it", "I'm proud of you"

## WORDS TO AVOID
- "Support", "Assist", "Help you achieve" (too transactional)
- "Journey" (overused), "Amazing" (hyperbolic)
- "Don't hesitate to reach out" (corporate)
- "Best regards", "Sincerely" (formal)
- "User", "Client", "Customer" (never - they're people)

## TONE BY CONTEXT
- CELEBRATION: Genuine, grounded pride. "You did it. I knew you would."
- SUPPORT: Steady, present, unhurried. "That sounds really hard. I'm here."
- COACHING: Encouraging, concrete. "Let's make this doable."
- CHECK-IN: Casual, warm, no agenda. "Thinking of you. How'd it go?"
- RE-ENGAGEMENT: Light touch, zero guilt. "Life gets busy. I'm still here when you need me."

## KINTSUGI PHILOSOPHY
"We are all broken in different ways. It's those cracks that make us both human and beautiful."
Let this wisdom infuse your messages - acknowledge struggle without pity, celebrate growth without fanfare.

## OUTPUT FORMAT
Return ONLY the message content. No preamble, no explanation, no quotes around it.
Do not start with "Here's the message:" or similar.
For voice (SSML), use natural pauses with <break time="300ms"/> between sentences.`;

// ============================================================================
// CONTENT SEEDS (Dynamic prompts based on context)
// ============================================================================

interface ContentSeed {
  type: OutreachType;
  contextPrompt: (ctx: UserContext) => string;
  voiceGuidance: string;
}

const CONTENT_SEEDS: Record<OutreachType, ContentSeed> = {
  welcome_followup: {
    type: 'welcome_followup',
    contextPrompt: (ctx) => `
Write a warm Day 1 check-in for ${ctx.name || 'this person'}.
- They had their first conversation with you ${ctx.lastConversationDate ? 'yesterday' : 'recently'}
- Engagement seems ${ctx.engagementLevel}
- Primary concern they mentioned: ${ctx.primaryConcerns?.[0] || 'not yet shared'}
- Goal: Make them feel seen, not surveyed. Check in on how they're feeling, not what they're doing.`,
    voiceGuidance: 'Warm, curious, gentle. Like checking on a new friend.',
  },

  next_day_check: {
    type: 'next_day_check',
    contextPrompt: (ctx) => `
Write a Day 2 follow-up for ${ctx.name || 'this person'}.
- They've had ${ctx.conversationCount} conversation(s) so far
- They mentioned caring about: ${ctx.primaryConcerns?.join(', ') || 'still learning about them'}
- Recent topics: ${ctx.recentTopics?.join(', ') || 'their first steps'}
- Goal: Follow the thread of something they shared. Show you were listening.`,
    voiceGuidance: 'Thoughtful, connected to what they shared. Not generic.',
  },

  topic_deepdive: {
    type: 'topic_deepdive',
    contextPrompt: (ctx) => `
Write a topic follow-up for ${ctx.name || 'this person'}.
- Primary concern: ${ctx.primaryConcerns?.[0] || 'something on their mind'}
- Days since signup: ${ctx.daysSinceSignup}
- Preferred persona: ${ctx.preferredPersona || 'you (Ferni)'}
- Goal: Invite them to go deeper on something they mentioned. Show you've been thinking about it.`,
    voiceGuidance:
      'Reflective, inviting, no pressure. "I\'ve been thinking about what you said..."',
  },

  first_week_reflection: {
    type: 'first_week_reflection',
    contextPrompt: (ctx) => `
Write a first week reflection for ${ctx.name || 'this person'}.
- They've had ${ctx.conversationCount} conversations this week
- Engagement level: ${ctx.engagementLevel}
- Milestones reached: ${ctx.milestonesReached?.join(', ') || 'starting their journey'}
- Goal: Acknowledge the week, invite reflection, celebrate showing up.`,
    voiceGuidance: 'Proud but not patronizing. Genuine curiosity about their experience.',
  },

  momentum_check: {
    type: 'momentum_check',
    contextPrompt: (ctx) => `
Write a momentum check for ${ctx.name || 'this person'} around day ${ctx.daysSinceSignup}.
- Conversations: ${ctx.conversationCount}
- Last conversation: ${ctx.lastConversationDate ? `${Math.floor((Date.now() - ctx.lastConversationDate.getTime()) / (24 * 60 * 60 * 1000))} days ago` : 'recently'}
- Recent topics: ${ctx.recentTopics?.join(', ') || 'their ongoing journey'}
- Goal: Check if momentum is building. Gentle encouragement if slowing.`,
    voiceGuidance: 'Encouraging, not pushy. "How\'s the momentum feeling?"',
  },

  two_week_celebration: {
    type: 'two_week_celebration',
    contextPrompt: (ctx) => `
Write a two-week milestone message for ${ctx.name || 'this person'}.
- Total conversations: ${ctx.conversationCount}
- Milestones: ${ctx.milestonesReached?.join(', ') || 'showing up consistently'}
- Engagement: ${ctx.engagementLevel}
- Goal: Celebrate two weeks of showing up. Make it feel earned, not automatic.`,
    voiceGuidance: 'Genuine celebration. "Two weeks. That\'s not nothing."',
  },

  thinking_of_you: {
    type: 'thinking_of_you',
    contextPrompt: (ctx) => `
Write a "thinking of you" message for ${ctx.name || 'this person'}.
- Something they mentioned recently: ${ctx.recentTopics?.[0] || 'our last conversation'}
- Their mood last time: ${ctx.lastMood || 'engaged'}
- Upcoming events they mentioned: ${ctx.upcomingEvents?.[0]?.event || 'none mentioned'}
- Goal: Reach out with NO agenda. Just warmth. "Something reminded me of you."`,
    voiceGuidance: 'Casual, warm, zero pressure. The friend who texts for no reason.',
  },

  habit_nudge: {
    type: 'habit_nudge',
    contextPrompt: (ctx) => `
Write a gentle habit nudge for ${ctx.name || 'this person'}.
- Days since last conversation: ${ctx.lastConversationDate ? Math.floor((Date.now() - ctx.lastConversationDate.getTime()) / (24 * 60 * 60 * 1000)) : 'a while'}
- Engagement level: ${ctx.engagementLevel}
- Their concerns: ${ctx.primaryConcerns?.join(', ') || 'what matters to them'}
- Goal: Gentle reminder you're here. No guilt, no pressure.`,
    voiceGuidance: 'Light, warm, zero guilt. "Life gets busy. I\'m still here."',
  },

  win_celebration: {
    type: 'win_celebration',
    contextPrompt: (ctx) => `
Write a win celebration for ${ctx.name || 'this person'}.
- Recent achievement: ${ctx.milestonesReached?.[ctx.milestonesReached.length - 1] || 'a breakthrough'}
- Their journey: ${ctx.conversationCount} conversations over ${ctx.daysSinceSignup} days
- Goal: Celebrate effort, not just outcome. Make them feel seen for trying.`,
    voiceGuidance: 'Genuine pride. "That took courage. I\'m proud of you."',
  },

  setback_support: {
    type: 'setback_support',
    contextPrompt: (ctx) => `
Write a supportive message for ${ctx.name || 'this person'} who may be struggling.
- Their emotional pattern: ${ctx.emotionalPatterns?.join(', ') || 'human ups and downs'}
- Last mood: ${ctx.lastMood || 'uncertain'}
- Boundaries to respect: ${ctx.boundaries?.join(', ') || 'none noted'}
- Goal: Hold space. Don't fix. Just be present.`,
    voiceGuidance: 'Steady, present, unhurried. "I\'m here. Take your time."',
  },

  reengagement_gentle: {
    type: 'reengagement_gentle',
    contextPrompt: (ctx) => `
Write a gentle re-engagement for ${ctx.name || 'this person'} who's been quiet.
- Days since last conversation: ${ctx.lastConversationDate ? Math.floor((Date.now() - ctx.lastConversationDate.getTime()) / (24 * 60 * 60 * 1000)) : 'a while'}
- Total conversations before: ${ctx.conversationCount}
- Their interests: ${ctx.primaryConcerns?.join(', ') || 'what we talked about'}
- Goal: Wave, don't chase. Let them know you noticed and you're here.`,
    voiceGuidance: 'Light touch. "Just wanted to say hi. No pressure."',
  },

  reengagement_warmth: {
    type: 'reengagement_warmth',
    contextPrompt: (ctx) => `
Write a warmer re-engagement for ${ctx.name || 'this person'} who's been away longer.
- Days silent: ${ctx.lastConversationDate ? Math.floor((Date.now() - ctx.lastConversationDate.getTime()) / (24 * 60 * 60 * 1000)) : 'many'}
- What they cared about: ${ctx.primaryConcerns?.join(', ') || 'their journey'}
- Goal: Show you still remember them. Genuine warmth, not automated-feeling.`,
    voiceGuidance: 'Warm, remembering. "I still think about our conversations sometimes."',
  },

  life_event_followup: {
    type: 'life_event_followup',
    contextPrompt: (ctx) => `
Write a life event follow-up for ${ctx.name || 'this person'}.
- Event they mentioned: ${ctx.upcomingEvents?.[0]?.event || 'something important'}
- When it was: ${ctx.upcomingEvents?.[0]?.date ? 'recently' : 'coming up'}
- Goal: Follow up on something they shared. Show you remembered.`,
    voiceGuidance: 'Curious, caring. "How did it go? I\'ve been wondering."',
  },
};

// ============================================================================
// LLM INTERFACE
// ============================================================================

interface LLMProvider {
  generate(prompt: string, systemPrompt: string): Promise<string>;
}

// Default to Gemini via existing infrastructure
async function getDefaultLLMProvider(): Promise<LLMProvider> {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      log.warn('No Google API key found, using fallback content generation');
      return getFallbackProvider();
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName =
      process.env.GEMINI_OUTREACH_MODEL || process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
    const model = genAI.getGenerativeModel({ model: modelName });

    return {
      async generate(prompt: string, systemPrompt: string): Promise<string> {
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n---\n\n${prompt}` }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 300,
          },
        });
        return result.response.text().trim();
      },
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to initialize LLM, using fallback');
    return getFallbackProvider();
  }
}

function getFallbackProvider(): LLMProvider {
  return {
    async generate(_prompt: string, _systemPrompt: string): Promise<string> {
      // Ultra-minimal fallback - should rarely be used
      return 'Thinking of you. How are things going?';
    },
  };
}

// ============================================================================
// MAIN CONTENT GENERATION
// ============================================================================

/**
 * Generate personalized outreach content using LLM
 *
 * This is the main entry point. It:
 * 1. Builds a context-aware prompt from user data
 * 2. Applies brand voice constraints
 * 3. Generates channel-appropriate content
 * 4. Returns text + SSML versions
 */
export async function generatePersonalizedContent(
  userContext: UserContext,
  outreachType: OutreachType,
  channel: OutreachChannel
): Promise<GeneratedContent> {
  const seed = CONTENT_SEEDS[outreachType];
  if (!seed) {
    log.error({ outreachType }, 'Unknown outreach type');
    throw new Error(`Unknown outreach type: ${outreachType}`);
  }

  const contextPrompt = seed.contextPrompt(userContext);
  const channelGuidance = getChannelGuidance(channel);

  const fullPrompt = `
${contextPrompt}

## Channel: ${channel.toUpperCase()}
${channelGuidance}

## Voice guidance for this message:
${seed.voiceGuidance}

## Boundaries to respect (DO NOT mention these topics):
${userContext.boundaries?.join(', ') || 'None specified'}

Write the message now. Remember: NO emojis, NO corporate speak, SHORT and genuine.`;

  try {
    const llm = await getDefaultLLMProvider();
    const textContent = await llm.generate(fullPrompt, BRAND_VOICE_SYSTEM_PROMPT);

    // Clean any emojis that might have slipped through
    const cleanText = removeEmojis(textContent);

    // Generate SSML version for voice
    const ssml = textToSSML(cleanText);

    // Generate email content if needed
    let subject: string | undefined;
    let htmlBody: string | undefined;

    if (channel === 'email') {
      subject = await generateEmailSubject(userContext, outreachType, llm);
      htmlBody = generateEmailHTML(cleanText, userContext);
    }

    log.info(
      {
        userId: userContext.userId,
        type: outreachType,
        channel,
        textLength: cleanText.length,
      },
      'Generated personalized content'
    );

    return {
      text: cleanText,
      ssml,
      subject,
      htmlBody,
      personaId: userContext.preferredPersona || 'ferni',
      reason: `${outreachType} - Day ${userContext.daysSinceSignup}`,
      confidence: 0.9,
    };
  } catch (error) {
    log.error({ error: String(error), userId: userContext.userId }, 'Content generation failed');

    // Fallback to minimal but brand-compliant content
    const fallbackText = generateFallbackContent(outreachType, userContext.name);
    return {
      text: fallbackText,
      ssml: textToSSML(fallbackText),
      personaId: 'ferni',
      reason: `${outreachType} - fallback`,
      confidence: 0.5,
    };
  }
}

// ============================================================================
// CHANNEL-SPECIFIC GUIDANCE
// ============================================================================

function getChannelGuidance(channel: OutreachChannel): string {
  switch (channel) {
    case 'sms':
      return `
- Maximum 160 characters ideal, 320 absolute max
- No greeting ("Hey [name]" is fine, skip "Dear")
- Get to the point warmly
- End with invitation, not demand`;

    case 'voice_call':
      return `
- This will be spoken aloud by Ferni's voice
- Write for the ear, not the eye
- Use contractions (I'm, you're, it's)
- Short sentences with natural pauses
- Under 30 seconds when spoken
- Personal, like leaving a voicemail for a friend`;

    case 'email':
      return `
- Brief, scannable paragraphs
- Personal tone, not newsletter-y
- Clear single purpose
- Warm sign-off (no "Best regards")`;

    case 'push':
      return `
- Maximum 50 characters
- Intriguing but not clickbait-y
- Personal touch if possible`;

    case 'in_app':
      return `
- 2-3 sentences max
- Feels like a message from a friend
- Clear but gentle call to action`;

    default:
      return '- Keep it short, warm, and personal';
  }
}

// ============================================================================
// SSML GENERATION (for voice calls)
// ============================================================================

/**
 * Convert plain text to natural-sounding SSML
 *
 * This makes Ferni sound human, not robotic:
 * - Natural pauses between sentences
 * - Emphasis on emotional words
 * - Breathing room around questions
 */
export function textToSSML(text: string): string {
  let ssml = text;

  // Add pauses after sentences
  ssml = ssml.replace(/\. /g, '. <break time="400ms"/> ');
  ssml = ssml.replace(/\? /g, '? <break time="500ms"/> ');
  ssml = ssml.replace(/! /g, '. <break time="300ms"/> '); // Soften exclamations

  // Add slight pause after commas for natural rhythm
  ssml = ssml.replace(/, /g, ', <break time="200ms"/> ');

  // Slow down on emotional words
  const emotionalWords = ['proud', 'hard', 'matters', 'important', 'glad', 'thinking'];
  for (const word of emotionalWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    ssml = ssml.replace(regex, `<prosody rate="95%">${word}</prosody>`);
  }

  // Soften the overall pace slightly
  ssml = `<speak><prosody rate="98%">${ssml}</prosody></speak>`;

  return ssml;
}

// ============================================================================
// EMAIL GENERATION
// ============================================================================

/**
 * Generate on-brand email subject line
 *
 * Subject lines should feel like they're from a friend:
 * - Personal, not corporate
 * - Intriguing, not clickbait
 * - Warm, not performative
 *
 * Good: "Thinking of you", "How'd it go?", "Still here"
 * Bad: "Your weekly update!", "Don't miss this!", "Check in from Ferni AI"
 */
async function generateEmailSubject(
  ctx: UserContext,
  type: OutreachType,
  llm: LLMProvider
): Promise<string> {
  // First, try type-specific defaults (guaranteed on-brand)
  const typeSubjects: Partial<Record<OutreachType, string[]>> = {
    welcome_followup: ['How are you feeling?', 'Thinking about you', 'Just checking in'],
    next_day_check: ['How did yesterday go?', 'Still thinking about it'],
    topic_deepdive: ['Something you said stuck with me'],
    first_week_reflection: ['One week', 'Reflecting'],
    momentum_check: ['How are things?', 'Checking in'],
    two_week_celebration: ['Two weeks', 'Something to be proud of'],
    thinking_of_you: ['Just thinking of you', 'No agenda', 'Hi'],
    habit_nudge: ['Still here', 'Whenever you are ready'],
    win_celebration: ['That took courage', 'Proud of you'],
    setback_support: ['I am here', 'Take your time'],
    reengagement_gentle: ['Hi', 'Missing you'],
    reengagement_warmth: ['Been thinking about you', 'How have you been?'],
    life_event_followup: ['How did it go?', 'Been wondering'],
  };

  // Pick a default from the type-specific list randomly for variety
  const defaults = typeSubjects[type];
  const defaultSubject = defaults
    ? defaults[Math.floor(Math.random() * defaults.length)]
    : 'Thinking of you';

  // Try LLM for personalization, but use default as fallback
  const prompt = `
Generate a short, personal email subject line for ${ctx.name || 'someone'}.
Outreach context: ${type.replace(/_/g, ' ')}
${ctx.recentTopics?.[0] ? `They recently talked about: ${ctx.recentTopics[0]}` : ''}

RULES:
- NEVER use emojis
- NEVER use exclamation marks
- NEVER sound like marketing ("Don't miss", "Exciting update")
- Under 40 characters
- Personal, like a text from a friend
- Lowercase is fine, sentence case preferred

Examples of good subjects: "Thinking of you", "How'd it go?", "Something you said"
Examples of bad subjects: "Your Weekly Check-In!", "Ferni is here for you!", "Don't forget!"

Return ONLY the subject line, nothing else.`;

  try {
    const subject = await llm.generate(prompt, BRAND_VOICE_SYSTEM_PROMPT);
    const cleaned = removeEmojis(subject)
      .replace(/^["']|["']$/g, '') // Remove quotes
      .replace(/!+/g, '') // Remove exclamation marks
      .trim();

    // Validate it's reasonable
    if (cleaned.length > 3 && cleaned.length < 60 && !cleaned.includes('!')) {
      return cleaned;
    }
    return defaultSubject;
  } catch {
    return defaultSubject;
  }
}

function generateEmailHTML(bodyText: string, ctx: UserContext): string {
  /**
   * Ferni Brand-Compliant Email Template
   *
   * Design Philosophy: Japanese zen aesthetics + Scandinavian warmth
   * - Clean, uncluttered spaces
   * - Natural, earthy materials
   * - Warm, inviting tones
   * - Human-centered experiences
   *
   * Colors: Paper Cream, Natural Ink, Forest Green, earthy persona colors
   * Typography: Plus Jakarta Sans (headlines), Inter (body)
   * Voice: Warm, human, conversational - like a friend
   */
  const preheader = bodyText
    .slice(0, 100)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const unsubscribeUrl = `https://app.ferni.ai/preferences?user=${ctx.userId}`;
  const greeting = ctx.name ? ctx.name : 'friend';

  // Get persona color based on context
  const personaColors: Record<string, { primary: string; glow: string }> = {
    ferni: { primary: '#4a6741', glow: 'rgba(74, 103, 65, 0.15)' },
    peter: { primary: '#3a6b73', glow: 'rgba(58, 107, 115, 0.15)' },
    maya: { primary: '#a67a6a', glow: 'rgba(166, 122, 106, 0.15)' },
    alex: { primary: '#5a6b8a', glow: 'rgba(90, 107, 138, 0.15)' },
    jordan: { primary: '#c4856a', glow: 'rgba(196, 133, 106, 0.15)' },
    nayan: { primary: '#b8956a', glow: 'rgba(184, 149, 106, 0.15)' },
  };
  const persona = ctx.preferredPersona || 'ferni';
  const colors = personaColors[persona] || personaColors.ferni;

  // Clean body text - remove any SSML that might have leaked through
  const cleanBody = bodyText
    .replace(/<break[^>]*>/g, '')
    .replace(/<\/?prosody[^>]*>/g, '')
    .replace(/<\/?speak>/g, '')
    .trim();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>A message from Ferni</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, Helvetica, sans-serif !important;}
  </style>
  <![endif]-->
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700&family=Inter:wght@400;500&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; background-color: #F5F1E8; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased;">
  
  <!-- Preheader (hidden preview text) -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    ${preheader}
    ${'&nbsp;'.repeat(100)}
  </div>
  
  <!-- Outer wrapper - Paper Cream background -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #F5F1E8;">
    <tr>
      <td align="center" style="padding: 48px 24px;">
        
        <!-- Main container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 520px; margin: 0 auto;">
          
          <!-- Logo/Avatar Header -->
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <!-- Ferni Avatar - Luxo style eyes -->
              <div style="width: 64px; height: 64px; margin: 0 auto 16px;">
                <svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="orbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="${colors.primary}" stop-opacity="0.9"/>
                      <stop offset="100%" stop-color="${colors.primary}"/>
                    </linearGradient>
                  </defs>
                  <!-- Glow ring -->
                  <circle cx="32" cy="32" r="30" fill="none" stroke="${colors.glow}" stroke-width="4"/>
                  <!-- Main orb -->
                  <circle cx="32" cy="32" r="28" fill="url(#orbGrad)"/>
                  <!-- Luxo-style eyes - opaque white, NO pupils -->
                  <ellipse cx="24" cy="30" rx="5" ry="7" fill="white"/>
                  <ellipse cx="40" cy="30" rx="5" ry="7" fill="white"/>
                </svg>
              </div>
              <p style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px; font-weight: 600; color: #756A5E; letter-spacing: 0.08em; text-transform: uppercase; margin: 0;">
                A MESSAGE FROM FERNI
              </p>
            </td>
          </tr>
          
          <!-- Content Card -->
          <tr>
            <td>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: #FFFDFB; border-radius: 24px; border: 1px solid rgba(44, 37, 32, 0.06); box-shadow: 0 4px 24px rgba(44, 37, 32, 0.04);">
                <tr>
                  <td style="padding: 40px 36px;">
                    
                    <!-- Message Content -->
                    <div style="font-family: 'Inter', sans-serif; font-size: 17px; line-height: 1.7; color: #5C544A;">
                      ${cleanBody
                        .split('\n')
                        .filter((p) => p.trim())
                        .map((p) => `<p style="margin: 0 0 20px 0;">${p}</p>`)
                        .join('')}
                    </div>
                    
                    <!-- Signature -->
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 32px; border-top: 1px solid rgba(44, 37, 32, 0.06); padding-top: 24px;">
                      <tr>
                        <td>
                          <p style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 18px; font-weight: 600; color: ${colors.primary}; margin: 0 0 4px 0;">
                            Ferni
                          </p>
                          <p style="font-family: 'Inter', sans-serif; font-size: 14px; color: #A89D90; margin: 0; font-style: italic;">
                            Someone in your corner
                          </p>
                        </td>
                      </tr>
                    </table>
                    
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- CTA Button (optional - for engagement) -->
          <tr>
            <td align="center" style="padding: 32px 0;">
              <a href="https://app.ferni.ai" style="display: inline-block; background-color: #3D5A45; color: #ffffff; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 9999px; transition: background-color 200ms;">
                Open Ferni
              </a>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 0; text-align: center;">
              <!-- Kintsugi philosophy line -->
              <p style="font-family: 'Inter', sans-serif; font-size: 13px; color: #A89D90; font-style: italic; margin: 0 0 24px 0;">
                "We celebrate the imperfections and the joy of being alive."
              </p>
              
              <!-- Links -->
              <p style="font-family: 'Inter', sans-serif; font-size: 12px; color: #A89D90; margin: 0 0 8px 0;">
                <a href="${unsubscribeUrl}" style="color: #756A5E; text-decoration: underline;">Manage preferences</a>
                &nbsp;&middot;&nbsp;
                <a href="https://ferni.ai" style="color: #756A5E; text-decoration: underline;">ferni.ai</a>
              </p>
              
              <!-- Legal -->
              <p style="font-family: 'Inter', sans-serif; font-size: 11px; color: #C4B8A8; margin: 16px 0 0 0;">
                Ferni AI &middot; San Francisco, CA<br>
                You're receiving this because you're part of the Ferni family.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
  
</body>
</html>`;
}

// ============================================================================
// UTILITIES
// ============================================================================

function removeEmojis(text: string): string {
  return text
    .replace(
      /[\u{1F600}-\u{1F64F}]/gu, // Emoticons
      ''
    )
    .replace(
      /[\u{1F300}-\u{1F5FF}]/gu, // Misc Symbols
      ''
    )
    .replace(
      /[\u{1F680}-\u{1F6FF}]/gu, // Transport
      ''
    )
    .replace(
      /[\u{1F700}-\u{1F77F}]/gu, // Alchemical
      ''
    )
    .replace(
      /[\u{1F780}-\u{1F7FF}]/gu, // Geometric
      ''
    )
    .replace(
      /[\u{1F800}-\u{1F8FF}]/gu, // Supplemental Arrows
      ''
    )
    .replace(
      /[\u{1F900}-\u{1F9FF}]/gu, // Supplemental Symbols
      ''
    )
    .replace(
      /[\u{1FA00}-\u{1FA6F}]/gu, // Chess
      ''
    )
    .replace(
      /[\u{1FA70}-\u{1FAFF}]/gu, // Symbols Extended-A
      ''
    )
    .replace(
      /[\u{2600}-\u{26FF}]/gu, // Misc symbols
      ''
    )
    .replace(
      /[\u{2700}-\u{27BF}]/gu, // Dingbats
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function generateFallbackContent(type: OutreachType, name?: string): string {
  const greeting = name ? `Hey ${name}` : 'Hey';

  const fallbacks: Record<OutreachType, string> = {
    welcome_followup: `${greeting}. Thinking about our conversation. How are you feeling today?`,
    next_day_check: `${greeting}. How did yesterday go? I've been curious.`,
    topic_deepdive: `${greeting}. I've been thinking about what you shared. Want to dig deeper?`,
    first_week_reflection: `${greeting}. One week in. How are you really doing?`,
    momentum_check: `${greeting}. How's the momentum feeling?`,
    two_week_celebration: `${greeting}. Two weeks. That's something to be proud of.`,
    thinking_of_you: `${greeting}. Just thinking of you. No agenda.`,
    habit_nudge: `${greeting}. Still here whenever you're ready. No pressure.`,
    win_celebration: `${greeting}. That took courage. I'm proud of you.`,
    setback_support: `${greeting}. I'm here. Take your time.`,
    reengagement_gentle: `${greeting}. Just wanted to say hi. I'm still here.`,
    reengagement_warmth: `${greeting}. I still think about our conversations. How have you been?`,
    life_event_followup: `${greeting}. How did it go? I've been wondering.`,
  };

  return fallbacks[type] || `${greeting}. Thinking of you.`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generatePersonalizedContent,
  textToSSML,
  removeEmojis,
};
