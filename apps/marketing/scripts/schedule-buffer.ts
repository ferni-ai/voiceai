#!/usr/bin/env npx ts-node
/**
 * Ferni Buffer Scheduler
 * 
 * Schedules generated social media content to Buffer for automatic posting.
 * 
 * Prerequisites:
 * 1. Buffer account at buffer.com
 * 2. Connected social media accounts (Twitter, LinkedIn)
 * 3. Access token from Buffer Settings → Manage Apps → Access Token
 * 
 * Environment Variables:
 *   BUFFER_ACCESS_TOKEN - Your Buffer access token
 * 
 * Usage:
 *   npm run marketing:schedule
 *   npm run marketing:schedule -- --dry-run
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const CONTENT_DIR = path.join(__dirname, '../content/social');
const SCHEDULE_FILE = path.join(__dirname, '../config/schedule.json');

const BUFFER_API_BASE = 'https://api.bufferapp.com/1';

// ============================================================================
// Types
// ============================================================================

interface BufferProfile {
  id: string;
  service: string;
  formatted_service: string;
}

interface BufferUpdate {
  text: string;
  profile_ids: string[];
  scheduled_at?: string;
  shorten?: boolean;
  media?: { link: string }[];
}

interface ScheduleEntry {
  id: string;
  blogId: number;
  platform: 'linkedin' | 'twitter' | 'instagram';
  scheduledTime: string;
  status: 'draft' | 'generated' | 'scheduled' | 'posted';
  contentFile: string;
}

interface Schedule {
  social: ScheduleEntry[];
}

// ============================================================================
// Buffer API Client
// ============================================================================

class BufferClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async getProfiles(): Promise<BufferProfile[]> {
    const response = await fetch(
      `${BUFFER_API_BASE}/profiles.json?access_token=${this.accessToken}`
    );
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Buffer API error: ${response.status} - ${text}`);
    }
    
    return response.json();
  }

  async createUpdate(update: BufferUpdate): Promise<{ success: boolean; updates: unknown[] }> {
    const params = new URLSearchParams({
      access_token: this.accessToken,
      text: update.text,
      profile_ids: update.profile_ids.join(','),
      shorten: String(update.shorten ?? true),
    });

    if (update.scheduled_at) {
      params.append('scheduled_at', update.scheduled_at);
    }

    const response = await fetch(`${BUFFER_API_BASE}/updates/create.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Buffer API error: ${response.status} - ${text}`);
    }

    return response.json();
  }
}

// ============================================================================
// Content Loading
// ============================================================================

function loadContent(platform: string, slug: string): string | null {
  const extension = platform === 'linkedin' ? 'md' : 'json';
  const filePath = path.join(CONTENT_DIR, platform, `${slug}.${extension}`);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  
  if (extension === 'json') {
    const parsed = JSON.parse(content);
    if (platform === 'twitter') {
      // Join thread into single text for Buffer (it will post as thread)
      return parsed.thread?.join('\n\n---\n\n') ?? parsed.join('\n\n---\n\n');
    }
    return parsed.caption ?? JSON.stringify(parsed);
  }
  
  return content;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('📅 Ferni Buffer Scheduler\n');
  console.log('=' .repeat(50));

  // Check for dry-run flag
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No posts will be scheduled\n');
  }

  // Check for Buffer token
  const accessToken = process.env.BUFFER_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('❌ Error: BUFFER_ACCESS_TOKEN environment variable not set');
    console.log('\n📋 Setup Instructions:');
    console.log('   1. Sign up at buffer.com');
    console.log('   2. Connect your social accounts');
    console.log('   3. Go to Settings → Manage Apps → Access Token');
    console.log('   4. Copy the token and set it:');
    console.log('      export BUFFER_ACCESS_TOKEN="your-token-here"');
    console.log('\n💡 Tip: For now, you can manually copy content to Buffer:');
    console.log('      cat apps/marketing/content/social/linkedin/*.md');
    process.exit(1);
  }

  const client = new BufferClient(accessToken);

  // Get Buffer profiles
  console.log('\n🔍 Fetching Buffer profiles...');
  let profiles: BufferProfile[];
  try {
    profiles = await client.getProfiles();
  } catch (error) {
    console.error('❌ Failed to fetch profiles:', error);
    console.log('\n💡 Make sure your access token is valid.');
    process.exit(1);
  }

  console.log(`   Found ${profiles.length} connected accounts:`);
  for (const profile of profiles) {
    console.log(`   • ${profile.formatted_service} (${profile.id})`);
  }

  // Map platforms to profile IDs
  const platformToProfile: Record<string, string> = {};
  for (const profile of profiles) {
    const service = profile.service.toLowerCase();
    if (service === 'twitter' || service === 'x') {
      platformToProfile.twitter = profile.id;
    } else if (service === 'linkedin') {
      platformToProfile.linkedin = profile.id;
    } else if (service === 'instagram') {
      platformToProfile.instagram = profile.id;
    }
  }

  // Load schedule
  if (!fs.existsSync(SCHEDULE_FILE)) {
    console.error('\n❌ Schedule file not found:', SCHEDULE_FILE);
    console.log('   Run `npm run marketing:calendar` first.');
    process.exit(1);
  }

  const schedule: Schedule = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf-8'));
  
  // Filter for posts ready to schedule
  const readyPosts = schedule.social.filter(
    post => post.status === 'draft' || post.status === 'generated'
  );

  console.log(`\n📝 Found ${readyPosts.length} posts ready to schedule`);

  if (readyPosts.length === 0) {
    console.log('\n✅ Nothing to schedule. All posts are up to date.');
    return;
  }

  // Schedule each post
  let scheduled = 0;
  let skipped = 0;
  let failed = 0;

  for (const post of readyPosts) {
    const profileId = platformToProfile[post.platform];
    
    if (!profileId) {
      console.log(`\n⚠️  Skipping ${post.id}: No ${post.platform} account connected`);
      skipped++;
      continue;
    }

    // Extract slug from content file path
    const slug = path.basename(post.contentFile).replace(/\.(md|json)$/, '');
    const content = loadContent(post.platform, slug);

    if (!content) {
      console.log(`\n⚠️  Skipping ${post.id}: Content file not found`);
      console.log(`   Expected: ${post.contentFile}`);
      console.log(`   Run 'npm run marketing:social' to generate content.`);
      skipped++;
      continue;
    }

    console.log(`\n📤 Scheduling: ${post.platform} - ${slug}`);
    console.log(`   Time: ${new Date(post.scheduledTime).toLocaleString()}`);
    console.log(`   Content preview: ${content.substring(0, 100)}...`);

    if (dryRun) {
      console.log('   [DRY RUN] Would schedule this post');
      scheduled++;
      continue;
    }

    try {
      // Convert ISO timestamp to Unix timestamp for Buffer
      const scheduledAt = Math.floor(new Date(post.scheduledTime).getTime() / 1000);
      
      await client.createUpdate({
        text: content,
        profile_ids: [profileId],
        scheduled_at: String(scheduledAt),
      });

      console.log('   ✅ Scheduled successfully');
      
      // Update status in schedule
      post.status = 'scheduled';
      scheduled++;

      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`   ❌ Failed:`, error);
      failed++;
    }
  }

  // Save updated schedule
  if (!dryRun && scheduled > 0) {
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(schedule, null, 2));
  }

  // Summary
  console.log('\n' + '=' .repeat(50));
  console.log('📊 Summary:');
  console.log(`   • Scheduled: ${scheduled}`);
  console.log(`   • Skipped: ${skipped}`);
  console.log(`   • Failed: ${failed}`);

  if (scheduled > 0) {
    console.log('\n✅ Posts are now queued in Buffer!');
    console.log('   View your queue at: https://publish.buffer.com/');
  }

  if (skipped > 0) {
    console.log('\n💡 To fix skipped posts:');
    console.log('   1. Generate content: npm run marketing:social');
    console.log('   2. Connect missing accounts at buffer.com');
    console.log('   3. Re-run: npm run marketing:schedule');
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

