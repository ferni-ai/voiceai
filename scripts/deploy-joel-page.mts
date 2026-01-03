#!/usr/bin/env npx tsx
/**
 * Deploy Joel Dickson Page to Production
 *
 * Generates and deploys the Joel Dickson landing page
 * to ferni.ai/sites/{siteId}
 */

import { generateAgentPage, type AgentPageConfig } from '../src/services/page-generator/index.js';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, cert, getApps } from 'firebase-admin/app';

// Initialize Firebase Admin if not already done
if (getApps().length === 0) {
  // Try to use default credentials
  try {
    initializeApp({
      projectId: 'ferni-ai',
    });
  } catch (e) {
    console.log('⚠️  Firebase Admin SDK not initialized - using dry-run mode');
  }
}

// Joel Dickson configuration
const joelConfig: AgentPageConfig = {
  agent: {
    id: 'joel-dickson',
    name: 'Joel Dickson',
    displayName: 'Joel',
    initials: 'JD',
    tagline: 'Global Head of Investment Strategy',
    description: 'Meet Joel Dickson - Global Head of Enterprise Advice Methodology at Vanguard. Ask Joel about investment strategy, retirement planning, and financial wisdom.',
  },
  brand: {
    primary: '#96151D', // Vanguard Red
    secondary: '#B41E28',
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
    voiceId: '3ebcd114-d280-4eed-a238-b9323a6b8e52', // Joel's Cartesia voice ID
    provider: 'cartesia',
  },
  theme: 'zen',
  deployment: {
    environment: 'production',
  },
  seo: {
    title: 'Meet Joel Dickson — Vanguard AI Advisor',
    description: 'Meet Joel Dickson - Global Head of Enterprise Advice Methodology at Vanguard',
    twitterCard: 'summary_large_image',
  },
};

async function deploy() {
  console.log('🚀 Deploying Joel Dickson Page\n');
  console.log('=' .repeat(60));

  // Generate page
  console.log('\n📝 Generating page...');
  const result = await generateAgentPage(joelConfig);
  console.log(`   Size: ${Math.round(result.size / 1024)} KB`);

  // Generate site ID
  const siteId = `meet-joel-${Date.now()}`;
  const url = `https://ferni.ai/sites/${siteId}`;

  // Check if we can deploy to Firestore
  let deployed = false;
  try {
    const db = getFirestore();

    const siteData = {
      userId: 'system',
      agentId: 'joel-dickson',
      agentName: 'Joel Dickson',
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
    console.log('\n✅ Deployed to Firestore!');
  } catch (e) {
    console.log('\n⚠️  Could not deploy to Firestore (running in dry-run mode)');
    console.log('   To deploy for real, run with Firebase credentials');
  }

  // Also save locally
  const { writeFileSync } = await import('fs');
  const localPath = `/tmp/${siteId}.html`;
  writeFileSync(localPath, result.html);
  console.log(`\n📄 Saved locally: ${localPath}`);

  console.log('\n' + '=' .repeat(60));
  console.log('\n📋 Deployment Summary:');
  console.log(`   Site ID:  ${siteId}`);
  console.log(`   URL:      ${url}`);
  console.log(`   Status:   ${deployed ? '✅ Live' : '⏳ Dry-run (saved locally)'}`);

  if (!deployed) {
    console.log('\n💡 To deploy for real:');
    console.log('   1. Start the UI server: PORT=3002 node ui-server.js');
    console.log('   2. Call the API:');
    console.log(`      curl -X POST http://localhost:3002/api/sites/generate-and-deploy \\`);
    console.log(`        -H "Content-Type: application/json" \\`);
    console.log(`        -d '{"config": ${JSON.stringify(joelConfig).substring(0, 50)}...}'`);
  }

  return { siteId, url, deployed };
}

deploy().catch(console.error);
