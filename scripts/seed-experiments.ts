#!/usr/bin/env npx tsx
/**
 * Seed Initial Experiments
 *
 * Creates the initial A/B test experiments for the landing page.
 * Run this once to set up experiments in Firestore.
 *
 * Usage: npx tsx scripts/seed-experiments.ts
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialize Firebase
if (getApps().length === 0) {
  initializeApp({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025',
  });
}

const db = getFirestore();

// ============================================================================
// EXPERIMENT DEFINITIONS
// ============================================================================

interface ExperimentDef {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'running';
  variants: Array<{
    id: string;
    name: string;
    weight: number;
    description?: string;
  }>;
  primaryGoal: string;
  secondaryGoals?: string[];
  minimumSamples: number;
  targetAudience?: {
    percentOfTraffic?: number;
    newUsersOnly?: boolean;
  };
}

const EXPERIMENTS: ExperimentDef[] = [
  {
    id: 'hero-headline',
    name: 'Hero Headline Test',
    description: 'Test different headline and tagline combinations on the landing page hero section.',
    status: 'running',
    variants: [
      {
        id: 'control',
        name: 'Current (Finally someone who gets it)',
        weight: 25,
        description: 'Better than human. Finally, someone who gets it.',
      },
      {
        id: 'emotional_question',
        name: 'Emotional Question',
        weight: 25,
        description: 'Your AI life coach. What if someone actually understood?',
      },
      {
        id: 'team_focus',
        name: 'Team Focus',
        weight: 25,
        description: 'Better than human. Six brilliant minds. One conversation.',
      },
      {
        id: 'memory_focus',
        name: 'Memory Focus',
        weight: 25,
        description: 'Beyond human limitations. Someone who never forgets.',
      },
    ],
    primaryGoal: 'cta_click',
    secondaryGoals: ['scroll_50', 'time_30s'],
    minimumSamples: 1000,
    targetAudience: {
      percentOfTraffic: 100,
    },
  },
  {
    id: 'hero-cta',
    name: 'Hero CTA Button Test',
    description: 'Test different CTA button text variations.',
    status: 'running',
    variants: [
      {
        id: 'control',
        name: 'Start Free',
        weight: 34,
        description: 'Current CTA: Start Free',
      },
      {
        id: 'meet_ferni',
        name: 'Meet Ferni',
        weight: 33,
        description: 'Personal intro: Meet Ferni',
      },
      {
        id: 'begin_conversation',
        name: 'Begin a Real Conversation',
        weight: 33,
        description: 'Longer, emotional CTA',
      },
    ],
    primaryGoal: 'cta_click',
    secondaryGoals: ['scroll_50'],
    minimumSamples: 1000,
    targetAudience: {
      percentOfTraffic: 100,
    },
  },
  {
    id: 'trust-badges',
    name: 'Trust Badges Position Test',
    description: 'Test trust badge placement and style in the hero section.',
    status: 'draft', // Start as draft, can enable later
    variants: [
      {
        id: 'control',
        name: 'Below CTA (Minimal)',
        weight: 50,
        description: 'Current: Below CTA with minimal styling',
      },
      {
        id: 'above_cta',
        name: 'Above CTA',
        weight: 50,
        description: 'Move trust badges above the CTA',
      },
    ],
    primaryGoal: 'cta_click',
    secondaryGoals: ['scroll_50'],
    minimumSamples: 1000,
    targetAudience: {
      percentOfTraffic: 100,
    },
  },
];

// ============================================================================
// SEED FUNCTION
// ============================================================================

async function seedExperiments() {
  console.log('🧪 Seeding experiments...\n');

  for (const experiment of EXPERIMENTS) {
    const docRef = db.collection('web_experiments').doc(experiment.id);
    const existing = await docRef.get();

    if (existing.exists) {
      console.log(`  ⏭️  ${experiment.id} already exists, skipping`);
      continue;
    }

    await docRef.set({
      name: experiment.name,
      description: experiment.description,
      status: experiment.status,
      variants: experiment.variants,
      primaryGoal: experiment.primaryGoal,
      secondaryGoals: experiment.secondaryGoals || [],
      minimumSamples: experiment.minimumSamples,
      targetAudience: experiment.targetAudience || {},
      createdAt: FieldValue.serverTimestamp(),
      startedAt: experiment.status === 'running' ? FieldValue.serverTimestamp() : null,
    });

    // Initialize metrics for each variant
    for (const variant of experiment.variants) {
      await docRef.collection('metrics').doc(variant.id).set({
        exposures: 0,
        conversions: {},
        conversionRates: {},
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    console.log(`  ✅ Created: ${experiment.id} (${experiment.status})`);
  }

  console.log('\n🎉 Experiments seeded successfully!\n');

  // Print summary
  console.log('📊 Summary:');
  console.log(`   Total experiments: ${EXPERIMENTS.length}`);
  console.log(`   Running: ${EXPERIMENTS.filter((e) => e.status === 'running').length}`);
  console.log(`   Draft: ${EXPERIMENTS.filter((e) => e.status === 'draft').length}`);

  console.log('\n🔗 View in Firebase Console:');
  console.log(
    '   https://console.firebase.google.com/project/johnb-2025/firestore/data/~2Fweb_experiments'
  );

  console.log('\n📈 Monitor via API:');
  console.log('   GET https://app.ferni.ai/api/optimizer/experiments');
  console.log('   GET https://app.ferni.ai/api/optimizer/status');
}

// ============================================================================
// RUN
// ============================================================================

seedExperiments()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Failed to seed experiments:', error);
    process.exit(1);
  });
