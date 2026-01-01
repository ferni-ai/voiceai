#!/usr/bin/env node
/**
 * LinkedIn Publisher - E2E Publishing Workflow
 *
 * Publishes content to Ferni's LinkedIn company page.
 * Designed to be called by Alex or scheduled via cron.
 *
 * SETUP:
 * 1. Create LinkedIn App at https://www.linkedin.com/developers/
 * 2. Add 'w_organization_social' scope for company page posting
 * 3. Get your Company Page ID from linkedin.com/company/ferni-ai (view page source or admin panel)
 * 4. Set environment variables (see .env.example)
 *
 * Usage:
 *   node linkedin-publisher.js --post-wisdom --week=1 --day=1
 *   node linkedin-publisher.js --post-custom --content="Your post content"
 *   node linkedin-publisher.js --schedule-week=1
 *   node linkedin-publisher.js --status
 */

const fs = require('fs');
const path = require('path');

// Load environment variables (check .env.linkedin first, then .env)
require('dotenv').config({ path: path.join(__dirname, '..', '.env.linkedin') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // LinkedIn API
  baseUrl: 'https://api.linkedin.com/v2',
  accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
  organizationId: process.env.LINKEDIN_ORGANIZATION_ID,

  // Content paths
  contentCalendarPath: path.join(__dirname, '..', 'docs', 'content', 'LINKEDIN-PUBLISHING-CALENDAR.md'),
  socialCardsPath: path.join(__dirname, '..', 'images', 'generated', 'social-cards'),

  // Posting schedule (in ET timezone)
  schedule: {
    tuesday: { time: '08:30', type: 'thought-leadership' },
    wednesday: { time: '09:00', type: 'zen-wisdom' },
    thursday: { time: '08:30', type: 'engagement' },
    friday: { time: '10:00', type: 'build-in-public' },
  },
};

// ============================================================================
// ZEN WISDOM CONTENT (from card generator)
// ============================================================================

const ZEN_WISDOM_CONTENT = [
  // Week 1
  { kanji: '金継ぎ', romaji: 'Kintsugi', english: 'Golden repair', wisdom: 'Your wounds don\'t diminish you. They\'re where the light gets in.', hashtags: '#Kintsugi #JapaneseWisdom #Growth #Leadership #Resilience' },
  { kanji: '一期一会', romaji: 'Ichi-go Ichi-e', english: 'One time, one meeting', wisdom: 'This moment will never come again. Give it your full attention.', hashtags: '#Mindfulness #Presence #Leadership #JapaneseWisdom' },
  { kanji: '間', romaji: 'Ma', english: 'Negative space', wisdom: 'What you leave out matters as much as what you include.', hashtags: '#Ma #Design #Simplicity #JapaneseAesthetics' },
  { kanji: '侘寂', romaji: 'Wabi-sabi', english: 'Beauty in imperfection', wisdom: 'The crack in the bowl is not a flaw. It is the bowl\'s story.', hashtags: '#WabiSabi #Authenticity #Leadership #Growth' },

  // Week 2
  { kanji: '森林浴', romaji: 'Shinrin-yoku', english: 'Forest bathing', wisdom: 'Sometimes the best therapy is unplugging and walking among trees.', hashtags: '#Shinrinyoku #Wellness #Nature #MentalHealth' },
  { kanji: '改善', romaji: 'Kaizen', english: 'Continuous improvement', wisdom: 'A journey of a thousand miles begins with a single step.', hashtags: '#Kaizen #ContinuousImprovement #Growth #Leadership' },
  { kanji: '木漏れ日', romaji: 'Komorebi', english: 'Sunlight through leaves', wisdom: 'Some beauty can\'t be manufactured. Only witnessed.', hashtags: '#Komorebi #Nature #Mindfulness #Beauty' },
  { kanji: '花鳥風月', romaji: 'Kachō Fūgetsu', english: 'Flowers, birds, wind, moon', wisdom: 'Find beauty in nature\'s simple gifts before seeking it elsewhere.', hashtags: '#Nature #Simplicity #JapaneseWisdom #Mindfulness' },

  // Week 3
  { kanji: '物の哀れ', romaji: 'Mono no Aware', english: 'The pathos of things', wisdom: 'The beauty of cherry blossoms is inseparable from the fact that they fall.', hashtags: '#MonoNoAware #Impermanence #Philosophy #JapaneseWisdom' },
  { kanji: '生きがい', romaji: 'Ikigai', english: 'Reason for being', wisdom: 'What you love × What you\'re good at × What the world needs × What you can be paid for.', hashtags: '#Ikigai #Purpose #CareerAdvice #Leadership' },
  { kanji: '結び', romaji: 'Musubi', english: 'Connection', wisdom: 'You are not as alone as you feel. The threads of connection extend beyond what you can see.', hashtags: '#Connection #Community #Leadership #Musubi' },
  { kanji: '慈悲', romaji: 'Jihi', english: 'Compassion', wisdom: 'True friendship is not possession. It is presence.', hashtags: '#Compassion #Leadership #Mindfulness #JapaneseWisdom' },

  // Week 4
  { kanji: '無心', romaji: 'Mushin', english: 'No-mind', wisdom: 'The expert acts without thinking. That\'s not the absence of thought—it\'s its transcendence.', hashtags: '#Mushin #Flow #Mastery #Leadership' },
];

// ============================================================================
// LINKEDIN API CLIENT
// ============================================================================

class LinkedInPublisher {
  constructor() {
    this.baseUrl = CONFIG.baseUrl;
    this.accessToken = CONFIG.accessToken;
    this.organizationId = CONFIG.organizationId;
    this.personId = null; // Will be fetched for personal profile posting
  }

  isConfigured() {
    return !!this.accessToken;
  }

  canPostToCompanyPage() {
    return !!(this.accessToken && this.organizationId);
  }

  getStatus() {
    return {
      configured: this.isConfigured(),
      hasAccessToken: !!this.accessToken,
      hasOrganizationId: !!this.organizationId,
      organizationId: this.organizationId || 'NOT SET',
      mode: this.organizationId ? 'company-page' : 'personal-profile',
    };
  }

  async getPersonId() {
    if (this.personId) return this.personId;

    const response = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get user info. Token may be invalid.');
    }

    const data = await response.json();
    this.personId = data.sub; // OpenID Connect subject (person ID)
    return this.personId;
  }

  async post({ content, visibility = 'PUBLIC', usePersonalProfile = false }) {
    if (!this.isConfigured()) {
      throw new Error('LinkedIn not configured. Set LINKEDIN_ACCESS_TOKEN.');
    }

    let author;
    let targetDescription;

    // Determine author based on mode
    if (usePersonalProfile || !this.organizationId) {
      const personId = await this.getPersonId();
      author = `urn:li:person:${personId}`;
      targetDescription = 'personal profile';
      console.log('📤 Posting to LinkedIn personal profile...');
      console.log(`   Person ID: ${personId}`);
    } else {
      author = `urn:li:organization:${this.organizationId}`;
      targetDescription = 'company page';
      console.log('📤 Posting to LinkedIn company page...');
      console.log(`   Organization: ${this.organizationId}`);
    }

    const payload = {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: content,
          },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': visibility,
      },
    };
    console.log(`   Content length: ${content.length} characters`);

    const response = await fetch(`${this.baseUrl}/ugcPosts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ LinkedIn API error:', response.status, errorText);

      if (response.status === 401 || response.status === 403) {
        throw new Error('LinkedIn authentication expired. Please refresh your access token.');
      }

      if (response.status === 429) {
        throw new Error('Rate limited by LinkedIn. Try again later.');
      }

      throw new Error(`LinkedIn API error: ${errorText}`);
    }

    const postId = response.headers.get('x-restli-id') || 'unknown';
    const activityUrn = postId.replace('urn:li:share:', '');
    const url = `https://www.linkedin.com/feed/update/${activityUrn}`;

    console.log('✅ Post published!');
    console.log(`   Post ID: ${postId}`);
    console.log(`   URL: ${url}`);

    return { success: true, postId, url };
  }
}

