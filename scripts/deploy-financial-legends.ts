#!/usr/bin/env npx tsx
/**
 * Deploy Financial Legends Page to Production
 *
 * Generates and deploys the Financial Legends multi-advisor landing page
 * featuring Peter Lynch, John Bogle, and Joel Dickson.
 *
 * Usage:
 *   npx tsx scripts/deploy-financial-legends.ts              # Generate and deploy
 *   npx tsx scripts/deploy-financial-legends.ts --dry-run    # Preview only
 *   npx tsx scripts/deploy-financial-legends.ts --local      # Save to local file
 *
 * @module scripts/deploy-financial-legends
 */

import { generateMultiAdvisorPage, type MultiAdvisorPageConfig } from '../src/services/page-generator/index.js';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// Parse CLI arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isLocal = args.includes('--local');

// Initialize Firebase Admin if not already done
if (getApps().length === 0 && !isDryRun) {
  try {
    initializeApp({
      projectId: 'ferni-ai',
    });
  } catch {
    console.log('Firebase Admin SDK not initialized - using dry-run mode');
  }
}

// =============================================================================
// FINANCIAL LEGENDS CONFIGURATION
// =============================================================================

const config: MultiAdvisorPageConfig = {
  title: 'Financial Legends',
  description: 'Get wisdom from the greatest minds in investing. Three legendary voices ready to guide your financial journey.',

  advisors: [
    {
      id: 'peter-lynch',
      name: 'Peter Lynch',
      initials: 'PL',
      tagline: 'The Stock Picker',
      description: 'Master of finding great companies before Wall Street catches on. Former Fidelity Magellan Fund manager who achieved 29.2% annual returns.',
      color: '#1a5f2a', // Growth green
      icon: '📈',
      voiceId: '85680374-8d94-43a1-bb15-5eea7a8bdbb8',
    },
    {
      id: 'john-bogle',
      name: 'John Bogle',
      initials: 'JB',
      tagline: 'The Index Pioneer',
      description: 'Founder of Vanguard and creator of the first index fund. Champion of low-cost, long-term investing for everyday investors.',
      color: '#8b0000', // Vanguard red
      icon: '🏛️',
      voiceId: '9c10dc48-8799-42f9-a72a-0c7dfe13a06d',
    },
    {
      id: 'joel-dickson',
      name: 'Joel Dickson',
      initials: 'JD',
      tagline: 'The Life Mentor',
      description: 'Wise mentor with a Stanford doctorate and 30 years at Vanguard. Helps navigate life decisions, career changes, and finding purpose.',
      color: '#96151D', // Vanguard burgundy
      icon: '🧭',
      voiceId: '3ebcd114-d280-4eed-a238-b9323a6b8e52', // Joel's existing Cartesia voice
    },
  ],

  brand: {
    primary: '#1a365d', // Deep financial blue
    secondary: '#2c5282',
  },

  theme: 'zen',

  deployment: {
    environment: 'production',
  },

  seo: {
    title: 'Financial Legends - Investment Wisdom from the Masters',
    description: 'Get personalized guidance from Peter Lynch, John Bogle, and Joel Dickson. Three legendary voices ready to help with your investment journey.',
    twitterCard: 'summary_large_image',
  },
};

// =============================================================================
// DEPLOYMENT
// =============================================================================

async function deploy() {
  console.log('\n🏆 Financial Legends Page Generator\n');
  console.log('='.repeat(60));

  if (isDryRun) {
    console.log('📋 Running in DRY-RUN mode (no deployment)\n');
  }

  // Display configuration
  console.log('\n📊 Configuration:');
  console.log(`   Title:     ${config.title}`);
  console.log(`   Advisors:  ${config.advisors.map(a => a.name).join(', ')}`);
  console.log(`   Theme:     ${config.theme}`);

  // Generate page
  console.log('\n📝 Generating page...');
  const result = await generateMultiAdvisorPage(config);
  console.log(`   Size:      ${Math.round(result.size / 1024)} KB`);
  console.log(`   Generated: ${result.generatedAt.toISOString()}`);

  // Save locally if requested or in dry-run
  if (isLocal || isDryRun) {
    const outputDir = join(process.cwd(), 'dist', 'sites');
    mkdirSync(outputDir, { recursive: true });

    const localPath = join(outputDir, 'financial-legends.html');
    writeFileSync(localPath, result.html);
    console.log(`\n📄 Saved locally: ${localPath}`);
  }

  // Deploy to Firestore
  let deployed = false;
  let siteId = '';
  let url = '';

  if (!isDryRun && !isLocal) {
    try {
      const db = getFirestore();

      siteId = `financial-legends-${Date.now()}`;
      url = `https://ferni.ai/sites/${siteId}`;

      const siteData = {
        userId: 'system',
        agentId: 'financial-legends',
        agentName: 'Financial Legends',
        type: 'multi-advisor',
        advisors: config.advisors.map(a => a.id),
        url,
        tier: 'premium',
        status: 'active',
        files: {
          'index.html': result.html,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        analytics: {
          views: 0,
          conversations: 0,
        },
      };

      await db.collection('deployed-sites').doc(siteId).set(siteData);
      deployed = true;
      console.log('\n Deployed to Firestore!');
    } catch (error) {
      console.log('\n Could not deploy to Firestore (Firebase not configured)');
      console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📋 Summary:');

  if (isDryRun) {
    console.log('   Mode:      Dry-run (preview only)');
    console.log(`   Output:    dist/sites/financial-legends.html`);
    console.log('\n   To deploy for real, run without --dry-run flag');
  } else if (deployed) {
    console.log('   Mode:      Production');
    console.log(`   Site ID:   ${siteId}`);
    console.log(`   URL:       ${url}`);
    console.log('   Status:    Live');
  } else {
    console.log('   Mode:      Local');
    console.log('   Output:    dist/sites/financial-legends.html');
    console.log('\n💡 To deploy to production:');
    console.log('   1. Ensure Firebase Admin credentials are configured');
    console.log('   2. Run: npx tsx scripts/deploy-financial-legends.ts');
  }

  // Advisor details
  console.log('\n📈 Advisors:');
  for (const advisor of config.advisors) {
    console.log(`   ${advisor.icon || '•'} ${advisor.name} (${advisor.tagline})`);
    console.log(`      ID:    ${advisor.id}`);
    console.log(`      Color: ${advisor.color}`);
  }

  // Handoff info
  console.log('\n🔄 Handoff Triggers:');
  console.log('   "I want to pick stocks"       → Peter Lynch');
  console.log('   "Tell me about index funds"   → John Bogle');
  console.log('   "I\'m thinking about my career" → Joel Dickson');

  console.log('\n');
  return { siteId, url, deployed, html: result.html };
}

// Run deployment
deploy().catch((error) => {
  console.error('\n❌ Deployment failed:', error);
  process.exit(1);
});
