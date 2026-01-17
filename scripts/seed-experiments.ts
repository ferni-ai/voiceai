/**
 * Seed Web Experiments
 *
 * Creates the experiments needed by the landing page.
 * These are simple feature flags - all traffic gets the "enabled" variant.
 *
 * Usage:
 *   npx ts-node scripts/seed-experiments.ts
 *   # or
 *   pnpm exec tsx scripts/seed-experiments.ts
 */

import 'dotenv/config';
import admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getGCPProjectId } from '../src/config/environment.js';

// Initialize Firebase
const projectId = getGCPProjectId() || 'bogle-voice';
if (admin.apps.length === 0) {
  admin.initializeApp({ projectId });
}
const db = getFirestore();

interface ExperimentSeed {
  name: string;
  description: string;
  primaryGoal: string;
}

// Experiments required by ai-powered-landing.js
const AI_LANDING_EXPERIMENTS: Record<string, ExperimentSeed> = {
  'landing-ai-live-chat': {
    name: 'AI Live Chat',
    description: 'Enable AI-powered live chat on landing page',
    primaryGoal: 'chat_engagement',
  },
  'landing-ai-personalized-hero': {
    name: 'Personalized Hero',
    description: 'Enable personalized hero section',
    primaryGoal: 'hero_engagement',
  },
  'landing-ai-persona-previews': {
    name: 'Persona Previews',
    description: 'Enable AI persona preview cards',
    primaryGoal: 'persona_click',
  },
  'landing-ai-smart-faq': {
    name: 'Smart FAQ',
    description: 'Enable AI-powered FAQ',
    primaryGoal: 'faq_engagement',
  },
  'landing-ai-social-proof': {
    name: 'AI Social Proof',
    description: 'Enable AI-generated social proof',
    primaryGoal: 'social_proof_engagement',
  },
  'landing-ai-hover-previews': {
    name: 'Hover Previews',
    description: 'Enable hover preview interactions',
    primaryGoal: 'hover_engagement',
  },
  'landing-ai-sentiment-copy': {
    name: 'Sentiment-Reactive Copy',
    description: 'Enable sentiment-reactive copy changes',
    primaryGoal: 'sentiment_engagement',
  },
  'landing-ai-micro-expressions': {
    name: 'Micro Expressions',
    description: 'Enable micro-expression animations',
    primaryGoal: 'expression_engagement',
  },
  'landing-ai-voice-samples': {
    name: 'Voice Samples',
    description: 'Enable voice sample previews',
    primaryGoal: 'voice_engagement',
  },
  'landing-ai-memory-demo': {
    name: 'Memory Demo',
    description: 'Enable memory demonstration feature',
    primaryGoal: 'memory_demo_engagement',
  },
};

// Experiments required by experiment-variants.js
const VARIANT_EXPERIMENTS: Record<string, ExperimentSeed> = {
  'hero-headline': {
    name: 'Hero Headline',
    description: 'Test different hero headlines',
    primaryGoal: 'cta_click',
  },
  'hero-cta': {
    name: 'Hero CTA',
    description: 'Test different CTA button text',
    primaryGoal: 'cta_click',
  },
  'trust-badges': {
    name: 'Trust Badges',
    description: 'Test different trust badge layouts',
    primaryGoal: 'scroll_depth',
  },
};

async function seedExperiment(id: string, seed: ExperimentSeed): Promise<void> {
  const docRef = db.collection('web_experiments').doc(id);
  const doc = await docRef.get();

  if (doc.exists) {
    console.log(`  ⏭️  ${id} already exists, skipping`);
    return;
  }

  await docRef.set({
    name: seed.name,
    description: seed.description,
    status: 'running', // Active immediately
    variants: [
      { id: 'control', name: 'Control', weight: 0 }, // No traffic to control
      { id: 'enabled', name: 'Enabled', weight: 100 }, // All traffic to enabled
    ],
    targetAudience: {
      percentOfTraffic: 100, // All users in experiment
    },
    primaryGoal: seed.primaryGoal,
    minimumSamples: 1000,
    createdAt: FieldValue.serverTimestamp(),
    startedAt: FieldValue.serverTimestamp(),
  });

  console.log(`  ✅ Created ${id}`);
}

async function main() {
  console.log('🧪 Seeding Web Experiments\n');
  console.log(`  Project: ${projectId}`);
  console.log(`  Collection: web_experiments\n`);

  console.log('📊 AI Landing Page Experiments:');
  for (const [id, seed] of Object.entries(AI_LANDING_EXPERIMENTS)) {
    await seedExperiment(id, seed);
  }

  console.log('\n🎨 Variant Experiments:');
  for (const [id, seed] of Object.entries(VARIANT_EXPERIMENTS)) {
    await seedExperiment(id, seed);
  }

  console.log('\n✨ Done! Experiments are now active.\n');
  process.exit(0);
}

main().catch((error) => {
  console.error('Failed to seed experiments:', error);
  process.exit(1);
});
