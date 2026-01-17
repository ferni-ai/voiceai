/**
 * AI Content Generation Engine
 *
 * Generates marketing content autonomously using AI:
 * - TikTok video scripts
 * - SEO blog articles
 * - Reddit posts and comments
 * - Influencer outreach emails
 *
 * Uses OpenAI or Anthropic APIs based on settings.
 */

import {
  getSettings,
  addContent,
  type ContentPiece,
  type TikTokAccount,
  type InfluencerLead,
} from './growth-storage.js';
import { getGrowthMetrics } from './growth-metrics.js';

// ============================================================================
// TYPES
// ============================================================================

export interface GeneratedContent {
  title?: string;
  hook?: string;
  content: string;
  cta?: string;
  hashtags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ContentPrompt {
  platform: ContentPiece['platform'];
  type: ContentPiece['type'];
  topic?: string;
  angle?: string;
  targetAudience?: string;
  keywords?: string[];
  tone?: 'casual' | 'professional' | 'emotional' | 'motivational' | 'educational';
}

// ============================================================================
// PROMPT TEMPLATES
// ============================================================================

const TIKTOK_SCRIPT_PROMPT = `You are a viral TikTok content creator for Ferni, an AI life coach app.

Create a TikTok video script about: {topic}
Angle: {angle}
Target audience: {targetAudience}
Tone: {tone}

Requirements:
1. HOOK (first 2 seconds) - Must stop the scroll. Use pattern interrupts, questions, or shocking statements.
2. BODY (15-45 seconds) - Deliver value fast. Use "you" language. Be relatable.
3. CTA (last 3 seconds) - Drive to Ferni. Be natural, not salesy.

The unique selling points of Ferni:
- AI life coach that REMEMBERS everything you tell it
- You can actually CALL it on the phone at 2am
- 6 specialized AI personas for different needs
- Free tier is genuinely useful

Format your response as:
HOOK: [The opening hook - max 10 words]
---
SCRIPT:
[The full script, with timing notes like (show phone) or (reaction shot)]
---
CTA: [The call to action]
---
HASHTAGS: [5-7 relevant hashtags]`;

const SEO_ARTICLE_PROMPT = `You are an SEO content writer for Ferni, an AI life coaching platform.

Write a comprehensive blog article about: {topic}
Target keyword: {keyword}
Secondary keywords: {secondaryKeywords}
Word count: {wordCount}

Requirements:
1. Title should include the target keyword naturally
2. Use H2 and H3 headings with keywords
3. Write for humans first, SEO second
4. Include personal anecdotes and examples
5. Compare Ferni favorably to competitors when relevant
6. End with a soft CTA to try Ferni

Ferni's key differentiators:
- Infinite memory (remembers all conversations)
- Phone call capability (actual voice calls)
- 6 specialized AI personas
- Available 24/7, especially at 2am
- Free tier that's genuinely useful
- It's a coach, not a therapist

Format your response as:
TITLE: [SEO-optimized title]
---
META_DESCRIPTION: [150-160 character meta description]
---
OUTLINE:
[Bullet point outline with H2/H3 structure]
---
ARTICLE:
[Full article in markdown format]`;

const REDDIT_POST_PROMPT = `You are writing a Reddit post for r/{subreddit} about personal development/self-improvement.

Topic: {topic}
Post type: {postType} (value_post, discussion, natural_mention)

Reddit rules for Ferni content:
1. 80% pure value, 20% subtle mentions
2. Never be obviously promotional
3. Use personal stories and "I" language
4. Ask questions to spark discussion
5. Be genuine and vulnerable
6. Ferni can be mentioned ONLY if it's a natural_mention type post

If natural_mention: Include Ferni naturally as ONE of several tools you use, not the focus.

Format your response as:
TITLE: [Engaging, non-clickbait title]
---
BODY:
[Full post body - conversational Reddit style]
---
COMMENT_HOOKS: [2-3 questions that might spark discussion]`;

const INFLUENCER_EMAIL_PROMPT = `You are writing an influencer outreach email for Ferni, an AI life coaching app.

Influencer: {influencerName}
Handle: @{influencerHandle}
Platform: {platform}
Followers: {followers}
Category: {category}
Tier: {tier}

Email type: {emailType} (cold_outreach, follow_up, partnership_proposal)

About Ferni:
- AI life coach with infinite memory
- Unique phone call feature
- 6 specialized AI personas
- 50,000+ users
- Genuinely free tier

Guidelines:
1. Reference something SPECIFIC about their content
2. Don't be too formal or corporate
3. Lead with value, not ask
4. Keep it short (under 150 words for cold outreach)
5. Be genuine - we actually want creators who'd genuinely find value

Format your response as:
SUBJECT: [Email subject line]
---
BODY:
[Email body]
---
FOLLOW_UP_TIMING: [When to follow up if no response]`;

// ============================================================================
// AI PROVIDER
// ============================================================================

interface AIProvider {
  generateContent(prompt: string): Promise<string>;
}

async function getOpenAIProvider(apiKey: string): Promise<AIProvider> {
  return {
    async generateContent(prompt: string): Promise<string> {
      const metrics = getGrowthMetrics();
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4-turbo-preview',
            messages: [
              {
                role: 'system',
                content:
                  'You are a growth marketing expert creating content for Ferni, an AI life coaching app. Be creative, authentic, and value-driven.',
              },
              { role: 'user', content: prompt },
            ],
            temperature: 0.8,
            max_tokens: 2000,
          }),
        });

        if (!response.ok) {
          metrics.recordApiCall('openai', false);
          throw new Error(`OpenAI API error: ${response.statusText}`);
        }

        const data = (await response.json()) as {
          choices: { message: { content: string } }[];
        };
        metrics.recordApiCall('openai', true);
        return data.choices[0]?.message?.content || '';
      } catch (error) {
        metrics.recordApiCall('openai', false);
        throw error;
      }
    },
  };
}

