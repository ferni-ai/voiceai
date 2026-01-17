#!/usr/bin/env node
/**
 * Weekly Digest Generator
 *
 * Collects posts from the past week and generates newsletter content
 * in both HTML and plain text formats.
 *
 * Usage:
 *   node generate-weekly-digest.js                    # Generate this week's digest
 *   node generate-weekly-digest.js --preview          # Preview without sending
 *   node generate-weekly-digest.js --send             # Send via configured provider
 *   node generate-weekly-digest.js --date 2026-01-15  # Generate for specific date
 *
 * Environment:
 *   NEWSLETTER_PROVIDER - 'convertkit' | 'buttondown' | 'resend'
 *   NEWSLETTER_API_KEY - API key for newsletter provider
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
const OUTPUT_DIR = path.join(__dirname, '../apps/website/ferni-website/newsletters');

const CATEGORY_EMOJI = {
  'Tutorials': '📚',
  'Tutorial': '📚',
  'Changelog': '🚀',
  'Deep Dives': '🔬',
  'Deep Dive': '🔬',
  'Case Studies': '💼',
  'Case Study': '💼',
  'Community': '👥',
  'Quick Tips': '⚡',
  'Quick Tip': '⚡',
  'Industry Insights': '🌍',
  'Roadmap': '🗺️',
  'Announcements': '📢',
};

function getCategoryEmoji(category) {
  return CATEGORY_EMOJI[category] || '📝';
}

async function getRecentPosts(referenceDate, daysBack = 7) {
  const files = await fs.readdir(POSTS_DIR);
  const cutoffDate = new Date(referenceDate);
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const posts = [];

  for (const file of files) {
    if (!file.endsWith('.md') || file === 'dev-blog.json') continue;

    const content = await fs.readFile(path.join(POSTS_DIR, file), 'utf-8');
    const { data } = matter(content);

    const postDate = new Date(data.date);

    if (postDate >= cutoffDate && postDate <= new Date(referenceDate)) {
      posts.push({
        title: data.title,
        excerpt: data.excerpt,
        category: data.category,
        url: `/developers/blog/${file.replace('.md', '')}/`,
        date: data.date,
        readTime: data.readTime,
        author: data.author,
      });
    }
  }

  // Sort by date, newest first
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));

  return posts;
}

function groupByCategory(posts) {
  return posts.reduce((acc, post) => {
    const category = post.category || 'Other';
    acc[category] = acc[category] || [];
    acc[category].push(post);
    return acc;
  }, {});
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function generatePlainText(posts, grouped, weekDate) {
  const lines = [];

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`FERNI DEV WEEKLY - ${formatDate(weekDate)}`);
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  // Featured post (most recent)
  if (posts.length > 0) {
    const featured = posts[0];
    lines.push('🌟 THIS WEEK\'S HIGHLIGHT');
    lines.push('');
    lines.push(`  ${featured.title}`);
    lines.push(`  ${featured.excerpt}`);
    lines.push(`  → https://developers.ferni.ai${featured.url}`);
    lines.push('');
    lines.push('────────────────────────────────────────────────────');
    lines.push('');
  }

  // Posts by category
  for (const [category, categoryPosts] of Object.entries(grouped)) {
    const emoji = getCategoryEmoji(category);
    lines.push(`${emoji} ${category.toUpperCase()}`);
    lines.push('');

    for (const post of categoryPosts) {
      lines.push(`  • ${post.title}`);
      lines.push(`    ${post.readTime || 5} min read`);
      lines.push(`    → https://developers.ferni.ai${post.url}`);
      lines.push('');
    }

    lines.push('');
  }

  lines.push('────────────────────────────────────────────────────');
  lines.push('');
  lines.push('📣 QUICK LINKS');
  lines.push('');
  lines.push('  • Documentation: https://developers.ferni.ai/docs/');
  lines.push('  • Discord: https://discord.gg/ferni');
  lines.push('  • GitHub: https://github.com/ferni-ai');
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('Happy building,');
  lines.push('The Ferni Team');
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('You\'re receiving this because you subscribed to Ferni Dev Weekly.');
  lines.push('Unsubscribe: {{unsubscribe_url}}');
  lines.push('');

  return lines.join('\n');
}

function generateHTML(posts, grouped, weekDate) {
  const featuredPost = posts[0];

  const categoryBlocks = Object.entries(grouped)
    .map(([category, categoryPosts]) => {
      const emoji = getCategoryEmoji(category);
      const postsHtml = categoryPosts
        .map(
          (post) => `
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #334155;">
              <a href="https://developers.ferni.ai${post.url}"
                 style="color: #38bdf8; text-decoration: none; font-weight: 600; font-size: 16px;">
                ${post.title}
              </a>
              <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 14px;">
                ${post.excerpt || ''}
              </p>
              <span style="color: #64748b; font-size: 12px;">
                ${post.readTime || 5} min read
              </span>
            </td>
          </tr>
        `
        )
        .join('');

      return `
        <table width="100%" style="margin-bottom: 24px;">
          <tr>
            <td style="padding-bottom: 8px;">
              <span style="font-size: 18px; font-weight: 600; color: #e2e8f0;">
                ${emoji} ${category}
              </span>
            </td>
          </tr>
          ${postsHtml}
        </table>
      `;
    })
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ferni Dev Weekly - ${formatDate(weekDate)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1e293b; border-radius: 12px; overflow: hidden;">

          <!-- Header -->
          <tr>
            <td style="padding: 32px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);">
              <table width="100%">
                <tr>
                  <td>
                    <!-- Ferni Eyes Logo -->
                    <svg width="48" height="48" viewBox="0 0 100 100" style="margin-bottom: 16px;">
                      <circle cx="50" cy="50" r="45" fill="#38bdf8" opacity="0.1"/>
                      <ellipse cx="35" cy="50" rx="8" ry="10" fill="white"/>
                      <ellipse cx="65" cy="50" rx="8" ry="10" fill="white"/>
                    </svg>
                  </td>
                </tr>
                <tr>
                  <td>
                    <h1 style="margin: 0; color: #e2e8f0; font-size: 28px; font-weight: 700;">
                      Ferni Dev Weekly
                    </h1>
                    <p style="margin: 8px 0 0 0; color: #94a3b8; font-size: 16px;">
                      ${formatDate(weekDate)}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${
            featuredPost
              ? `
          <!-- Featured Post -->
          <tr>
            <td style="padding: 0 32px;">
              <table width="100%" style="background-color: #0f172a; border-radius: 8px; overflow: hidden;">
                <tr>
                  <td style="padding: 24px;">
                    <span style="color: #38bdf8; font-size: 12px; font-weight: 600; letter-spacing: 0.1em;">
                      🌟 THIS WEEK'S HIGHLIGHT
                    </span>
                    <h2 style="margin: 12px 0 8px 0; color: #e2e8f0; font-size: 22px;">
                      <a href="https://developers.ferni.ai${featuredPost.url}"
                         style="color: #e2e8f0; text-decoration: none;">
                        ${featuredPost.title}
                      </a>
                    </h2>
                    <p style="margin: 0 0 16px 0; color: #94a3b8; font-size: 15px; line-height: 1.5;">
                      ${featuredPost.excerpt || ''}
                    </p>
                    <a href="https://developers.ferni.ai${featuredPost.url}"
                       style="display: inline-block; padding: 10px 20px; background-color: #38bdf8; color: #0f172a; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
                      Read More →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          `
              : ''
          }

          <!-- Posts by Category -->
          <tr>
            <td style="padding: 32px;">
              ${categoryBlocks}
            </td>
          </tr>

          <!-- Quick Links -->
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <table width="100%" style="background-color: #0f172a; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px;">
                    <span style="color: #94a3b8; font-size: 14px; font-weight: 600;">
                      📣 Quick Links
                    </span>
                    <p style="margin: 12px 0 0 0; font-size: 14px;">
                      <a href="https://developers.ferni.ai/docs/" style="color: #38bdf8; text-decoration: none;">Documentation</a> •
                      <a href="https://discord.gg/ferni" style="color: #38bdf8; text-decoration: none;">Discord</a> •
                      <a href="https://github.com/ferni-ai" style="color: #38bdf8; text-decoration: none;">GitHub</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #0f172a; border-top: 1px solid #334155;">
              <p style="margin: 0 0 8px 0; color: #e2e8f0; font-size: 14px;">
                Happy building,<br>
                <strong>The Ferni Team</strong>
              </p>
              <p style="margin: 16px 0 0 0; color: #64748b; font-size: 12px;">
                You're receiving this because you subscribed to Ferni Dev Weekly.<br>
                <a href="{{unsubscribe_url}}" style="color: #64748b;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function generateMarkdown(posts, grouped, weekDate) {
  const lines = [];

  lines.push(`# Ferni Dev Weekly - ${formatDate(weekDate)}`);
  lines.push('');

  if (posts.length > 0) {
    const featured = posts[0];
    lines.push('## 🌟 This Week\'s Highlight');
    lines.push('');
    lines.push(`### [${featured.title}](https://developers.ferni.ai${featured.url})`);
    lines.push('');
    lines.push(featured.excerpt || '');
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  for (const [category, categoryPosts] of Object.entries(grouped)) {
    const emoji = getCategoryEmoji(category);
    lines.push(`## ${emoji} ${category}`);
    lines.push('');

    for (const post of categoryPosts) {
      lines.push(`- [${post.title}](https://developers.ferni.ai${post.url}) - ${post.readTime || 5} min`);
    }

    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('**Quick Links:** [Documentation](https://developers.ferni.ai/docs/) • [Discord](https://discord.gg/ferni) • [GitHub](https://github.com/ferni-ai)');
  lines.push('');
  lines.push('Happy building,');
  lines.push('The Ferni Team');

  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const dateIndex = args.indexOf('--date');
  const preview = args.includes('--preview');
  const send = args.includes('--send');

  const referenceDate = dateIndex !== -1 ? args[dateIndex + 1] : new Date().toISOString().split('T')[0];

  console.log(`📧 Generating weekly digest for ${referenceDate}...`);

  // Get posts from the past week
  const posts = await getRecentPosts(referenceDate);
  console.log(`📝 Found ${posts.length} posts from the past week`);

  if (posts.length === 0) {
    console.log('⚠️  No posts found for this period');
    return;
  }

  const grouped = groupByCategory(posts);

  // Generate all formats
  const plainText = generatePlainText(posts, grouped, referenceDate);
  const html = generateHTML(posts, grouped, referenceDate);
  const markdown = generateMarkdown(posts, grouped, referenceDate);

  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Save files
  const weekSlug = referenceDate.replace(/-/g, '');
  await fs.writeFile(path.join(OUTPUT_DIR, `${weekSlug}-digest.txt`), plainText);
  await fs.writeFile(path.join(OUTPUT_DIR, `${weekSlug}-digest.html`), html);
  await fs.writeFile(path.join(OUTPUT_DIR, `${weekSlug}-digest.md`), markdown);

  console.log(`✅ Generated digest files in ${OUTPUT_DIR}/`);

  if (preview) {
    console.log('\n--- PREVIEW (Markdown) ---\n');
    console.log(markdown);
    console.log('\n--- END PREVIEW ---\n');
  }

  if (send) {
    console.log('📤 Sending digest...');
    // TODO: Integrate with newsletter provider
    // This would call ConvertKit, Buttondown, or Resend API
    console.log('⚠️  Newsletter sending not yet implemented');
    console.log('   Configure NEWSLETTER_PROVIDER and NEWSLETTER_API_KEY');
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
