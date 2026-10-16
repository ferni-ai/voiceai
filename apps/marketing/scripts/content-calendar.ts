#!/usr/bin/env npx ts-node
/**
 * Ferni Marketing Content Calendar Generator
 * 
 * Generates a complete publishing schedule for the "Building in Public" blog series
 * with corresponding social media posts across LinkedIn, Twitter, and Instagram.
 * 
 * Usage: npx ts-node apps/marketing/scripts/content-calendar.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Types
// ============================================================================

interface BlogPost {
  id: number;
  title: string;
  slug: string;
  seriesPart: number;
  publishDate: string;
  status: 'draft' | 'review' | 'scheduled' | 'published';
  filePath: string;
}

interface SocialPost {
  id: string;
  blogId: number;
  platform: 'linkedin' | 'twitter' | 'instagram';
  scheduledTime: string;
  content: string;
  contentFile: string;
  status: 'draft' | 'generated' | 'scheduled' | 'posted';
  postUrl?: string;
}

interface ContentCalendar {
  generatedAt: string;
  series: {
    name: string;
    description: string;
    startDate: string;
    cadence: string;
  };
  blogs: BlogPost[];
  social: SocialPost[];
  schedule: WeeklySchedule[];
}

interface WeeklySchedule {
  week: number;
  startDate: string;
  blogPost: number;
  tasks: {
    day: string;
    platform: string;
    action: string;
  }[];
}

// ============================================================================
// Configuration
// ============================================================================

const SERIES_CONFIG = {
  name: 'Building in Public',
  description: 'The authentic story of building an AI life coaching platform with AI as a development partner.',
  startDate: '2024-12-09',
  cadenceWeeks: 2, // Bi-weekly
};

const BLOG_POSTS: Omit<BlogPost, 'publishDate' | 'status' | 'filePath'>[] = [
  {
    id: 1,
    title: 'Why We Let AI Help Build Ferni',
    slug: 'why-we-let-ai-help-build-ferni',
    seriesPart: 1,
  },
  {
    id: 2,
    title: 'How an AI Helped Design Its Own Brain',
    slug: 'how-ai-helped-design-its-own-brain',
    seriesPart: 2,
  },
  {
    id: 3,
    title: 'Giving AI a Personality (Without Losing Its Soul)',
    slug: 'giving-ai-a-personality',
    seriesPart: 3,
  },
  {
    id: 4,
    title: 'Our Daily Standup Has an AI in the Room',
    slug: 'daily-standup-with-ai',
    seriesPart: 4,
  },
  {
    id: 5,
    title: 'How Ferni Remembers You (Without Being Creepy)',
    slug: 'how-ferni-remembers-you',
    seriesPart: 5,
  },
  {
    id: 6,
    title: "We Ship Every Day. Here's How.",
    slug: 'we-ship-every-day',
    seriesPart: 6,
  },
  {
    id: 7,
    title: 'AI Should Make You Feel Less Alone',
    slug: 'ai-should-make-you-feel-less-alone',
    seriesPart: 7,
  },
  {
    id: 8,
    title: "What's Next for Ferni",
    slug: 'whats-next-for-ferni',
    seriesPart: 8,
  },
];

const POSTING_SCHEDULE = {
  linkedin: { dayOffset: 0, hour: 9, timezone: 'America/New_York' },
  twitter: { dayOffset: 0, hour: 12, timezone: 'America/New_York' },
  instagram: { dayOffset: 1, hour: 11, timezone: 'America/New_York' },
};

// ============================================================================
// Helpers
// ============================================================================

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatDateTime(date: Date, hour: number): string {
  const d = new Date(date);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

// ============================================================================
// Generators
// ============================================================================

function generateBlogSchedule(): BlogPost[] {
  const startDate = new Date(SERIES_CONFIG.startDate);
  
  return BLOG_POSTS.map((post, index) => {
    const publishDate = addDays(startDate, index * SERIES_CONFIG.cadenceWeeks * 7);
    const paddedId = String(post.id).padStart(2, '0');
    
    return {
      ...post,
      publishDate: formatDate(publishDate),
      status: 'draft' as const,
      filePath: `apps/marketing/copy/blog-posts/${paddedId}-${post.slug}.md`,
    };
  });
}

function generateSocialSchedule(blogs: BlogPost[]): SocialPost[] {
  const social: SocialPost[] = [];
  
  for (const blog of blogs) {
    const blogDate = new Date(blog.publishDate);
    
    for (const [platform, config] of Object.entries(POSTING_SCHEDULE)) {
      const scheduledDate = addDays(blogDate, config.dayOffset);
      
      social.push({
        id: `${blog.slug}-${platform}`,
        blogId: blog.id,
        platform: platform as SocialPost['platform'],
        scheduledTime: formatDateTime(scheduledDate, config.hour),
        content: '', // Will be generated by AI script
        contentFile: `apps/marketing/content/social/${platform}/${blog.slug}.${platform === 'twitter' || platform === 'instagram' ? 'json' : 'md'}`,
        status: 'draft',
      });
    }
  }
  
  return social;
}

function generateWeeklySchedule(blogs: BlogPost[], social: SocialPost[]): WeeklySchedule[] {
  const weeks: WeeklySchedule[] = [];
  
  for (const blog of blogs) {
    const weekStart = new Date(blog.publishDate);
    // Adjust to Monday
    const dayOfWeek = weekStart.getDay();
    const daysToMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
    weekStart.setDate(weekStart.getDate() - dayOfWeek + 1);
    
    const weekNumber = Math.floor((new Date(blog.publishDate).getTime() - new Date(SERIES_CONFIG.startDate).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
    
    const blogSocial = social.filter(s => s.blogId === blog.id);
    
    weeks.push({
      week: weekNumber,
      startDate: formatDate(weekStart),
      blogPost: blog.id,
      tasks: [
        {
          day: blog.publishDate,
          platform: 'blog',
          action: `Publish: "${blog.title}"`,
        },
        ...blogSocial.map(s => ({
          day: s.scheduledTime.split('T')[0],
          platform: s.platform,
          action: `Post ${s.platform === 'twitter' ? 'thread' : s.platform === 'instagram' ? 'carousel' : 'article'}`,
        })),
      ],
    });
  }
  
  return weeks;
}

// ============================================================================
// Output
// ============================================================================

function generateMarkdownCalendar(calendar: ContentCalendar): string {
  let md = `# ${calendar.series.name} - Publishing Calendar

> ${calendar.series.description}

**Start Date:** ${calendar.series.startDate}  
**Cadence:** ${calendar.series.cadence}  
**Generated:** ${new Date(calendar.generatedAt).toLocaleDateString()}

---

## 📅 Schedule Overview

| Week | Date | Blog Post | LinkedIn | Twitter | Instagram |
|------|------|-----------|----------|---------|-----------|
`;

  for (const week of calendar.schedule) {
    const blog = calendar.blogs.find(b => b.id === week.blogPost);
    if (!blog) continue;
    
    const linkedinDate = calendar.social.find(s => s.blogId === blog.id && s.platform === 'linkedin')?.scheduledTime.split('T')[0];
    const twitterDate = calendar.social.find(s => s.blogId === blog.id && s.platform === 'twitter')?.scheduledTime.split('T')[0];
    const instagramDate = calendar.social.find(s => s.blogId === blog.id && s.platform === 'instagram')?.scheduledTime.split('T')[0];
    
    md += `| ${week.week} | ${blog.publishDate} | ${blog.title} | ${linkedinDate} | ${twitterDate} | ${instagramDate} |\n`;
  }

  md += `
---

## 📝 Blog Posts

`;

  for (const blog of calendar.blogs) {
    md += `### Part ${blog.seriesPart}: ${blog.title}

- **Publish Date:** ${blog.publishDate}
- **Status:** ${blog.status}
- **File:** \`${blog.filePath}\`
- **Slug:** \`${blog.slug}\`

`;
  }

  md += `---

## 🔗 Social Media Schedule

### LinkedIn
`;

  for (const post of calendar.social.filter(s => s.platform === 'linkedin')) {
    const blog = calendar.blogs.find(b => b.id === post.blogId);
    md += `- **${post.scheduledTime.split('T')[0]}** - ${blog?.title} → \`${post.contentFile}\`\n`;
  }

  md += `
### Twitter/X
`;

  for (const post of calendar.social.filter(s => s.platform === 'twitter')) {
    const blog = calendar.blogs.find(b => b.id === post.blogId);
    md += `- **${post.scheduledTime.split('T')[0]}** - ${blog?.title} → \`${post.contentFile}\`\n`;
  }

  md += `
### Instagram
`;

  for (const post of calendar.social.filter(s => s.platform === 'instagram')) {
    const blog = calendar.blogs.find(b => b.id === post.blogId);
    md += `- **${post.scheduledTime.split('T')[0]}** - ${blog?.title} → \`${post.contentFile}\`\n`;
  }

  md += `
---

## 🚀 Quick Commands

\`\`\`bash
# Generate social media posts from blog content
npm run marketing:generate-social

# Schedule posts to Buffer
npm run marketing:schedule

# Check status
npm run marketing:status
\`\`\`

---

*Auto-generated by content-calendar.ts*
`;

  return md;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('🗓️  Generating Ferni Content Calendar...\n');
  
  // Generate schedules
  const blogs = generateBlogSchedule();
  const social = generateSocialSchedule(blogs);
  const schedule = generateWeeklySchedule(blogs, social);
  
  const calendar: ContentCalendar = {
    generatedAt: new Date().toISOString(),
    series: {
      name: SERIES_CONFIG.name,
      description: 'The authentic story of building an AI life coaching platform with AI as a development partner.',
      startDate: SERIES_CONFIG.startDate,
      cadence: `Every ${SERIES_CONFIG.cadenceWeeks} weeks`,
    },
    blogs,
    social,
    schedule,
  };
  
  // Create output directories
  const configDir = path.join(__dirname, '../config');
  const contentDir = path.join(__dirname, '../content/social');
  
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(path.join(contentDir, 'linkedin'), { recursive: true });
  fs.mkdirSync(path.join(contentDir, 'twitter'), { recursive: true });
  fs.mkdirSync(path.join(contentDir, 'instagram'), { recursive: true });
  
  // Write JSON schedule
  const jsonPath = path.join(configDir, 'schedule.json');
  fs.writeFileSync(jsonPath, JSON.stringify(calendar, null, 2));
  console.log(`✅ JSON schedule: ${jsonPath}`);
  
  // Write Markdown calendar
  const mdPath = path.join(configDir, 'CALENDAR.md');
  fs.writeFileSync(mdPath, generateMarkdownCalendar(calendar));
  console.log(`✅ Markdown calendar: ${mdPath}`);
  
  // Summary
  console.log('\n📊 Summary:');
  console.log(`   • ${blogs.length} blog posts`);
  console.log(`   • ${social.length} social media posts`);
  console.log(`   • Runs from ${blogs[0].publishDate} to ${blogs[blogs.length - 1].publishDate}`);
  
  console.log('\n📅 First week tasks:');
  for (const task of schedule[0].tasks) {
    console.log(`   • ${task.day}: ${task.platform} - ${task.action}`);
  }
  
  console.log('\n🎯 Next steps:');
  console.log('   1. Review and edit blog posts in apps/marketing/copy/blog-posts/');
  console.log('   2. Run `npm run marketing:generate-social` to create social content');
  console.log('   3. Run `npm run marketing:schedule` to queue posts in Buffer');
  console.log('');
}

main().catch(console.error);

