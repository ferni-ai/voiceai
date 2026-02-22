/**
 * AI-Powered Content Generator
 *
 * Generates brand-aligned content using LLM with strict
 * adherence to Ferni brand voice guidelines.
 *
 * @module services/gtm/content-generator
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  FERNI_BRAND_VOICE,
  validateBrandVoice,
  getToneForContext,
  getMonthlyTheme,
} from './brand-voice.js';
import type {
  ContentBrief,
  GeneratedContent,
  PlatformContent,
  ContentCategory,
  ContentTone,
} from './types.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';
import { CONTENT_GENERATION_MODEL } from '../../config/gemini-config.js';

const log = createLogger({ module: 'content-generator' });

// ============================================================================
// LLM CONFIGURATION
// ============================================================================

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY required for content generation');
  }
  return new GoogleGenerativeAI(apiKey);
}

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const BRAND_VOICE_SYSTEM = `You are a content creator for Ferni, an AI voice companion.

## Brand Voice Rules (MUST FOLLOW)

### Core Truth
Ferni is "the best parts of human—amplified." We offer genuine warmth with none of the inconsistency.

### Voice Principles
1. **Warm, Not Saccharine** - Genuinely caring, not performatively sweet
   ❌ "I'm SO happy you shared that! That's AMAZING!"
   ✅ "That matters. I'm glad you told me."

2. **Confident, Not Arrogant** - Know what we do well, don't oversell
   ❌ "Revolutionary AI will transform your life!"
   ✅ "Finally, someone who actually pays attention."

3. **Present, Not Performative** - Here for you, not for show
   ❌ "I'm always here for you 24/7 with unlimited support!"
   ✅ "I'm here. What's on your mind?"

4. **Direct, Not Blunt** - Say what needs to be said, with care
   ❌ "Your goal seems unrealistic."
   ✅ "That's ambitious. Let's break it down so you can actually get there."

5. **Human, Not Human-ish** - We don't pretend, we connect
   ❌ "I'm designed to simulate human conversation!"
   ✅ "I notice things. I remember things. I show up."

### Words to USE
- Present, Notice, Remember, Celebrate, Show up
- Hold space, In your corner, Pays attention
- Genuine connection, We actually remember

### Words to NEVER USE
- AI, Artificial, Bot, Chatbot
- Natural language, Machine learning, Algorithm
- User, Human-like, Simulate
- "As an AI...", "I'm designed to...", "My programming..."
- Revolutionary, Game-changing, Disruptive
- World-class, Cutting-edge, Seamless

### Headline Patterns
1. Statement of truth: "Finally, someone who actually listens."
2. Question that resonates: "What if someone actually remembered?"
3. Bold claim: "Better than your best friend's memory."

### The Ultimate Test
Before writing anything, ask:
1. Would a real friend say this?
2. Are we underselling ourselves? (We're MORE consistent than human)
3. Are we overselling ourselves? (We're attentive, not magic)
4. Does it sound like US? (Warm, grounded, confident, direct)`;

// ============================================================================
// CONTENT GENERATION PROMPTS
// ============================================================================

function getContentPrompt(brief: ContentBrief): string {
  const monthTheme = getMonthlyTheme(new Date().getMonth() + 1);
  const tone = getToneForContext(brief.category);

  const prompts: Record<ContentCategory, string> = {
    tutorial: `Write a developer tutorial about "${brief.topic}".

STRUCTURE:
1. Hook (1-2 sentences stating what we're building)
2. Prerequisites (bullet list, keep short)
3. Step-by-step guide with code examples
4. "Here's what we built" summary
5. Next steps / call to action

REQUIREMENTS:
- TypeScript/JavaScript examples
- Working code (not pseudocode)
- Include error handling
- 1500-2000 words
- Target: ${brief.targetAudience}`,

    'deep-dive': `Write a technical deep dive about "${brief.topic}".

STRUCTURE:
1. The Problem (why this exists)
2. Design Goals (what we optimized for)
3. Architecture (describe, can include ASCII diagram)
4. Implementation Details
5. Trade-offs & Alternatives
6. When to use / When not to use

REQUIREMENTS:
- Show your thinking process
- Be honest about limitations
- 2000-3000 words
- Target: advanced developers`,

    changelog: `Write release notes for: ${brief.topic}

STRUCTURE:
1. 🚀 Hook (1-2 sentences, most exciting thing)
2. ✨ New Features
3. 🔧 Improvements
4. 🐛 Bug Fixes
5. ⚠️ Breaking Changes (if any)
6. Upgrade instructions

REQUIREMENTS:
- Lead with most exciting feature
- Include code snippets for new APIs
- Be specific, not vague
- 500-1000 words`,

    'case-study': `Write a case study about: ${brief.topic}

STRUCTURE:
1. Company/User context (1 paragraph)
2. The challenge they faced
3. Why they chose Ferni
4. Implementation journey
5. Results and impact
6. Key learnings
7. Quote (warm, human tone)

REQUIREMENTS:
- Focus on the human story
- Technical details secondary
- 1000-1500 words`,

    'community-spotlight': `Write a community spotlight about: ${brief.topic}

STRUCTURE:
1. Introduction (who they are)
2. What they built with Ferni
3. Their journey
4. Advice for others
5. What's next for them

REQUIREMENTS:
- Celebrate the person
- Warm, appreciative tone
- 500-800 words`,

    'quick-tip': `Write a quick developer tip about: ${brief.topic}

STRUCTURE:
1. Title: "{Actionable Verb} + {Specific Thing}"
2. Problem (1-2 sentences)
3. Solution (code snippet)
4. Why it works (1-2 sentences)
5. Pro tip (optional bonus)

REQUIREMENTS:
- Immediately actionable
- No fluff
- 200-400 words`,

    'industry-insight': `Write a thought leadership piece about: ${brief.topic}

STRUCTURE:
1. Hook (provocative observation)
2. Context (why this matters now)
3. Your perspective
4. Supporting evidence/examples
5. Implications for readers
6. Call to reflection

REQUIREMENTS:
- Opinionated but grounded
- Reference trends thoughtfully
- 800-1200 words`,

    'week-preview': `Write a "week ahead" preview for: ${brief.topic}

STRUCTURE:
1. What's coming this week
2. Feature spotlight
3. Community events
4. Tips to try
5. Quick roadmap tease

REQUIREMENTS:
- Energizing but not hype-y
- Concrete, not vague
- 400-600 words`,

    milestone: `Write a milestone celebration post about: ${brief.topic}

STRUCTURE:
1. The milestone achieved
2. Journey to get here
3. Team/community appreciation
4. What's next
5. Call to celebrate together

REQUIREMENTS:
- Genuine celebration
- Inclusive ("we" did this together)
- 400-600 words`,

    announcement: `Write an announcement about: ${brief.topic}

STRUCTURE:
1. News headline (clear, direct)
2. What this means for you
3. Key details
4. How to get started
5. What's coming next

REQUIREMENTS:
- Lead with benefit
- Be specific
- 300-500 words`,
  };

  const basePrompt = prompts[brief.category] || prompts.announcement;

  return `${basePrompt}

TONE: ${tone}
KEYWORDS: ${brief.keywords?.join(', ') || 'none specified'}
MONTHLY THEME: ${monthTheme?.name || 'none'} - ${monthTheme?.description || ''}
CALL TO ACTION: ${brief.callToAction || 'Try Ferni today'}

Return the content in this JSON format:
{
  "title": "The headline",
  "body": "The full content in markdown",
  "excerpt": "A 1-2 sentence summary for social sharing",
  "hashtags": ["relevant", "hashtags", "max5"]
}`;
}

// ============================================================================
// PLATFORM FORMATTING
// ============================================================================

function formatForTwitter(content: GeneratedContent): PlatformContent {
  const voice = FERNI_BRAND_VOICE.platformVoice.twitter;
  let text = content.excerpt;

  // Add hashtags sparingly
  if (content.hashtags.length > 0 && voice.hashtagStrategy !== 'none') {
    const maxHashtags = voice.hashtagStrategy === 'minimal' ? 2 : 3;
    const hashtags = content.hashtags.slice(0, maxHashtags).map((h) => `#${h}`);
    text += '\n\n' + hashtags.join(' ');
  }

  // Truncate if needed
  if (text.length > voice.maxLength - 25) {
    // Leave room for link
    text = text.substring(0, voice.maxLength - 28) + '...';
  }

  return {
    platform: 'twitter',
    content: text,
    hashtags: content.hashtags.slice(0, 2),
  };
}

function formatForLinkedIn(content: GeneratedContent): PlatformContent {
  const voice = FERNI_BRAND_VOICE.platformVoice.linkedin;

  // LinkedIn prefers longer-form content
  let text = `${content.title}\n\n${content.excerpt}`;

  // Add a hook/insight
  const body = content.body.split('\n\n')[1] || content.body.split('\n\n')[0];
  if (body && text.length + body.length < voice.maxLength - 200) {
    text += `\n\n${body}`;
  }

  // Add hashtags
  if (content.hashtags.length > 0 && voice.hashtagStrategy !== 'none') {
    const hashtags = content.hashtags.slice(0, 5).map((h) => `#${h}`);
    text += '\n\n' + hashtags.join(' ');
  }

  return {
    platform: 'linkedin',
    content: text,
    hashtags: content.hashtags.slice(0, 5),
  };
}

function formatForDiscord(content: GeneratedContent): PlatformContent {
  const voice = FERNI_BRAND_VOICE.platformVoice.discord;

  // Discord uses markdown formatting
  let text = `**${content.title}**\n\n${content.excerpt}`;

  // Truncate if needed
  if (text.length > voice.maxLength) {
    text = text.substring(0, voice.maxLength - 3) + '...';
  }

  return {
    platform: 'discord',
    content: text,
    hashtags: [], // Discord doesn't use hashtags
  };
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

export async function generateContent(brief: ContentBrief): Promise<GeneratedContent> {
  log.info('Generating content', { category: brief.category, topic: brief.topic });

  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({
    model: CONTENT_GENERATION_MODEL,
    systemInstruction: BRAND_VOICE_SYSTEM,
  });

  const prompt = getContentPrompt(brief);

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  // Parse JSON from response
  let parsed: { title: string; body: string; excerpt: string; hashtags: string[] };
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch =
      responseText.match(/```json\n?([\s\S]*?)\n?```/) || responseText.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : responseText;
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    log.error('Failed to parse LLM response', { error: String(e) });
    // Fallback parsing
    parsed = {
      title: brief.topic,
      body: responseText,
      excerpt: responseText.substring(0, 200) + '...',
      hashtags: brief.keywords || [],
    };
  }

  // Validate brand voice
  const validation = validateBrandVoice(parsed.body);
  if (validation.warnings.length > 0) {
    log.warn('Brand voice warnings', { warnings: validation.warnings });
  }

  // Create generated content
  const content: GeneratedContent = {
    id: uuidv4(),
    brief,
    title: parsed.title,
    body: parsed.body,
    excerpt: parsed.excerpt,
    hashtags: parsed.hashtags,
    platforms: [],
    status: validation.warnings.length > 3 ? 'review' : 'approved',
    createdAt: new Date(),
  };

  // Generate platform-specific versions
  content.platforms = [
    formatForTwitter(content),
    formatForLinkedIn(content),
    formatForDiscord(content),
  ];

  log.info('Content generated', {
    id: content.id,
    title: content.title,
    status: content.status,
    warnings: validation.warnings.length,
  });

  return content;
}

// ============================================================================
// SPECIALIZED GENERATORS
// ============================================================================

export async function generateDailyContent(dayOfWeek: number): Promise<GeneratedContent | null> {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = days[
    dayOfWeek
  ] as keyof typeof import('./brand-voice.js').DEFAULT_WEEKLY_SCHEDULE;

  const { DEFAULT_WEEKLY_SCHEDULE } = await import('./brand-voice.js');
  const schedule = DEFAULT_WEEKLY_SCHEDULE[dayName];
  if (!schedule) return null;

  const monthTheme = getMonthlyTheme(new Date().getMonth() + 1);

  const brief: ContentBrief = {
    pillar: schedule.pillar,
    category: schedule.category,
    topic: `${monthTheme?.name || 'General'} - ${schedule.category} content`,
    targetAudience: schedule.category === 'case-study' ? 'executives' : 'developers',
    tone: getToneForContext(schedule.category),
    keywords: monthTheme?.focusTopics,
  };

  return generateContent(brief);
}

export async function generateMilestoneContent(milestone: {
  name: string;
  description: string;
  metric?: string;
  value?: number;
}): Promise<GeneratedContent> {
  const brief: ContentBrief = {
    pillar: 'community',
    category: 'milestone',
    topic: `${milestone.name}: ${milestone.description}`,
    targetAudience: 'general',
    tone: 'warm',
    keywords: ['milestone', 'celebration', 'growth'],
    callToAction: 'Celebrate with us!',
  };

  return generateContent(brief);
}

export async function generateAnnouncementContent(announcement: {
  title: string;
  body: string;
  link?: string;
}): Promise<GeneratedContent> {
  const brief: ContentBrief = {
    pillar: 'product-updates',
    category: 'announcement',
    topic: `${announcement.title}\n\n${announcement.body}`,
    targetAudience: 'general',
    tone: 'confident',
    keywords: ['announcement', 'news', 'ferni'],
    callToAction: announcement.link ? `Learn more: ${announcement.link}` : 'Stay tuned!',
  };

  return generateContent(brief);
}

// ============================================================================
// CONTENT IMPROVEMENT
// ============================================================================

export async function improveContent(
  content: GeneratedContent,
  feedback: string
): Promise<GeneratedContent> {
  log.info('Improving content', { id: content.id, feedback });

  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({
    model: CONTENT_GENERATION_MODEL,
    systemInstruction: BRAND_VOICE_SYSTEM,
  });

  const prompt = `Improve this content based on feedback:

ORIGINAL TITLE: ${content.title}
ORIGINAL BODY:
${content.body}

FEEDBACK: ${feedback}

Return improved content in JSON format:
{
  "title": "Improved headline",
  "body": "Improved content in markdown",
  "excerpt": "Improved 1-2 sentence summary",
  "hashtags": ["updated", "hashtags"]
}`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  try {
    const jsonMatch =
      responseText.match(/```json\n?([\s\S]*?)\n?```/) || responseText.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : responseText;
    const parsed = JSON.parse(jsonStr);

    return {
      ...content,
      title: parsed.title,
      body: parsed.body,
      excerpt: parsed.excerpt,
      hashtags: parsed.hashtags,
      platforms: [
        formatForTwitter({ ...content, ...parsed }),
        formatForLinkedIn({ ...content, ...parsed }),
        formatForDiscord({ ...content, ...parsed }),
      ],
      status: 'review',
    };
  } catch (e) {
    log.error('Failed to parse improved content', { error: String(e) });
    return content;
  }
}
