#!/usr/bin/env tsx
/**
 * Seed Superhuman Experiments
 *
 * Creates initial experiments to demonstrate the "Better than Human"
 * A/B testing system capabilities:
 *
 * 1. Thompson Sampling - Dynamic traffic allocation
 * 2. Contextual Selection - Personalized variants
 * 3. Cross-Experiment Learning - Transfer learning
 * 4. Semantic Routing - Intelligent discovery
 * 5. Auto-Graduation - Winner detection
 *
 * Usage:
 *   pnpm exec tsx scripts/seed-superhuman-experiments.ts
 *   pnpm exec tsx scripts/seed-superhuman-experiments.ts --dry-run
 *
 * @module scripts/seed-superhuman-experiments
 */

import {
  createExperiment,
  createSimpleABTest,
  createMultiVariantTest,
} from '../src/services/experiments/superhuman-experiments.js';
import { createExperimentMetadata } from '../src/services/experiments/semantic-router.js';

const isDryRun = process.argv.includes('--dry-run');

async function seed() {
  console.log('🧪 Seeding Superhuman Experiments...\n');

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  // ============================================================================
  // 1. Hero CTA Experiment (Simple A/B with Thompson Sampling)
  // ============================================================================
  console.log('1️⃣  Creating Hero CTA Experiment...');

  const heroCTAExperiment = {
    id: 'hero-cta-v1',
    name: 'Hero CTA Copy Test',
    variantA: {
      name: 'Control - Start Now',
      config: {
        text: 'Start your journey',
        color: 'primary',
        size: 'large',
      },
    },
    variantB: {
      name: 'Treatment - Talk to Ferni',
      config: {
        text: 'Talk to Ferni now',
        color: 'accent',
        size: 'large',
      },
    },
    tags: ['hero', 'cta', 'onboarding', 'landing'],
  };

  if (!isDryRun) {
    await createSimpleABTest(
      heroCTAExperiment.id,
      heroCTAExperiment.name,
      heroCTAExperiment.variantA,
      heroCTAExperiment.variantB,
      heroCTAExperiment.tags
    );
  }
  console.log(`   ✅ ${heroCTAExperiment.name}`);

  // ============================================================================
  // 2. Onboarding Flow Experiment (Multi-variant with Contextual Selection)
  // ============================================================================
  console.log('\n2️⃣  Creating Onboarding Flow Experiment...');

  const onboardingExperiment = {
    id: 'onboarding-flow-v1',
    name: 'Onboarding Flow Optimization',
    variants: [
      {
        id: 'minimal',
        name: 'Minimal - 2 steps',
        config: {
          steps: 2,
          showSkip: true,
          collectName: true,
          collectGoal: false,
        },
        contextConditions: [
          { field: 'device', operator: 'eq', value: 'mobile', weightModifier: 1.5 },
          { field: 'isNewUser', operator: 'eq', value: true, weightModifier: 1.3 },
        ],
      },
      {
        id: 'standard',
        name: 'Standard - 4 steps',
        config: {
          steps: 4,
          showSkip: false,
          collectName: true,
          collectGoal: true,
        },
        contextConditions: [
          { field: 'device', operator: 'eq', value: 'desktop', weightModifier: 1.3 },
        ],
      },
      {
        id: 'guided',
        name: 'Guided - Interactive',
        config: {
          steps: 3,
          showSkip: true,
          collectName: true,
          collectGoal: true,
          interactive: true,
        },
        contextConditions: [
          { field: 'engagementLevel', operator: 'eq', value: 'high', weightModifier: 1.4 },
        ],
      },
    ],
    settings: {
      algorithm: 'contextual' as const,
      enableContextual: true,
      autoGraduate: true,
    },
  };

  if (!isDryRun) {
    await createMultiVariantTest(
      onboardingExperiment.id,
      onboardingExperiment.name,
      onboardingExperiment.variants,
      onboardingExperiment.settings
    );
  }
  console.log(`   ✅ ${onboardingExperiment.name}`);

  // ============================================================================
  // 3. Persona Voice Experiment (for Trust Building)
  // ============================================================================
  console.log('\n3️⃣  Creating Persona Voice Experiment...');

  const personaVoiceExperiment = {
    id: 'ferni-voice-warmth-v1',
    name: 'Ferni Voice Warmth Test',
    variants: [
      {
        id: 'warm',
        name: 'Warm & Caring',
        config: {
          tonePreset: 'warm',
          speakingRate: 0.95,
          emotionalRange: 'high',
        },
      },
      {
        id: 'professional',
        name: 'Professional & Clear',
        config: {
          tonePreset: 'professional',
          speakingRate: 1.0,
          emotionalRange: 'medium',
        },
      },
      {
        id: 'playful',
        name: 'Playful & Energetic',
        config: {
          tonePreset: 'playful',
          speakingRate: 1.05,
          emotionalRange: 'high',
        },
        contextConditions: [
          { field: 'localHour', operator: 'lt', value: 12, weightModifier: 1.3 },
          { field: 'emotionalState', operator: 'eq', value: 'excited', weightModifier: 1.5 },
        ],
      },
    ],
    settings: {
      algorithm: 'hybrid' as const,
      enableContextual: true,
      enableTransferLearning: true,
    },
  };

  if (!isDryRun) {
    await createMultiVariantTest(
      personaVoiceExperiment.id,
      personaVoiceExperiment.name,
      personaVoiceExperiment.variants,
      personaVoiceExperiment.settings
    );
  }
  console.log(`   ✅ ${personaVoiceExperiment.name}`);

  // ============================================================================
  // 4. Evening Engagement Experiment (Time-based Contextual)
  // ============================================================================
  console.log('\n4️⃣  Creating Evening Engagement Experiment...');

  const eveningExperiment = {
    id: 'evening-engagement-v1',
    name: 'Evening Check-in Style',
    variants: [
      {
        id: 'reflective',
        name: 'Reflective Questions',
        config: {
          style: 'reflective',
          questions: ['How did your day go?', 'What are you grateful for today?'],
          mood: 'calm',
        },
        contextConditions: [
          { field: 'localHour', operator: 'gte', value: 20, weightModifier: 1.5 },
          { field: 'emotionalState', operator: 'eq', value: 'anxious', weightModifier: 1.3 },
        ],
      },
      {
        id: 'celebratory',
        name: 'Win Celebration',
        config: {
          style: 'celebratory',
          questions: ['What wins can we celebrate?', 'What went well today?'],
          mood: 'upbeat',
        },
      },
      {
        id: 'planning',
        name: 'Tomorrow Planning',
        config: {
          style: 'planning',
          questions: ["What's the priority for tomorrow?", 'Any concerns for the week?'],
          mood: 'focused',
        },
        contextConditions: [
          { field: 'dayOfWeek', operator: 'eq', value: 0, weightModifier: 1.4 }, // Sunday
        ],
      },
    ],
  };

  if (!isDryRun) {
    await createMultiVariantTest(
      eveningExperiment.id,
      eveningExperiment.name,
      eveningExperiment.variants,
      { algorithm: 'contextual', enableContextual: true }
    );
  }
  console.log(`   ✅ ${eveningExperiment.name}`);

  // ============================================================================
  // 5. Trust Signals Experiment (for Skeptical Users)
  // ============================================================================
  console.log('\n5️⃣  Creating Trust Signals Experiment...');

  const trustExperiment = {
    id: 'trust-signals-v1',
    name: 'Trust Building for Skeptical Users',
    variants: [
      {
        id: 'social-proof',
        name: 'Social Proof',
        config: {
          showTestimonials: true,
          showUserCount: true,
          showRatings: true,
        },
        contextConditions: [
          { field: 'emotionalState', operator: 'eq', value: 'skeptical', weightModifier: 1.6 },
        ],
      },
      {
        id: 'privacy-first',
        name: 'Privacy Emphasis',
        config: {
          showPrivacyBadge: true,
          showEncryptionInfo: true,
          showDataPolicy: true,
        },
      },
      {
        id: 'expertise',
        name: 'Expertise Credentials',
        config: {
          showCredentials: true,
          showTeamBios: true,
          showResearch: true,
        },
      },
    ],
  };

  if (!isDryRun) {
    await createMultiVariantTest(
      trustExperiment.id,
      trustExperiment.name,
      trustExperiment.variants,
      { algorithm: 'thompson', enableTransferLearning: true }
    );
  }
  console.log(`   ✅ ${trustExperiment.name}`);

  // ============================================================================
  // 6. Mobile-First Experiment (Device Targeting)
  // ============================================================================
  console.log('\n6️⃣  Creating Mobile-First Experiment...');

  const mobileExperiment = {
    id: 'mobile-experience-v1',
    name: 'Mobile Experience Optimization',
    variantA: {
      name: 'Control - Standard Mobile',
      config: {
        layout: 'standard',
        gestures: false,
        haptics: false,
      },
    },
    variantB: {
      name: 'Treatment - Enhanced Mobile',
      config: {
        layout: 'compact',
        gestures: true,
        haptics: true,
      },
    },
    tags: ['mobile', 'ux', 'engagement'],
  };

  if (!isDryRun) {
    await createSimpleABTest(
      mobileExperiment.id,
      mobileExperiment.name,
      mobileExperiment.variantA,
      mobileExperiment.variantB,
      mobileExperiment.tags
    );
  }
  console.log(`   ✅ ${mobileExperiment.name}`);

  // ============================================================================
  // Summary
  // ============================================================================
  console.log('\n' + '═'.repeat(60));
  console.log('🎉 Superhuman Experiments Seeded Successfully!\n');
  console.log('Created experiments:');
  console.log('  • hero-cta-v1 (Simple A/B with Thompson Sampling)');
  console.log('  • onboarding-flow-v1 (Multi-variant with Contextual)');
  console.log('  • ferni-voice-warmth-v1 (Hybrid Algorithm)');
  console.log('  • evening-engagement-v1 (Time-based Contextual)');
  console.log('  • trust-signals-v1 (Transfer Learning enabled)');
  console.log('  • mobile-experience-v1 (Device Targeting)');
  console.log('\nCapabilities demonstrated:');
  console.log('  ✅ Thompson Sampling for dynamic allocation');
  console.log('  ✅ Contextual selection based on user attributes');
  console.log('  ✅ Cross-experiment transfer learning');
  console.log('  ✅ Semantic tagging for routing');
  console.log('  ✅ Auto-graduation when winner detected');
  console.log('\n' + '═'.repeat(60));

  if (isDryRun) {
    console.log('\n⚠️  DRY RUN - No experiments were actually created');
    console.log('   Run without --dry-run to create experiments\n');
  } else {
    console.log('\n📊 View experiments at: /api/v1/public/superhuman/experiments');
    console.log('📈 View stats at: /api/v1/public/superhuman/experiments/{id}/stats\n');
  }
}

// Run the seed
seed().catch((err) => {
  console.error('❌ Error seeding experiments:', err);
  process.exit(1);
});
