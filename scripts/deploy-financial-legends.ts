#!/usr/bin/env npx tsx
/**
 * Deploy Financial Legends Page to Production
 *
 * Generates and deploys the Financial Legends multi-advisor landing page
 * featuring Henry Caldwell and Nate Holloway (fictional characters inspired by
 * investing philosophies; ids john-bogle, joel-dickson).
 *
 * Usage:
 *   npx tsx scripts/deploy-financial-legends.ts              # Generate and deploy
 *   npx tsx scripts/deploy-financial-legends.ts --dry-run    # Preview only
 *   npx tsx scripts/deploy-financial-legends.ts --local      # Save to local file
 *
 * @module scripts/deploy-financial-legends
 */

import { generateMultiAdvisorPage } from '../src/services/page-generator/index.js';
import { FINANCIAL_LEGENDS_PAGE as config } from './financial-legends-page.js';
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
