#!/usr/bin/env npx ts-node
/**
 * Ferni AI Social Post Generator
 * 
 * Uses Claude to generate on-brand social media content from blog posts.
 * Outputs ready-to-schedule content for LinkedIn, Twitter, and Instagram.
 * 
 * Usage: 
 *   npx ts-node apps/marketing/scripts/generate-social-posts.ts
 *   npx ts-node apps/marketing/scripts/generate-social-posts.ts --post 1
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const BLOG_DIR = path.join(__dirname, '../copy/blog-posts');
const OUTPUT_DIR = path.join(__dirname, '../content/social');

const FERNI_VOICE_PROMPT = `You are writing social media content for Ferni, an AI life coaching company based in Park City, Utah.

## BRAND VOICE
Ferni's voice is: Warm, Grounded, Wise, Present, Human

### Tone Examples
✅ "We're here when you need us."
❌ "We're sooooo happy to help you! 💕"

✅ "Ferni remembers everything."
❌ "We're the best AI ever made."

✅ "Just talk. We'll understand."
❌ "Utilize natural language processing."

✅ "Like talking to a friend who never forgets."
❌ "Our AI simulates human connection."

## STRICT RULES

### NEVER:
- Use "revolutionary", "groundbreaking", "game-changing", "cutting-edge"
- Use "excited to announce", "thrilled to share"
- Use tech jargon without explanation
- Sound corporate, salesy, or hypey
- Use more than 2 hashtags on Twitter
- Use purple emojis 💜 (not our brand color - use 🌿 for Ferni sage green)
- Overuse emojis (max 1-2 per post)

### ALWAYS:
- Start with an observation, insight, or story—not an announcement
- Be specific about challenges and tradeoffs (authenticity)
- Include something human (hesitation, surprise, lesson learned)
- End with an invitation or question, not a demand
- Use "we" and "you" conversationally
- Keep it grounded and honest

## PLATFORM GUIDELINES

### LinkedIn
- 200-300 words
- Professional but human
- Single-spaced for readability
- Include line breaks for scannability
- End with soft CTA or engaging question
- No more than 3 hashtags at end

### Twitter/X
- 7 tweets in a thread
- First tweet must hook immediately
- Each tweet should work standalone but flow together
- Last tweet includes call-to-action with [LINK] placeholder
- No hashtags inline, maximum 2 at end of last tweet

### Instagram
- 7 carousel slides (text for graphics team to design)
- Slide 1: Hook/title (bold, attention-grabbing)
- Slides 2-6: One key insight per slide (punchy, visual)
- Slide 7: CTA with app.ferni.ai
- Caption: 2-3 sentences + hashtags (8-12 hashtags ok for Instagram)`;

// ============================================================================
// Types
// ============================================================================

interface GeneratedContent {
  linkedin: string;
  twitter: string[];
  instagram: {
    slides: string[];
    caption: string;
  };
}

interface BlogMeta {
  id: number;
  title: string;
  slug: string;
  filePath: string;
}

// ============================================================================
// Claude Integration
// ============================================================================

async function generateSocialContent(
  anthropic: Anthropic,
  blogContent: string,
  blogTitle: string
): Promise<GeneratedContent> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `${FERNI_VOICE_PROMPT}

---

## YOUR TASK

Based on the blog post below, create social media content for all three platforms.

**Blog Title:** "${blogTitle}"

**Blog Content:**
${blogContent}

---

## OUTPUT FORMAT

Return valid JSON with this exact structure:

{
  "linkedin": "Full LinkedIn post here (200-300 words, with line breaks as \\n)",
  "twitter": [
    "Tweet 1 (the hook - must grab attention)",
    "Tweet 2",
    "Tweet 3",
    "Tweet 4",
    "Tweet 5",
    "Tweet 6",
    "Tweet 7 (CTA with [LINK] placeholder)"
  ],
  "instagram": {
    "slides": [
      "Slide 1: [Hook/Title]",
      "Slide 2: [Key insight 1]",
      "Slide 3: [Key insight 2]",
      "Slide 4: [Key insight 3]",
      "Slide 5: [Key insight 4]",
      "Slide 6: [Key insight 5]",
      "Slide 7: [CTA - Try Ferni: app.ferni.ai]"
    ],
    "caption": "Caption text with hashtags"
  }
}

IMPORTANT: Return ONLY the JSON object, no markdown code fences or explanation.`
    }]
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  // Parse JSON response
  try {
    // Try to extract JSON if wrapped in code fences
    let jsonText = content.text.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    }
    
    return JSON.parse(jsonText);
  } catch (error) {
    console.error('Failed to parse Claude response:', content.text.substring(0, 500));
    throw new Error(`JSON parse error: ${error}`);
  }
}

// ============================================================================
// File Operations
// ============================================================================

function findBlogPosts(): BlogMeta[] {
  if (!fs.existsSync(BLOG_DIR)) {
    console.error(`Blog directory not found: ${BLOG_DIR}`);
    return [];
  }

  const files = fs.readdirSync(BLOG_DIR)
    .filter(f => f.endsWith('.md') && !f.startsWith('SOCIAL') && !f.startsWith('README'));
  
  return files.map((file, index) => {
    const content = fs.readFileSync(path.join(BLOG_DIR, file), 'utf-8');
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const slug = file.replace(/^\d+-/, '').replace('.md', '');
    
    return {
      id: index + 1,
      title: titleMatch ? titleMatch[1] : file.replace('.md', ''),
      slug,
      filePath: path.join(BLOG_DIR, file),
    };
  });
}

function saveSocialContent(slug: string, content: GeneratedContent): void {
  // Ensure directories exist
  fs.mkdirSync(path.join(OUTPUT_DIR, 'linkedin'), { recursive: true });
  fs.mkdirSync(path.join(OUTPUT_DIR, 'twitter'), { recursive: true });
  fs.mkdirSync(path.join(OUTPUT_DIR, 'instagram'), { recursive: true });

  // Save LinkedIn (markdown)
  const linkedinPath = path.join(OUTPUT_DIR, 'linkedin', `${slug}.md`);
  fs.writeFileSync(linkedinPath, content.linkedin);
  console.log(`  📝 LinkedIn: ${linkedinPath}`);

  // Save Twitter (JSON array)
  const twitterPath = path.join(OUTPUT_DIR, 'twitter', `${slug}.json`);
  fs.writeFileSync(twitterPath, JSON.stringify({
    thread: content.twitter,
    generatedAt: new Date().toISOString(),
  }, null, 2));
  console.log(`  🐦 Twitter: ${twitterPath}`);

  // Save Instagram (JSON)
  const instagramPath = path.join(OUTPUT_DIR, 'instagram', `${slug}.json`);
  fs.writeFileSync(instagramPath, JSON.stringify({
    slides: content.instagram.slides,
    caption: content.instagram.caption,
    generatedAt: new Date().toISOString(),
  }, null, 2));
  console.log(`  📸 Instagram: ${instagramPath}`);
}

// ============================================================================
// Main
// ============================================================================

async function processBlogPost(anthropic: Anthropic, blog: BlogMeta): Promise<void> {
  console.log(`\n📄 Processing: ${blog.title}`);
  console.log(`   File: ${blog.filePath}`);

  const blogContent = fs.readFileSync(blog.filePath, 'utf-8');
  
  console.log('   🤖 Generating content with Claude...');
  const generated = await generateSocialContent(anthropic, blogContent, blog.title);
  
  saveSocialContent(blog.slug, generated);
}

async function main() {
  console.log('🌿 Ferni Social Post Generator\n');
  console.log('=' .repeat(50));

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ Error: ANTHROPIC_API_KEY environment variable not set');
    console.log('\nTo fix, run:');
    console.log('  export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  const anthropic = new Anthropic();

  // Parse CLI arguments
  const args = process.argv.slice(2);
  const postArg = args.indexOf('--post');
  const targetPostId = postArg !== -1 ? parseInt(args[postArg + 1]) : null;

  // Find blog posts
  const blogs = findBlogPosts();
  
  if (blogs.length === 0) {
    console.log('⚠️  No blog posts found in:', BLOG_DIR);
    console.log('\nExpected location: apps/marketing/copy/blog-posts/*.md');
    process.exit(1);
  }

  console.log(`\n📚 Found ${blogs.length} blog post(s)`);
  
  // Filter if specific post requested
  const postsToProcess = targetPostId 
    ? blogs.filter(b => b.id === targetPostId)
    : blogs;

  if (postsToProcess.length === 0) {
    console.error(`❌ Post #${targetPostId} not found`);
    process.exit(1);
  }

  // Process each blog post
  for (const blog of postsToProcess) {
    try {
      await processBlogPost(anthropic, blog);
      
      // Rate limiting between posts
      if (postsToProcess.indexOf(blog) < postsToProcess.length - 1) {
        console.log('\n   ⏳ Waiting 2s (rate limit)...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`\n❌ Failed to process "${blog.title}":`, error);
    }
  }

  console.log('\n' + '=' .repeat(50));
  console.log('✅ Generation complete!\n');
  console.log('📁 Output location:', OUTPUT_DIR);
  console.log('\n🚀 Next steps:');
  console.log('   1. Review generated content in apps/marketing/content/social/');
  console.log('   2. Edit as needed to match your voice perfectly');
  console.log('   3. Run `npm run marketing:schedule` to queue in Buffer');
  console.log('');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

