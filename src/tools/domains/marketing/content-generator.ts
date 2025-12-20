/**
 * Social Content Generator
 *
 * Uses Claude to generate platform-specific social media content
 * from blog posts, topics, or announcements.
 */

import OpenAI from 'openai';
import { getLogger } from '../../../utils/safe-logger.js';
import * as fs from 'fs';
import * as path from 'path';

const log = getLogger();

interface GenerateParams {
  source: 'blog' | 'topic' | 'announcement';
  blogUrl?: string;
  topic?: string;
  announcement?: string;
  platforms: ('twitter' | 'linkedin' | 'instagram')[];
  tone: 'professional' | 'casual' | 'thought-leadership';
}

interface GeneratedContent {
  twitter?: {
    thread: string[];
    characterCounts: number[];
  };
  linkedin?: {
    post: string;
    hashtags: string[];
  };
  instagram?: {
    slides: string[];
    caption: string;
    hashtags: string[];
  };
}

const FERNI_VOICE_PROMPT = `You are writing social media content for Ferni, an AI life coaching company.

## BRAND VOICE
Ferni's voice is: Warm, Grounded, Wise, Present, Human

### Tone Examples
✅ "We're here when you need us."
❌ "We're sooooo happy to help you! 💕"

✅ "Ferni remembers everything."
❌ "We're the best AI ever made."

✅ "Just talk. We'll understand."
❌ "Utilize natural language processing."

## STRICT RULES

### NEVER:
- Use "revolutionary", "groundbreaking", "game-changing", "cutting-edge"
- Use "excited to announce", "thrilled to share"
- Use tech jargon without explanation
- Sound corporate, salesy, or hypey
- Use more than 2 hashtags on Twitter
- Use purple emojis 💜 (use 🌿 for Ferni sage green)
- Overuse emojis (max 1-2 per post)

### ALWAYS:
- Start with an observation, insight, or story—not an announcement
- Be specific about challenges and tradeoffs (authenticity)
- Include something human (hesitation, surprise, lesson learned)
- End with an invitation or question, not a demand
- Use "we" and "you" conversationally
- Keep it grounded and honest`;

export async function generateSocialContentFromBlog(
  params: GenerateParams
): Promise<GeneratedContent> {
  log.info({ source: params.source, platforms: params.platforms }, '📝 Generating social content');

  // Get source content
  let sourceContent = '';
  let sourceTitle = '';

  if (params.source === 'blog' && params.blogUrl) {
    const blogContent = await loadBlogContent(params.blogUrl);
    sourceContent = blogContent.content;
    sourceTitle = blogContent.title;
  } else if (params.source === 'topic' && params.topic) {
    sourceContent = params.topic;
    sourceTitle = params.topic;
  } else if (params.source === 'announcement' && params.announcement) {
    sourceContent = params.announcement;
    sourceTitle = 'Announcement';
  } else {
    throw new Error('Invalid source parameters');
  }

  // Generate content using OpenAI
  const openai = new OpenAI();

  const platformInstructions = params.platforms
    .map((p) => {
      switch (p) {
        case 'twitter':
          return `**Twitter Thread**:
- 7 tweets maximum
- First tweet must hook immediately (no "Thread:" or "🧵")
- Each tweet should work standalone but flow together
- Last tweet includes call-to-action with link to app.ferni.ai
- No hashtags inline, max 2 at end of last tweet`;
        case 'linkedin':
          return `**LinkedIn Post**:
- 200-300 words
- Professional but human
- Include line breaks for scannability
- End with soft CTA or engaging question
- Max 3 hashtags at end`;
        case 'instagram':
          return `**Instagram Carousel**:
- 7 slides (text for graphics team)
- Slide 1: Hook/title (bold, attention-grabbing)
- Slides 2-6: One key insight per slide
- Slide 7: CTA with app.ferni.ai
- Caption: 2-3 sentences + 8-12 hashtags`;
        default:
          return '';
      }
    })
    .join('\n\n');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 4000,
    messages: [
      {
        role: 'system',
        content: FERNI_VOICE_PROMPT,
      },
      {
        role: 'user',
        content: `## YOUR TASK

Generate social media content based on this source material.

**Source Title:** "${sourceTitle}"

**Source Content:**
${sourceContent}

**Tone:** ${params.tone}

**Generate content for:**
${platformInstructions}

---

## OUTPUT FORMAT

Return valid JSON with this exact structure (only include platforms requested):

{
  ${params.platforms.includes('twitter') ? `"twitter": {
    "thread": ["Tweet 1", "Tweet 2", ...],
    "characterCounts": [120, 180, ...]
  },` : ''}
  ${params.platforms.includes('linkedin') ? `"linkedin": {
    "post": "Full LinkedIn post text",
    "hashtags": ["#AI", "#LifeCoach", "#Ferni"]
  },` : ''}
  ${params.platforms.includes('instagram') ? `"instagram": {
    "slides": ["Slide 1 text", "Slide 2 text", ...],
    "caption": "Caption text",
    "hashtags": ["#ferni", "#aicoach", ...]
  }` : ''}
}

IMPORTANT: Return ONLY the JSON object, no markdown code fences or explanation.`,
      },
    ],
  });

  // Parse response
  const textContent = response.choices[0]?.message?.content;
  if (!textContent) {
    throw new Error('No content in response from OpenAI');
  }

  let jsonText = textContent.trim();
  
  // Extract JSON if wrapped in code fences
  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }

  try {
    const content = JSON.parse(jsonText) as GeneratedContent;
    log.info({ platforms: Object.keys(content) }, '📝 Content generated successfully');
    return content;
  } catch (error) {
    log.error({ error: String(error), response: jsonText.substring(0, 500) }, '📝 Failed to parse generated content');
    throw new Error('Failed to parse generated content');
  }
}

async function loadBlogContent(urlOrPath: string): Promise<{ title: string; content: string }> {
  // Check if it's a file path
  if (urlOrPath.startsWith('/') || urlOrPath.startsWith('./') || urlOrPath.includes('apps/marketing')) {
    // It's a file path
    let filePath = urlOrPath;
    
    // Handle relative paths
    if (!path.isAbsolute(filePath)) {
      filePath = path.join(process.cwd(), filePath);
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`Blog file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Extract title from markdown
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : path.basename(filePath, '.md');

    return { title, content };
  }

  // It's a URL - fetch it
  if (urlOrPath.startsWith('http')) {
    const response = await fetch(urlOrPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch blog: ${response.statusText}`);
    }
    
    const html = await response.text();
    
    // Basic HTML to text extraction (could be improved with a proper parser)
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : 'Blog Post';
    
    // Strip HTML tags for content
    const content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return { title, content };
  }

  throw new Error(`Invalid blog URL or path: ${urlOrPath}`);
}

export default generateSocialContentFromBlog;

