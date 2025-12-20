#!/usr/bin/env node
/**
 * Stripe Configuration Verifier for Founders Fund
 * Run: node scripts/verify-stripe.js
 */

import Stripe from 'stripe';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const REQUIRED_ENV_VARS = {
  // Core Stripe
  'STRIPE_SECRET_KEY': 'Stripe secret key (sk_live_... or sk_test_...)',
  'STRIPE_PUBLISHABLE_KEY': 'Stripe publishable key (pk_live_... or pk_test_...)',
  
  // Subscription prices
  'STRIPE_PRICE_FOUNDING_MEMBER': 'Founding Member monthly price ID',
  'STRIPE_PRICE_FOUNDING_PATRON': 'Founding Patron monthly price ID',
  
  // Seed prices (one-time)
  'STRIPE_PRICE_SEED_5': 'Plant a Seed ($5) price ID',
  'STRIPE_PRICE_SEED_10': 'Sponsor a Conversation ($10) price ID',
  'STRIPE_PRICE_SEED_25': 'Help Someone Get Started ($25) price ID',
  'STRIPE_PRICE_SEED_50': 'Support the Mission ($50) price ID',
};

const OPTIONAL_ENV_VARS = {
  'STRIPE_WEBHOOK_SECRET': 'Webhook secret (whsec_...)',
  'STRIPE_PRICE_FOUNDING_MEMBER_ANNUAL': 'Founding Member annual price ID',
  'STRIPE_PRICE_FOUNDING_PATRON_ANNUAL': 'Founding Patron annual price ID',
  // Legacy fallbacks
  'STRIPE_PRICE_FRIEND': 'Legacy: Friend tier price ID',
  'STRIPE_PRICE_PARTNER': 'Legacy: Partner tier price ID',
};

console.log('\n🔍 Stripe Configuration Verifier\n');
console.log('='.repeat(50));

// Check environment variables
console.log('\n📋 Environment Variables:\n');

let missingRequired = [];
let missingOptional = [];

for (const [key, desc] of Object.entries(REQUIRED_ENV_VARS)) {
  const value = process.env[key];
  if (value) {
    const masked = value.substring(0, 8) + '...' + value.substring(value.length - 4);
    console.log(`  ✅ ${key}: ${masked}`);
  } else {
    console.log(`  ❌ ${key}: MISSING - ${desc}`);
    missingRequired.push(key);
  }
}

console.log('\n  Optional:');
for (const [key, desc] of Object.entries(OPTIONAL_ENV_VARS)) {
  const value = process.env[key];
  if (value) {
    const masked = value.substring(0, 8) + '...' + value.substring(value.length - 4);
    console.log(`  ✅ ${key}: ${masked}`);
  } else {
    console.log(`  ⚠️  ${key}: not set`);
    missingOptional.push(key);
  }
}

// Test Stripe connection
console.log('\n' + '='.repeat(50));
console.log('\n🔌 Stripe API Connection:\n');

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.log('  ❌ Cannot test - STRIPE_SECRET_KEY not set\n');
  process.exit(1);
}

const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

try {
  // Test connection
  const account = await stripe.accounts.retrieve();
  console.log(`  ✅ Connected to Stripe`);
  console.log(`     Account: ${account.business_profile?.name || account.id}`);
  console.log(`     Mode: ${stripeKey.startsWith('sk_live') ? '🔴 LIVE' : '🟡 TEST'}`);
} catch (error) {
  console.log(`  ❌ Connection failed: ${error.message}`);
  process.exit(1);
}

// Verify price IDs
console.log('\n' + '='.repeat(50));
console.log('\n💰 Price ID Verification:\n');

const priceIds = [
  ['STRIPE_PRICE_FOUNDING_MEMBER', '$10/mo Founding Member'],
  ['STRIPE_PRICE_FOUNDING_PATRON', '$20/mo Founding Patron'],
  ['STRIPE_PRICE_FOUNDING_MEMBER_ANNUAL', '$100/yr Founding Member'],
  ['STRIPE_PRICE_FOUNDING_PATRON_ANNUAL', '$200/yr Founding Patron'],
  ['STRIPE_PRICE_SEED_5', '$5 Plant a Seed'],
  ['STRIPE_PRICE_SEED_10', '$10 Sponsor a Conversation'],
  ['STRIPE_PRICE_SEED_25', '$25 Help Someone Get Started'],
  ['STRIPE_PRICE_SEED_50', '$50 Support the Mission'],
];

for (const [envVar, desc] of priceIds) {
  const priceId = process.env[envVar];
  if (!priceId) {
    console.log(`  ⚠️  ${desc}: not configured`);
    continue;
  }
  
  try {
    const price = await stripe.prices.retrieve(priceId);
    const amount = price.unit_amount / 100;
    const currency = price.currency.toUpperCase();
    const interval = price.recurring ? `/${price.recurring.interval}` : ' one-time';
    console.log(`  ✅ ${desc}: ${currency} ${amount}${interval}`);
  } catch (error) {
    console.log(`  ❌ ${desc}: Invalid price ID (${priceId})`);
  }
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('\n📊 Summary:\n');

if (missingRequired.length === 0) {
  console.log('  ✅ All required environment variables are set');
} else {
  console.log(`  ❌ Missing ${missingRequired.length} required vars: ${missingRequired.join(', ')}`);
}

if (missingOptional.length > 0) {
  console.log(`  ⚠️  Missing ${missingOptional.length} optional vars`);
}

console.log('\n');
