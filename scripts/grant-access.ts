#!/usr/bin/env npx tsx
/**
 * Grant App Access to Waitlisted Users
 *
 * This script grants full app access to users without requiring Stripe payment.
 * Perfect for:
 * - Beta testers
 * - Friends & family
 * - Waitlist early adopters
 * - Press/media accounts
 *
 * Usage:
 *   npx tsx scripts/grant-access.ts --email=jack.sneddon@gmail.com --tier=partner
 *   npx tsx scripts/grant-access.ts --email=test@example.com --tier=friend --name="Test User"
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createDefaultSubscription } from '../src/types/subscription.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

interface GrantAccessOptions {
  email: string;
  name?: string;
  tier: 'friend' | 'partner';
  reason?: string;
}

// Parse command line args
function parseArgs(): GrantAccessOptions {
  const args = process.argv.slice(2);
  const options: Partial<GrantAccessOptions> = {
    tier: 'partner',
    reason: 'waitlist_approval',
  };

  for (const arg of args) {
    const [key, value] = arg.replace('--', '').split('=');
    if (key === 'email') options.email = value;
    if (key === 'name') options.name = value;
    if (key === 'tier') options.tier = value as 'friend' | 'partner';
    if (key === 'reason') options.reason = value;
  }

  if (!options.email) {
    console.error('Usage: npx tsx scripts/grant-access.ts --email=user@example.com [--tier=partner] [--name="User Name"]');
    process.exit(1);
  }

  return options as GrantAccessOptions;
}

// ============================================================================
// FIREBASE INITIALIZATION
// ============================================================================

function initFirebase() {
  if (!getApps().length) {
    initializeApp({ projectId: 'johnb-2025' });
  }
  return getFirestore();
}

// ============================================================================
// GRANT ACCESS
// ============================================================================

async function grantAccess(db: FirebaseFirestore.Firestore, options: GrantAccessOptions): Promise<void> {
  const { email, name, tier, reason } = options;
  
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║              GRANT FERNI APP ACCESS                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\n📧 Email: ${email}`);
  console.log(`👤 Name: ${name || 'Not specified'}`);
  console.log(`🎫 Tier: ${tier === 'partner' ? 'Founding Patron ($20/mo value)' : 'Founding Member ($10/mo value)'}`);
  console.log(`📝 Reason: ${reason}`);

  // Step 1: Update waitlist entry to approved
  console.log('\n📋 Step 1: Updating waitlist status...');
  const waitlistDocId = Buffer.from(email.toLowerCase().trim()).toString('base64').replace(/[/+=]/g, '_');
  
  await db.collection('waitlist').doc(waitlistDocId).set({
    email: email.toLowerCase().trim(),
    status: 'approved',
    approvedAt: FieldValue.serverTimestamp(),
    approvedTier: tier,
    approvedReason: reason,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log('   ✅ Waitlist status: approved');

  // Step 2: Find or create user profile
  console.log('\n👤 Step 2: Finding/creating user profile...');
  
  // Search for existing profile by email
  const profilesQuery = await db.collection('bogle_users')
    .where('email', '==', email.toLowerCase().trim())
    .limit(1)
    .get();

  let userId: string;
  let existingProfile: FirebaseFirestore.DocumentData | null = null;

  if (!profilesQuery.empty) {
    userId = profilesQuery.docs[0].id;
    existingProfile = profilesQuery.docs[0].data();
    console.log(`   ✅ Found existing profile: ${userId}`);
  } else {
    // Create a new user profile
    userId = `granted_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    console.log(`   📝 Creating new profile: ${userId}`);
  }

  // Step 3: Set up subscription data
  console.log('\n🎫 Step 3: Setting up subscription...');
  
  const subscription = {
    ...createDefaultSubscription(),
    tier,
    status: 'active' as const,
    grantedAccess: true,
    grantedAt: new Date(),
    grantedReason: reason,
    // No Stripe IDs since this is manual grant
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  };

  // Step 4: Save/update user profile
  const profileData = {
    ...(existingProfile || {}),
    userId,
    email: email.toLowerCase().trim(),
    ...(name && { name }),
    subscription,
    updatedAt: FieldValue.serverTimestamp(),
    ...(existingProfile ? {} : { createdAt: FieldValue.serverTimestamp() }),
  };

  await db.collection('bogle_users').doc(userId).set(profileData, { merge: true });
  console.log(`   ✅ Subscription tier: ${tier}`);
  console.log(`   ✅ Status: active`);

  // Step 5: Create approved_users entry for quick lookup
  console.log('\n🔑 Step 4: Creating access entry...');
  
  await db.collection('approved_users').doc(email.toLowerCase().trim()).set({
    email: email.toLowerCase().trim(),
    userId,
    tier,
    grantedAt: FieldValue.serverTimestamp(),
    reason,
    active: true,
  });
  console.log('   ✅ Access entry created');

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('✅ ACCESS GRANTED!');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`\n${name || email} now has full access to Ferni!`);
  console.log(`\n🔗 They can sign in at: https://app.ferni.ai`);
  console.log(`📱 Using email: ${email}`);
  console.log(`\n💡 Their access includes:`);
  if (tier === 'partner') {
    console.log('   • Unlimited conversation time');
    console.log('   • Full team access (all 6 personas)');
    console.log('   • Cross-device sync');
    console.log('   • Priority support');
    console.log('   • Beta features');
  } else {
    console.log('   • Unlimited conversations');
    console.log('   • Core team access (Ferni + Maya + Peter + Alex + Jordan)');
    console.log('   • Memory persistence');
  }
  console.log('════════════════════════════════════════════════════════════════\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const options = parseArgs();
  const db = initFirebase();
  await grantAccess(db, options);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
