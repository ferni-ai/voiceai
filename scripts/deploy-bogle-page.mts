#!/usr/bin/env npx tsx
/**
 * Deploy John Bogle Page to Production
 *
 * Generates and deploys the John Bogle landing page
 * to ferni.ai/sites/meet-bogle
 *
 * Usage:
 *   npx tsx scripts/deploy-bogle-page.mts              # Generate and deploy
 *   npx tsx scripts/deploy-bogle-page.mts --dry-run    # Preview only
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

// John Bogle configuration
const bogleConfig: AgentPageConfig = {
  agent: {
    id: 'john-bogle',
    name: 'John Bogle',
    displayName: 'Jack',
    initials: 'JB',
    tagline: 'Founder of Vanguard & Creator of the Index Fund',
    description: 'Meet John "Jack" Bogle - founder of Vanguard and creator of the first index fund. Ask Jack about investing, staying the course, and building long-term wealth.',
    quote: {
      text: "Time is your friend; impulse is your enemy.",
      context: 'A principle Jack lived by across six decades of helping ordinary investors build wealth',
    },
    credentials: [
      { label: 'Founded', value: 'Vanguard' },
      { label: 'Education', value: 'Princeton' },
      { label: 'Legacy', value: 'Index Funds' },
    ],
    conversationStarters: [
      'Why do you believe index funds beat most active managers?',
      'How do I stay the course when markets are falling?',
      'What should a simple investment portfolio look like?',
      "What's the most important lesson you learned at Vanguard?",
    ],
    ctaHeadline: 'Have a real conversation',
    ctaDescription: 'Jack brings six decades of investing wisdom, a Princeton education, and a genuine belief that ordinary people deserve a fair shake in the markets.',
  },
  brand: {
    primary: '#8b0000', // Vanguard Red (darker, more classic)
    secondary: '#a31515',
    fonts: {
      display: {
        family: 'Mark Pro',
        urls: [
          { url: 'https://constellation-static.web.vanguard.com/v1/fonts/dc1646ea-4041-4648-9540-0bd7cbd10dc1.woff2', weight: 400 },
          { url: 'https://constellation-static.web.vanguard.com/v1/fonts/30274a56-042d-447a-aff9-6da0dae01586.woff2', weight: 500 },
          { url: 'https://constellation-static.web.vanguard.com/v1/fonts/31b07b3f-1c2f-4320-90e5-bc52e0ed0b65.woff2', weight: 700 },
        ],
        fallback: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      },
    },
  },
  voice: {
    voiceId: '9c10dc48-8799-42f9-a72a-0c7dfe13a06d', // John Bogle's Cartesia voice ID
    provider: 'cartesia',
  },
  theme: 'zen',
  deployment: {
    environment: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  },
  seo: {
    title: 'Meet John Bogle — Vanguard AI Advisor',
    description: 'Meet John "Jack" Bogle - founder of Vanguard and creator of the first index fund. Get investing wisdom from the pioneer of low-cost investing.',
    twitterCard: 'summary_large_image',
  },
  footer: {
    disclaimer: 'Jack is an AI advisor powered by Ferni. This is a technology demonstration and does not constitute financial advice.',
  },
};

async function deploy() {
  console.log('🚀 Deploying John Bogle Page\n');
  console.log('='.repeat(60));

  // Generate page
  console.log('\n📝 Generating page...');
  const result = await generateAgentPage(bogleConfig);
  console.log(`   Size: ${Math.round(result.size / 1024)} KB`);

  // Verify no localhost in production build
  if (result.html.includes('localhost') && !isDryRun) {
    console.error('ERROR: Generated HTML contains localhost references!');
    const match = result.html.match(/localhost[^'"]+/g);
    console.log('Found:', match);
    process.exit(1);
  }

  const siteId = 'meet-bogle';
  const url = `https://ferni.ai/sites/${siteId}`;

  // Deploy to Firestore
  let deployed = false;
  if (!isDryRun) {
    try {
      const db = getFirestore();

      const siteData = {
        userId: 'system',
        agentId: 'john-bogle',
        agentName: 'John Bogle',
        url,
        subdomain: siteId,
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
  writeFileSync(join(distPath, 'meet-bogle.html'), result.html);
  console.log(`📄 Saved to: dist/sites/meet-bogle.html`);

  console.log('\n' + '='.repeat(60));
  console.log('\n📋 Deployment Summary:');
  console.log(`   Site ID:  ${siteId}`);
  console.log(`   URL:      ${url}`);
  console.log(`   Status:   ${deployed ? '✅ Live' : '⏳ Dry-run (saved locally)'}`);

  if (!deployed) {
    console.log('\n💡 To deploy for real:');
    console.log('   1. Ensure GOOGLE_CLOUD_PROJECT is set (or defaults to johnb-2025)');
    console.log('   2. Run: npx tsx scripts/deploy-bogle-page.mts');
  }

  return { siteId, url, deployed };
}

deploy().catch(console.error);
