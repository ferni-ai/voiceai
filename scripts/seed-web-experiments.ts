#!/usr/bin/env npx tsx
/**
 * Seed Web Experiments
 *
 * Creates the initial A/B experiments in Firestore for the landing page.
 * Run once to set up experiments, then manage via Firebase console.
 *
 * Usage: npx tsx scripts/seed-web-experiments.ts
 *
 * @module scripts/seed-web-experiments
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialize Firebase
if (getApps().length === 0) {
  initializeApp({ projectId: 'johnb-2025' });
}

const db = getFirestore();

// ============================================================================
// EXPERIMENT DEFINITIONS
// ============================================================================

const EXPERIMENTS = [
  {
    id: 'hero-headline',
    name: 'Hero Headline Test',
    description: 'Test different hero headlines to optimize engagement',
    status: 'running',
    variants: [
      { id: 'control', name: 'Control - "Finally, someone who gets it"', weight: 20 },
      { id: 'emotional_question', name: 'Emotional Question', weight: 20 },
      { id: 'team_focus', name: 'Team Focus', weight: 20 },
      { id: 'memory_focus', name: 'Memory Focus', weight: 20 },
      { id: 'presence_focus', name: 'Presence Focus', weight: 20 },
    ],
    targetAudience: {
      percentOfTraffic: 100,
      newUsersOnly: false,
    },
    primaryGoal: 'cta_click',
    secondaryGoals: ['scroll_depth_75', 'demo_start', 'signup'],
    minimumSamples: 100,
  },
  {
    id: 'hero-cta',
    name: 'Hero CTA Button Test',
    description: 'Test different CTA button text and styles',
    status: 'running',
    variants: [
      { id: 'control', name: 'Control - "Start Free"', weight: 25 },
      { id: 'meet_ferni', name: 'Meet Ferni', weight: 25 },
      { id: 'begin_conversation', name: 'Begin a Real Conversation', weight: 25 },
      { id: 'try_now', name: 'Try Ferni Now', weight: 25 },
    ],
    targetAudience: {
      percentOfTraffic: 100,
      newUsersOnly: false,
    },
    primaryGoal: 'cta_click',
    secondaryGoals: ['signup', 'demo_start'],
    minimumSamples: 100,
  },
  {
    id: 'trust-badges',
    name: 'Trust Badge Placement Test',
    description: 'Test trust badge positioning and visibility',
    status: 'running',
    variants: [
      { id: 'control', name: 'Control - Below CTA', weight: 25 },
      { id: 'above_cta', name: 'Above CTA', weight: 25 },
      { id: 'prominent', name: 'Prominent Style', weight: 25 },
      { id: 'hidden', name: 'Hidden', weight: 25 },
    ],
    targetAudience: {
      percentOfTraffic: 100,
      newUsersOnly: false,
    },
    primaryGoal: 'cta_click',
    secondaryGoals: ['scroll_depth_50', 'signup'],
    minimumSamples: 100,
  },
  {
    id: 'awakening-sequence',
    name: 'Awakening Sequence Test',
    description: 'Test whether the cinematic awakening sequence improves engagement',
    status: 'running',
    variants: [
      { id: 'control', name: 'Full Awakening Sequence', weight: 50 },
      { id: 'skip_intro', name: 'Skip Intro (Direct)', weight: 50 },
    ],
    targetAudience: {
      percentOfTraffic: 100,
      newUsersOnly: true, // Only test on new visitors
    },
    primaryGoal: 'scroll_depth_50',
    secondaryGoals: ['cta_click', 'demo_start', 'time_on_page_60s'],
    minimumSamples: 200,
  },
];

// ============================================================================
// SEEDING FUNCTIONS
// ============================================================================

async function seedExperiment(experiment: typeof EXPERIMENTS[0]) {
  const docRef = db.collection('web_experiments').doc(experiment.id);
  const existing = await docRef.get();

  if (existing.exists) {
    console.log(`⏭️  Experiment '${experiment.id}' already exists, skipping...`);
    return;
  }

  const experimentDoc = {
    ...experiment,
    createdAt: FieldValue.serverTimestamp(),
    startedAt: FieldValue.serverTimestamp(),
  };

  await docRef.set(experimentDoc);

  // Initialize metrics for each variant
  for (const variant of experiment.variants) {
    await docRef.collection('metrics').doc(variant.id).set({
      experimentId: experiment.id,
      variantId: variant.id,
      exposures: 0,
      conversions: {},
      lastUpdated: FieldValue.serverTimestamp(),
    });
  }

  console.log(`✅ Created experiment: ${experiment.name}`);
  console.log(`   Variants: ${experiment.variants.map((v) => v.id).join(', ')}`);
}

async function main() {
  console.log('\n🧪 Seeding Web Experiments\n');
  console.log('=' .repeat(50));

  for (const experiment of EXPERIMENTS) {
    await seedExperiment(experiment);
  }

  console.log('\n' + '=' .repeat(50));
  console.log('✅ Done! Experiments are now active.\n');
  console.log('📊 View in Firebase Console:');
  console.log('   https://console.firebase.google.com/project/johnb-2025/firestore/data/~2Fweb_experiments\n');
  console.log('🔍 Test variant assignment:');
  console.log('   window.FerniExperiments.getVariant("hero-headline")\n');

  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Error seeding experiments:', error);
  process.exit(1);
});
