#!/usr/bin/env node
/**
 * Social Media Snippet Generator
 *
 * Generates platform-optimized social media posts for blog content.
 *
 * Usage:
 *   node generate-social-snippets.js --post authentication-deep-dive.md
 *   node generate-social-snippets.js --batch   # Generate for all posts
 *   node generate-social-snippets.js --recent  # Generate for posts from last 7 days
 *
 * Output: JSON file with snippets for Twitter/X, LinkedIn, Discord, and threads
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to load gray-matter
let matter;
try {
  matter = (await import('gray-matter')).default;
} catch {
  console.error('❌ gray-matter required. Install with: pnpm add -D gray-matter');
  process.exit(1);
}

const POSTS_DIR = path.join(__dirname, '../apps/website/ferni-website/src/dev-blog');
const OUTPUT_DIR = path.join(__dirname, '../apps/website/ferni-website/social-snippets');

const BASE_URL = 'https://developers.ferni.ai';

// Platform-specific constraints
const PLATFORMS = {
  twitter: {
    maxLength: 280,
    hashtagLimit: 3,
    includeEmoji: true,
  },
  linkedin: {
    maxLength: 700,
    hashtagLimit: 5,
    includeEmoji: true,
    professional: true,
  },
  discord: {
    maxLength: 2000,
    includeEmoji: true,
    includeCodeBlocks: true,
  },
  threads: {
    maxLength: 500,
    hashtagLimit: 0,
    includeEmoji: true,
  },
};

// Category to hashtag mapping
const CATEGORY_HASHTAGS = {
  'Tutorial': ['#VoiceAI', '#DevTutorial', '#BuildInPublic'],
  'Tutorials': ['#VoiceAI', '#DevTutorial', '#BuildInPublic'],
  'Deep Dive': ['#TechDeepDive', '#Engineering', '#VoiceAI'],
  'Deep Dives': ['#TechDeepDive', '#Engineering', '#VoiceAI'],
  'Changelog': ['#Changelog', '#ProductUpdate', '#VoiceAI'],
  'Community': ['#DevCommunity', '#OpenSource', '#VoiceAI'],
  'Quick Tips': ['#DevTips', '#CodeSnippets', '#VoiceAI'],
  'Quick Tip': ['#DevTips', '#CodeSnippets', '#VoiceAI'],
  'Industry Insights': ['#VoiceAI', '#FutureOfTech', '#AITrends'],
  'Case Study': ['#CaseStudy', '#VoiceAI', '#StartupStory'],
};

function getHashtags(category, limit = 3) {
  const tags = CATEGORY_HASHTAGS[category] || ['#VoiceAI', '#Developers'];
  return tags.slice(0, limit);
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

function generateTwitterPost(post) {
  const url = `${BASE_URL}${post.url}`;
  const hashtags = getHashtags(post.category, 2).join(' ');

  // Calculate available space for title
  const reservedLength = url.length + 1 + hashtags.length + 1 + 5; // +5 for emoji and spaces
  const availableLength = 280 - reservedLength;

  const title = truncate(post.title, availableLength);

  return {
    platform: 'twitter',
    text: `📚 ${title}\n\n${url}\n\n${hashtags}`,
    length: null, // Will calculate after
  };
}

function generateTwitterThread(post) {
  const url = `${BASE_URL}${post.url}`;
  const hashtags = getHashtags(post.category, 3).join(' ');

  const tweets = [];

  // Tweet 1: Hook
  tweets.push({
    text: `🧵 ${post.title}\n\nA thread on what you'll learn:\n\n👇`,
    type: 'hook',
  });

  // Tweet 2: Summary
  tweets.push({
    text: `${post.excerpt || 'In this post, we cover everything you need to know.'}\n\nLet's dive in...`,
    type: 'summary',
  });

  // Tweet 3: CTA
  tweets.push({
    text: `📖 Read the full post:\n${url}\n\n${hashtags}`,
    type: 'cta',
  });

  return {
    platform: 'twitter_thread',
    tweets,
    totalTweets: tweets.length,
  };
}

function generateLinkedInPost(post) {
  const url = `${BASE_URL}${post.url}`;
  const hashtags = getHashtags(post.category, 5).join(' ');

  const text = `${post.title}

${post.excerpt || ''}

This is part of our ongoing series helping developers build with voice AI.

Key takeaways:
• Practical code examples you can use today
• Real-world patterns from production systems
• Best practices from the Ferni team

Read the full post: ${url}

${hashtags}`;

  return {
    platform: 'linkedin',
    text: truncate(text, 700),
    length: text.length,
  };
}

function generateDiscordPost(post) {
  const url = `${BASE_URL}${post.url}`;

  const emoji = {
    'Tutorial': '📚',
    'Tutorials': '📚',
    'Deep Dive': '🔬',
    'Deep Dives': '🔬',
    'Changelog': '🚀',
    'Community': '👥',
    'Quick Tips': '⚡',
    'Quick Tip': '⚡',
    'Industry Insights': '🌍',
  };

  const categoryEmoji = emoji[post.category] || '📝';

  const text = `${categoryEmoji} **${post.title}**

${post.excerpt || ''}

🔗 **Read more:** ${url}

---
*${post.readTime || 5} min read • ${post.category}*`;

  return {
    platform: 'discord',
    text,
    length: text.length,
  };
}

function generateThreadsPost(post) {
  const url = `${BASE_URL}${post.url}`;

  const text = `${post.title}

${truncate(post.excerpt || '', 300)}

Read more 👉 ${url}`;

  return {
    platform: 'threads',
    text: truncate(text, 500),
    length: text.length,
  };
}

async function generateSnippetsForPost(postFile) {
  const content = await fs.readFile(path.join(POSTS_DIR, postFile), 'utf-8');
  const { data } = matter(content);

  const post = {
    title: data.title,
    excerpt: data.excerpt,
    category: data.category,
    url: `/developers/blog/${postFile.replace('.md', '')}/`,
    readTime: data.readTime,
    date: data.date,
  };

  return {
    postFile,
    title: post.title,
    date: post.date,
    snippets: {
      twitter: generateTwitterPost(post),
      twitterThread: generateTwitterThread(post),
      linkedin: generateLinkedInPost(post),
      discord: generateDiscordPost(post),
      threads: generateThreadsPost(post),
    },
  };
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const postIndex = args.indexOf('--post');
  const batch = args.includes('--batch');
  const recent = args.includes('--recent');

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  if (postIndex !== -1) {
    // Single post mode
    const postFile = args[postIndex + 1];
    console.log(`📱 Generating snippets for: ${postFile}`);

    const result = await generateSnippetsForPost(postFile);

    const outputFile = path.join(OUTPUT_DIR, `${postFile.replace('.md', '')}-social.json`);
    await fs.writeFile(outputFile, JSON.stringify(result, null, 2));

    console.log(`✅ Generated: ${outputFile}`);
    console.log('\n--- Twitter ---');
    console.log(result.snippets.twitter.text);
    console.log('\n--- LinkedIn ---');
    console.log(result.snippets.linkedin.text);
  } else if (batch || recent) {
    // Batch mode
    console.log('📱 Generating snippets for all posts...');

    const files = await fs.readdir(POSTS_DIR);
    const postFiles = files.filter((f) => f.endsWith('.md') && f !== 'dev-blog.json');

    const allSnippets = [];
    let processed = 0;

    for (const postFile of postFiles) {
      try {
        const content = await fs.readFile(path.join(POSTS_DIR, postFile), 'utf-8');
        const { data } = matter(content);

        // If --recent, only process posts from last 7 days
        if (recent) {
          const postDate = new Date(data.date);
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);

          if (postDate < weekAgo) continue;
        }

        const result = await generateSnippetsForPost(postFile);
        allSnippets.push(result);

        const outputFile = path.join(OUTPUT_DIR, `${postFile.replace('.md', '')}-social.json`);
        await fs.writeFile(outputFile, JSON.stringify(result, null, 2));

        processed++;
        console.log(`✅ ${postFile}`);
      } catch (error) {
        console.error(`❌ Error processing ${postFile}:`, error.message);
      }
    }

    // Also save combined file
    const combinedFile = path.join(OUTPUT_DIR, 'all-snippets.json');
    await fs.writeFile(combinedFile, JSON.stringify(allSnippets, null, 2));

    console.log(`\n✨ Generated snippets for ${processed} posts`);
    console.log(`📁 Combined file: ${combinedFile}`);
  } else {
    console.log(`
Social Media Snippet Generator

Usage:
  Single post:
    node generate-social-snippets.js --post authentication-deep-dive.md

  Batch modes:
    node generate-social-snippets.js --batch   # All posts
    node generate-social-snippets.js --recent  # Posts from last 7 days

Output:
  Creates JSON files with platform-specific snippets in social-snippets/
`);
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