// ============================================================================
// CONTENT GENERATION
// ============================================================================

/**
 * Generate post content for Daily Wisdom
 */
function generateWisdomPost(weekNum, dayNum) {
  const index = (weekNum - 1) * 4 + (dayNum - 1);
  const wisdom = ZEN_WISDOM_CONTENT[index];

  if (!wisdom) {
    throw new Error(`No wisdom content for week ${weekNum}, day ${dayNum}`);
  }

  return `${wisdom.kanji} (${wisdom.romaji}) — "${wisdom.english}"

${wisdom.wisdom}

What's a concept that shifted your perspective this week?

${wisdom.hashtags}`;
}

/**
 * Generate card filename for a post
 */
function getCardFilename(weekNum, dayNum) {
  const index = (weekNum - 1) * 4 + (dayNum - 1);
  const wisdom = ZEN_WISDOM_CONTENT[index];

  if (!wisdom) return null;

  return `week${weekNum}-day${dayNum}-${wisdom.romaji.toLowerCase().replace(/\s+/g, '-')}.svg`;
}

// ============================================================================
// CLI
// ============================================================================

function printUsage() {
  console.log(`
LinkedIn Publisher for Ferni
============================

Publish content to Ferni's LinkedIn company page.

Environment Variables Required:
  LINKEDIN_ACCESS_TOKEN      OAuth 2.0 access token
  LINKEDIN_ORGANIZATION_ID   Company page ID (from admin panel)

Usage:
  node linkedin-publisher.js [options]

Options:
  --status                   Check configuration status
  --post-wisdom              Post Daily Wisdom content
    --week=N                 Week number (1-13)
    --day=N                  Day number (1-4)
  --post-custom              Post custom content
    --content="Your text"    The content to post
  --dry-run                  Preview without posting

Examples:
  # Check if LinkedIn is configured
  node linkedin-publisher.js --status

  # Post Week 1, Day 1 wisdom (Kintsugi)
  node linkedin-publisher.js --post-wisdom --week=1 --day=1

  # Preview without posting
  node linkedin-publisher.js --post-wisdom --week=1 --day=1 --dry-run

  # Post custom content
  node linkedin-publisher.js --post-custom --content="Building in public update..."
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    printUsage();
    return;
  }

  const getArg = (name) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=').slice(1).join('=') : null;
  };

  const publisher = new LinkedInPublisher();
  const dryRun = args.includes('--dry-run');
  const usePersonal = args.includes('--personal') || !publisher.canPostToCompanyPage();

  // Status check
  if (args.includes('--status')) {
    const status = publisher.getStatus();
    console.log('\n📊 LinkedIn Configuration Status:\n');
    console.log(`   Configured: ${status.configured ? '✅ Yes' : '❌ No'}`);
    console.log(`   Access Token: ${status.hasAccessToken ? '✅ Set' : '❌ Missing'}`);
    console.log(`   Organization ID: ${status.hasOrganizationId ? '✅ ' + status.organizationId : '⚠️  Not set (personal profile mode)'}`);
    console.log(`   Posting Mode: ${status.hasOrganizationId ? '🏢 Company Page' : '👤 Personal Profile'}`);

    if (!status.configured) {
      console.log('\n📝 To configure, set these environment variables:');
      console.log('   export LINKEDIN_ACCESS_TOKEN="your-token"');
      console.log('   export LINKEDIN_ORGANIZATION_ID="your-company-id"  # Optional for company page');
    } else if (!status.hasOrganizationId) {
      console.log('\n💡 Posts will go to your personal profile.');
      console.log('   For company page posting, need Community Management API approval.');
    }
    return;
  }

  // Post Daily Wisdom
  if (args.includes('--post-wisdom')) {
    const week = parseInt(getArg('week') || '1', 10);
    const day = parseInt(getArg('day') || '1', 10);

    console.log(`\n📿 Daily Wisdom: Week ${week}, Day ${day}\n`);

    const content = generateWisdomPost(week, day);
    const cardFile = getCardFilename(week, day);

    console.log('Content:');
    console.log('─'.repeat(50));
    console.log(content);
    console.log('─'.repeat(50));

    if (cardFile) {
      const cardPath = path.join(CONFIG.socialCardsPath, cardFile);
      if (fs.existsSync(cardPath)) {
        console.log(`\n🖼️  Card: ${cardFile} ✅`);
      } else {
        console.log(`\n🖼️  Card: ${cardFile} ❌ (run linkedin-card-generator.js first)`);
      }
    }

    if (dryRun) {
      console.log('\n🔍 Dry run - not posting');
      return;
    }

    try {
      const result = await publisher.post({ content, usePersonalProfile: usePersonal });
      console.log('\n🎉 Successfully posted to LinkedIn!');
      console.log(`   View at: ${result.url}`);
    } catch (error) {
      console.error('\n❌ Failed to post:', error.message);
      process.exit(1);
    }
    return;
  }

  // Post custom content
  if (args.includes('--post-custom')) {
    const content = getArg('content');

    if (!content) {
      console.error('❌ Please provide --content="Your post content"');
      return;
    }

    console.log('\n📝 Custom Post\n');
    console.log('Content:');
    console.log('─'.repeat(50));
    console.log(content);
    console.log('─'.repeat(50));

    if (dryRun) {
      console.log('\n🔍 Dry run - not posting');
      return;
    }

    try {
      const result = await publisher.post({ content, usePersonalProfile: usePersonal });
      console.log('\n🎉 Successfully posted to LinkedIn!');
      console.log(`   View at: ${result.url}`);
    } catch (error) {
      console.error('\n❌ Failed to post:', error.message);
      process.exit(1);
    }
    return;
  }

  printUsage();
}

// Export for programmatic use
module.exports = {
  LinkedInPublisher,
  generateWisdomPost,
  ZEN_WISDOM_CONTENT,
  CONFIG,
};

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
