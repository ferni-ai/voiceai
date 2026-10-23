#!/usr/bin/env npx tsx
/**
 * Deploy the Nate Holloway (joel-dickson) Page to Production
 *
 * Generates and deploys the Nate Holloway landing page
 * to ferni.ai/sites/{siteId}
 */

import { generateAgentPage, type AgentPageConfig } from '../src/services/page-generator/index.js';
import { getAdminFirestore } from '../src/utils/firebase-admin-app.js';
import { initializeApp, cert, getApps } from 'firebase-admin/app';

// Initialize Firebase Admin if not already done
if (getApps().length === 0) {
  try {
    initializeApp({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025',
    });
  } catch (e) {
    console.log('⚠️  Firebase Admin SDK not initialized - using dry-run mode');
  }
}

// Nate Holloway (persona id: joel-dickson) configuration.
// Nate is a fictional character: no real person's name, employer, branding or fonts.
const joelConfig: AgentPageConfig = {
  agent: {
    id: 'joel-dickson',
    name: 'Nate Holloway',
    displayName: 'Nate',
    initials: 'NH',
    tagline: 'Life Mentor',
    description: 'Meet Nate Holloway - a fictional economist and life mentor with nearly 30 years at a low-cost fund company. Ask Nate about retirement planning, index investing, and what "enough" means for you.',
    quote: {
      text: 'Most of the time, the biggest risk to your money is the person looking at it in a panic.',
      context: 'A principle Nate has seen proven across nearly 30 years of working with real investors',
    },
    credentials: [
      { label: 'Experience', value: '30 Years' },
      { label: 'Education', value: 'PhD, Economics' },
      { label: 'Role', value: 'Life Mentor' },
    ],
    conversationStarters: [
      'How should I think about retirement planning?',
      "What's your view on index funds vs. active?",
      'How do I stay disciplined during market drops?',
      'How do I know when I have enough?',
    ],
    ctaHeadline: 'Have a real conversation',
    ctaDescription: 'Nate brings nearly 30 years of low-cost investing wisdom and a genuine love of helping people think clearly about money and life.',
  },
  brand: {
    primary: '#2F5D50',
  },
  voice: {
    voiceId: 'bbee10a8-4f08-4c5c-8282-e69299115055',
    provider: 'cartesia',
  },
  theme: 'zen',
  deployment: {
    environment: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  },
  seo: {
    title: 'Meet Nate Holloway — AI Life Mentor',
    description: 'Meet Nate Holloway - a fictional economist and life mentor powered by Ferni',
    twitterCard: 'summary_large_image',
  },
  footer: {
    disclaimer: 'Nate is a fictional AI character powered by Ferni. This is a technology demonstration and does not constitute financial advice.',
  },
};

async function deploy() {
  console.log('🚀 Deploying Nate Holloway Page\n');
  console.log('=' .repeat(60));

  // Generate page
  console.log('\n📝 Generating page...');
  const result = await generateAgentPage(joelConfig);
  console.log(`   Size: ${Math.round(result.size / 1024)} KB`);

  // The subdomain-based doc is what Cloud Run's serveStaticSite() resolves first.
  // The original deploy created doc 'site_1767458603826_o2t4b8' for this persona's page.
  // We MUST update that doc, not create a new one with a different ID. Its subdomain moves to
  // 'meet-nate' now that the character is fictional; the old direct-ID doc must be deleted separately.
  const subdomainDocId = 'site_1767458603826_o2t4b8';
  const siteId = 'meet-nate';
  const url = `https://ferni.ai/sites/${siteId}`;

  // Check if we can deploy to Firestore
  let deployed = false;
  try {
    const db = getAdminFirestore();

    const siteData = {
      userId: 'system',
      agentId: 'joel-dickson',
      agentName: 'Nate Holloway',
      url,
      subdomain: siteId,
      tier: 'premium',
      status: 'active',
      files: {
        'index.html': result.html,
      },
      kind: 'generated',
      updatedAt: new Date().toISOString(),
      analytics: {
        views: 0,
        conversations: 0,
      },
    };

    // Update the subdomain-resolved doc (what Cloud Run actually serves)
    await db.collection('deployed-sites').doc(subdomainDocId).set(siteData);
    // Also keep the direct-ID doc in sync for backward compatibility
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
