#!/usr/bin/env npx tsx
/**
 * Deploy Financial Legends Page to Production
 *
 * Generates and deploys the Financial Legends multi-advisor landing page
 * featuring Tom Brannigan, Henry Caldwell and Nate Holloway (fictional characters
 * inspired by investing philosophies; ids peter-lynch, john-bogle, joel-dickson).
 *
 * Usage:
 *   npx tsx scripts/deploy-financial-legends.ts              # Generate and deploy
 *   npx tsx scripts/deploy-financial-legends.ts --dry-run    # Preview only
 *   npx tsx scripts/deploy-financial-legends.ts --local      # Save to local file
 *
 * @module scripts/deploy-financial-legends
 */

import { generateMultiAdvisorPage, type MultiAdvisorPageConfig } from '../src/services/page-generator/index.js';
import { getAdminFirestore } from '../src/utils/firebase-admin-app.js';
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
  description: 'Three fictional mentors, each inspired by a great investing philosophy, ready to guide your financial journey.',

  advisors: [
    {
      id: 'peter-lynch',
      name: 'Tom Brannigan',
      initials: 'TB',
      tagline: 'The Stock Picker',
      description: 'Inspired by invest-in-what-you-know stock picking. Finds great companies by paying attention to what people actually buy.',
      color: '#1a5f2a', // Growth green
      icon: '📈',
      voiceId: '4cf80313-54dc-4ca9-a17c-3e5b8f68a78c', // Cartesia stock voice "Hugh - Confident Veteran"
    },
    {
      id: 'john-bogle',
      name: 'Henry Caldwell',
      initials: 'HC',
      tagline: 'The Index Investor',
      description: 'Inspired by index investing. Champion of low-cost, long-term investing for everyday investors.',
      color: '#8b0000', // Deep red
      icon: '🏛️',
      voiceId: 'ed82c17b-4704-4d34-be43-5d19065acdf1', // Cartesia stock voice "Carl - Steady Storyteller"
    },
    {
      id: 'joel-dickson',
      name: 'Nate Holloway',
      initials: 'NH',
      tagline: 'The Life Mentor',
      description: 'Inspired by evidence-based planning and behavioral coaching. Helps navigate life decisions, career changes, and finding purpose.',
      color: '#96151D', // Burgundy
      icon: '🧭',
      voiceId: 'bbee10a8-4f08-4c5c-8282-e69299115055', // Cartesia stock voice "Ben - Helpful Man"
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
    title: 'Financial Legends - Investment Wisdom, Three Philosophies',
    description: 'Get personalized guidance from Tom, Henry and Nate: fictional mentors inspired by stock picking, index investing and behavioral coaching.',
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
      const db = getAdminFirestore();

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
        kind: 'generated',
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
  console.log('   "I want to pick stocks"       → Tom Brannigan');
  console.log('   "Tell me about index funds"   → Henry Caldwell');
  console.log('   "I\'m thinking about my career" → Nate Holloway');

  console.log('\n');
  return { siteId, url, deployed, html: result.html };
}

// Run deployment
deploy().catch((error) => {
  console.error('\n❌ Deployment failed:', error);
  process.exit(1);
});
