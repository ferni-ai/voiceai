#!/usr/bin/env npx tsx
/**
 * Deploy Henry Caldwell Page to Production
 *
 * Generates and deploys the landing page for Henry Caldwell (persona id
 * 'john-bogle'), a fictional index-investing mentor, to ferni.ai/sites/meet-henry
 *
 * Usage:
 *   npx tsx scripts/deploy-henry-page.mts              # Generate and deploy
 *   npx tsx scripts/deploy-henry-page.mts --dry-run    # Preview only
 */

import { generateAgentPage, type AgentPageConfig } from '../src/services/page-generator/index.js';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';

// Parse CLI arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

// Initialize Firebase Admin if not already done
if (getApps().length === 0 && !isDryRun) {
  try {
    initializeApp({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025',
    });
  } catch (e) {
    console.log('⚠️  Firebase Admin SDK not initialized - using dry-run mode');
  }
}

// Henry Caldwell configuration (fictional character; persona id stays 'john-bogle')
const henryConfig: AgentPageConfig = {
  agent: {
    id: 'john-bogle',
    name: 'Henry Caldwell',
    displayName: 'Henry',
    initials: 'HC',
    tagline: 'An index-investing elder who puts investors first',
    description:
      "Meet Henry Caldwell - a retired economics teacher who spent 35 years running a teachers' retirement fund and moved it into low-cost index funds. Ask Henry about investing, staying the course, and building long-term wealth.",
    quote: {
      text: 'Patience is your ally. Impulse is the expensive friend you should stop calling.',
      context:
        "A principle Henry lived by across decades of protecting teachers' retirement savings",
    },
    credentials: [
      { label: 'Taught', value: 'Economics' },
      { label: 'Ran', value: "A Teachers' Pension" },
      { label: 'Believes In', value: 'Index Funds' },
    ],
    conversationStarters: [
      'Why do you believe index funds beat most active managers?',
      'How do I stay the course when markets are falling?',
      'What should a simple investment portfolio look like?',
      "What's the most important lesson you learned running the teachers' fund?",
    ],
    ctaHeadline: 'Have a real conversation',
    ctaDescription:
      "Henry brings fifty years of investing wisdom, a schoolteacher's patience, and a genuine belief that ordinary people deserve a fair shake in the markets.",
  },
  brand: {
    primary: '#8b0000', // Persona avatar color (persona.manifest.json)
    secondary: '#a31515',
  },
  voice: {
    voiceId: 'ed82c17b-4704-4d34-be43-5d19065acdf1', // Cartesia stock voice "Carl - Steady Storyteller"
    provider: 'cartesia',
  },
  theme: 'zen',
  deployment: {
    environment: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  },
  seo: {
    title: 'Meet Henry Caldwell — Index Investing AI Mentor',
    description:
      "Meet Henry Caldwell - a fictional index-investing mentor who spent decades guarding teachers' retirement money. Get patient, low-cost investing wisdom.",
    twitterCard: 'summary_large_image',
  },
  footer: {
    disclaimer:
      'Henry is a fictional AI character powered by Ferni. This is a technology demonstration and does not constitute financial advice.',
  },
};

async function deploy() {
  console.log('🚀 Deploying Henry Caldwell Page\n');
  console.log('='.repeat(60));

  // Generate page
  console.log('\n📝 Generating page...');
  const result = await generateAgentPage(henryConfig);
  console.log(`   Size: ${Math.round(result.size / 1024)} KB`);

  // Verify no localhost in production build
  if (result.html.includes('localhost') && !isDryRun) {
    console.error('ERROR: Generated HTML contains localhost references!');
    const match = result.html.match(/localhost[^'"]+/g);
    console.log('Found:', match);
    process.exit(1);
  }

  const siteId = 'meet-henry';
  const url = `https://ferni.ai/sites/${siteId}`;

  // Deploy to Firestore
  let deployed = false;
  if (!isDryRun) {
    try {
      const db = getFirestore();

      const siteData = {
        userId: 'system',
        agentId: 'john-bogle',
        agentName: 'Henry Caldwell',
        url,
        subdomain: siteId,
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

      // Write both the subdomain doc and a direct-ID doc for resolution
      await db.collection('deployed-sites').doc(siteId).set(siteData);
      deployed = true;
      console.log('\n✅ Deployed to Firestore!');
    } catch (e) {
      console.log('\n⚠️  Could not deploy to Firestore (running in dry-run mode)');
      console.log(`   Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Save locally
  const { writeFileSync, mkdirSync } = await import('fs');
  const localPath = `/tmp/${siteId}.html`;
  writeFileSync(localPath, result.html);
  console.log(`\n📄 Saved locally: ${localPath}`);

  // Also save to dist/sites for inspection
  const { join } = await import('path');
  const distPath = join(process.cwd(), 'dist', 'sites');
  mkdirSync(distPath, { recursive: true });
  writeFileSync(join(distPath, `${siteId}.html`), result.html);
  console.log(`📄 Saved to: dist/sites/${siteId}.html`);

  console.log('\n' + '='.repeat(60));
  console.log('\n📋 Deployment Summary:');
  console.log(`   Site ID:  ${siteId}`);
  console.log(`   URL:      ${url}`);
  console.log(`   Status:   ${deployed ? '✅ Live' : '⏳ Dry-run (saved locally)'}`);

  if (!deployed) {
    console.log('\n💡 To deploy for real:');
    console.log('   1. Ensure GOOGLE_CLOUD_PROJECT is set (or defaults to johnb-2025)');
    console.log('   2. Run: npx tsx scripts/deploy-henry-page.mts');
  }

  return { siteId, url, deployed };
}

deploy().catch(console.error);