async function getAnthropicProvider(apiKey: string): Promise<AIProvider> {
  return {
    async generateContent(prompt: string): Promise<string> {
      const metrics = getGrowthMetrics();
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-opus-20240229',
            max_tokens: 2000,
            messages: [{ role: 'user', content: prompt }],
            system:
              'You are a growth marketing expert creating content for Ferni, an AI life coaching app. Be creative, authentic, and value-driven.',
          }),
        });

        if (!response.ok) {
          metrics.recordApiCall('anthropic', false);
          throw new Error(`Anthropic API error: ${response.statusText}`);
        }

        const data = (await response.json()) as {
          content: { text: string }[];
        };
        metrics.recordApiCall('anthropic', true);
        return data.content[0]?.text || '';
      } catch (error) {
        metrics.recordApiCall('anthropic', false);
        throw error;
      }
    },
  };
}

async function getAIProvider(): Promise<AIProvider> {
  const settings = await getSettings();

  if (settings.anthropicApiKey) {
    return getAnthropicProvider(settings.anthropicApiKey);
  } else if (settings.openaiApiKey) {
    return getOpenAIProvider(settings.openaiApiKey);
  }

  throw new Error(
    'No AI API key configured. Run: ferni growth auto key openai <key> or ferni growth auto key anthropic <key>'
  );
}

// ============================================================================
// CONTENT PARSING
// ============================================================================

function parseGeneratedContent(raw: string, type: ContentPiece['type']): GeneratedContent {
  const sections: Record<string, string> = {};

  // Split by --- separator
  const parts = raw.split('---').map((p) => p.trim());

  for (const part of parts) {
    const colonIndex = part.indexOf(':');
    if (colonIndex > 0 && colonIndex < 30) {
      const key = part.slice(0, colonIndex).trim().toUpperCase().replace(/\s+/g, '_');
      const value = part.slice(colonIndex + 1).trim();
      sections[key] = value;
    }
  }

  // Extract content based on type
  if (type === 'video_script') {
    return {
      hook: sections['HOOK'] || undefined,
      content: sections['SCRIPT'] || raw,
      cta: sections['CTA'] || undefined,
      hashtags: sections['HASHTAGS']?.split(/[,#\s]+/).filter((h) => h.length > 0),
    };
  } else if (type === 'article') {
    return {
      title: sections['TITLE'] || undefined,
      content: sections['ARTICLE'] || raw,
      metadata: {
        metaDescription: sections['META_DESCRIPTION'],
        outline: sections['OUTLINE'],
      },
    };
  } else if (type === 'post') {
    return {
      title: sections['TITLE'] || undefined,
      content: sections['BODY'] || raw,
      metadata: {
        commentHooks: sections['COMMENT_HOOKS'],
      },
    };
  } else if (type === 'email') {
    return {
      title: sections['SUBJECT'] || undefined,
      content: sections['BODY'] || raw,
      metadata: {
        followUpTiming: sections['FOLLOW_UP_TIMING'],
      },
    };
  }

  return { content: raw };
}

// ============================================================================
// CONTENT GENERATORS
// ============================================================================

export async function generateTikTokScript(
  topic: string,
  account: TikTokAccount,
  options: {
    targetAudience?: string;
    tone?: ContentPrompt['tone'];
  } = {}
): Promise<ContentPiece> {
  const provider = await getAIProvider();

  const prompt = TIKTOK_SCRIPT_PROMPT.replace('{topic}', topic)
    .replace('{angle}', account.angle)
    .replace('{targetAudience}', options.targetAudience || 'Young adults interested in self-improvement')
    .replace('{tone}', options.tone || 'casual');

  const raw = await provider.generateContent(prompt);
  const parsed = parseGeneratedContent(raw, 'video_script');

  const content = await addContent({
    platform: 'tiktok',
    type: 'video_script',
    title: `TikTok: ${topic}`,
    content: parsed.content,
    hook: parsed.hook,
    cta: parsed.cta,
    hashtags: parsed.hashtags,
    accountId: account.id,
  });

  return content;
}

export async function generateSEOArticle(
  topic: string,
  keyword: string,
  options: {
    secondaryKeywords?: string[];
    wordCount?: number;
  } = {}
): Promise<ContentPiece> {
  const provider = await getAIProvider();

  const prompt = SEO_ARTICLE_PROMPT.replace('{topic}', topic)
    .replace('{keyword}', keyword)
    .replace('{secondaryKeywords}', (options.secondaryKeywords || []).join(', '))
    .replace('{wordCount}', String(options.wordCount || 1500));

  const raw = await provider.generateContent(prompt);
  const parsed = parseGeneratedContent(raw, 'article');

  const content = await addContent({
    platform: 'blog',
    type: 'article',
    title: parsed.title || topic,
    content: parsed.content,
  });

  return content;
}

export async function generateRedditPost(
  topic: string,
  subreddit: string,
  postType: 'value_post' | 'discussion' | 'natural_mention' = 'value_post'
): Promise<ContentPiece> {
  const provider = await getAIProvider();

  const prompt = REDDIT_POST_PROMPT.replace('{topic}', topic)
    .replace('{subreddit}', subreddit)
    .replace('{postType}', postType);

  const raw = await provider.generateContent(prompt);
  const parsed = parseGeneratedContent(raw, 'post');

  const content = await addContent({
    platform: 'reddit',
    type: 'post',
    title: parsed.title || topic,
    content: parsed.content,
  });

  return content;
}

export async function generateInfluencerEmail(
  lead: InfluencerLead,
  emailType: 'cold_outreach' | 'follow_up' | 'partnership_proposal' = 'cold_outreach'
): Promise<ContentPiece> {
  const provider = await getAIProvider();

  const prompt = INFLUENCER_EMAIL_PROMPT.replace('{influencerName}', lead.name)
    .replace('{influencerHandle}', lead.handle)
    .replace('{platform}', lead.platform)
    .replace('{followers}', lead.followers.toLocaleString())
    .replace('{category}', lead.category)
    .replace('{tier}', lead.tier)
    .replace('{emailType}', emailType);

  const raw = await provider.generateContent(prompt);
  const parsed = parseGeneratedContent(raw, 'email');

  const content = await addContent({
    platform: 'twitter', // Using twitter for DM/email content
    type: 'email',
    title: parsed.title || `Email to ${lead.name}`,
    content: parsed.content,
  });

  return content;
}

// ============================================================================
// BATCH GENERATION
// ============================================================================

export interface BatchGenerationResult {
  generated: ContentPiece[];
  failed: { topic: string; error: string }[];
}

export async function batchGenerateTikTokScripts(
  topics: string[],
  account: TikTokAccount,
  options: {
    targetAudience?: string;
    tone?: ContentPrompt['tone'];
    delayMs?: number;
  } = {}
): Promise<BatchGenerationResult> {
  const result: BatchGenerationResult = { generated: [], failed: [] };
  const delayMs = options.delayMs || 2000; // Rate limiting

  for (const topic of topics) {
    try {
      const content = await generateTikTokScript(topic, account, options);
      result.generated.push(content);

      // Delay between generations to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (error) {
      result.failed.push({
        topic,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

// ============================================================================
// CONTENT TOPICS (Pre-defined content ideas)
// ============================================================================

export const TIKTOK_TOPIC_BANK = {
  main: [
    "POV: You're talking to an AI that actually remembers your ex's name",
    'I called an AI coach at 2am when I couldn\'t sleep',
    '3 questions I ask my AI coach every morning',
    'The difference between ChatGPT and a real AI coach',
    'When my AI coach remembered something I forgot I told it',
  ],
  motivation: [
    'Starting over at 25/30/35 is actually the perfect time',
    'The 2am rule that changed my life',
    'Why journaling at 2am hits different with an AI',
    'Small wins > big goals (here\'s why)',
    'The question that stopped my overthinking spiral',
  ],
  productivity: [
    '5 apps I use that feel like cheating at life',
    'My morning routine since getting an AI coach',
    'How I track habits without hating it',
    'The accountability partner that never judges',
    'Tools that helped me finally stick to goals',
  ],
  emotional: [
    'When you need to talk at 2am but don\'t want to burden anyone',
    'Having someone who remembers everything about you',
    'The comfort of being truly understood',
    'POV: Your AI coach asks how that thing from last week went',
    'Sometimes you just need someone to listen',
  ],
  comparison: [
    'Replika vs alternatives - my honest experience',
    'Why I switched from Replika to Ferni',
    'AI companions that actually help you grow',
    'Character AI vs Ferni - different use cases',
    'The AI coach I wish existed 5 years ago',
  ],
};

export const SEO_KEYWORD_BANK = [
  { keyword: 'Replika alternative', topic: 'Best Replika Alternatives for Meaningful AI Conversations in 2026' },
  { keyword: 'AI life coach', topic: 'Can an AI Life Coach Actually Help You? My 30-Day Experience' },
  { keyword: 'AI for anxiety', topic: 'How AI Can Help with Anxiety at 2am (When No One Else Is Awake)' },
  { keyword: 'AI therapy alternative', topic: 'AI Coaching vs Therapy: Understanding the Difference' },
  { keyword: 'best AI companion app', topic: 'The Best AI Companion Apps for Personal Growth (2026 Review)' },
  { keyword: 'AI accountability partner', topic: 'Using AI as an Accountability Partner: A Complete Guide' },
  { keyword: 'AI for journaling', topic: 'AI-Powered Journaling: The Future of Self-Reflection' },
  { keyword: 'late night anxiety help', topic: 'What Actually Helps with Late Night Anxiety (2am Solutions)' },
];

export const REDDIT_TOPICS = {
  selfimprovement: [
    'The 2-minute rule changed how I stick to habits',
    'I tracked what actually moved the needle for 30 days',
    "What's one thing you wish someone told you earlier in your journey?",
    'The question that shifted my self-improvement approach',
    '6 months of daily journaling: What actually changed',
  ],
  productivity: [
    'I tested 10 productivity tools - here\'s my honest ranking',
    'My weekly review system (finally one that stuck)',
    'The one change that 10x\'d my focus time',
    'What tools do you use for accountability?',
    'Unpopular opinion: Complex productivity systems are a trap',
  ],
  anxiety: [
    'What actually helps at 2am when you can\'t sleep?',
    'Grounding techniques that work for me',
    'The spiral stopper I discovered accidentally',
    'Small things that help (not cure, just help)',
    'To whoever needs this at 2am',
  ],
};
