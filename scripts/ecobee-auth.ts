#!/usr/bin/env npx tsx
/**
 * Ecobee Authentication Setup Script
 *
 * Interactive script to connect your Ecobee thermostat to Ferni.
 *
 * Usage:
 *   pnpm ecobee:auth
 *   pnpm ecobee:auth --user your-user-id
 *   pnpm ecobee:auth --status
 */

import * as readline from 'readline';

// Parse args
const args = process.argv.slice(2);
const userId = args.find((a) => a.startsWith('--user='))?.split('=')[1] || 'seth-test-user';
const checkStatus = args.includes('--status');
const help = args.includes('--help') || args.includes('-h');

if (help) {
  console.log(`
🌡️ Ecobee Authentication Setup

Usage:
  pnpm ecobee:auth              # Start PIN-based authentication
  pnpm ecobee:auth --status     # Check current connection status
  pnpm ecobee:auth --user=ID    # Use specific user ID

Requirements:
  - ECOBEE_API_KEY in .env.local (from developer.ecobee.com)
  
Process:
  1. Script requests a PIN from Ecobee
  2. You enter the PIN at ecobee.com/consumerportal
  3. Script exchanges the code for tokens
  4. Tokens are stored in Firestore for future use
  `);
  process.exit(0);
}

async function main() {
  console.log('\n🌡️  Ecobee Authentication Setup\n');
  console.log(`   User ID: ${userId}\n`);

  // Check if API key is configured
  if (!process.env.ECOBEE_API_KEY) {
    console.log('❌ ECOBEE_API_KEY not set!\n');
    console.log('To get an API key:');
    console.log('1. Go to https://www.ecobee.com/developers/');
    console.log('2. Register/Login');
    console.log('3. Create a new app');
    console.log('4. Copy the API key');
    console.log('5. Add to .env.local:\n');
    console.log('   ECOBEE_API_KEY=your_api_key\n');
    process.exit(1);
  }

  // Import auth functions
  const {
    isEcobeeConfigured,
    requestPin,
    checkAuthorization,
    getPendingAuth,
    getThermostatStatus,
  } = await import('../src/services/identity/ecobee-auth.js');

  const { getThermostatStatus: getStatus } = await import('../src/services/identity/ecobee-api.js');

  // Check current status
  if (checkStatus) {
    console.log('📊 Checking Ecobee Status...\n');

    const configured = await isEcobeeConfigured(userId);
    console.log(`   Connected: ${configured ? '✅ Yes' : '❌ No'}\n`);

    if (configured) {
      const status = await getStatus(userId);
      if (status.success && status.data) {
        console.log('🌡️  Thermostat Status:');
        console.log(`   Name: ${status.data.name}`);
        console.log(`   Current: ${status.data.currentTemp}°F`);
        console.log(`   Target: ${status.data.targetHeat}°F - ${status.data.targetCool}°F`);
        console.log(`   Humidity: ${status.data.humidity}%`);
        console.log(`   Mode: ${status.data.mode}`);
        console.log(`   Running: ${status.data.isRunning ? 'Yes' : 'No'}\n`);
      } else {
        console.log(`   ⚠️ ${status.error}\n`);
      }
    }

    return;
  }

  // Check if already connected
  const alreadyConfigured = await isEcobeeConfigured(userId);
  if (alreadyConfigured) {
    console.log('✅ Ecobee is already connected!\n');
    console.log('   Run with --status to check thermostat status');
    console.log('   Or continue to re-authenticate...\n');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question('Continue with re-authentication? (y/N) ', resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== 'y') {
      process.exit(0);
    }
  }

  // Check for pending auth
  const pending = await getPendingAuth(userId);
  if (pending) {
    console.log('📋 Found pending authorization!\n');
    console.log(`   PIN: ${pending.pin}`);
    console.log(`   Expires: ${new Date(pending.expiresAt).toLocaleString()}\n`);
    console.log('   If you already entered the PIN, press Enter to check...');
    console.log('   Otherwise, go to:\n');
    console.log('   👉 https://www.ecobee.com/consumerportal\n');
    console.log('   1. Login to your Ecobee account');
    console.log('   2. Go to My Apps');
    console.log(`   3. Enter PIN: ${pending.pin}\n`);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise<void>((resolve) => {
      rl.question('Press Enter when ready to check authorization... ', () => {
        resolve();
      });
    });
    rl.close();

    // Check if authorized
    console.log('\n⏳ Checking authorization...\n');
    const authResult = await checkAuthorization(userId);

    if (authResult.success && authResult.data?.authorized) {
      console.log('✅ Successfully connected to Ecobee!\n');
      console.log('   Run "pnpm ecobee:auth --status" to check thermostat status.\n');
    } else if (authResult.success && !authResult.data?.authorized) {
      console.log('⏳ Not authorized yet. Please enter the PIN at ecobee.com/consumerportal\n');
      console.log('   Then run this script again to check.\n');
    } else {
      console.log(`❌ Authorization failed: ${authResult.error}\n`);
    }

    return;
  }

  // Request new PIN
  console.log('📋 Requesting new PIN from Ecobee...\n');

  const pinResult = await requestPin(userId);

  if (!pinResult.success || !pinResult.data) {
    console.log(`❌ Failed to get PIN: ${pinResult.error}\n`);
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`   🔑 PIN: ${pinResult.data.pin}\n`);
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`   Expires in: ${pinResult.data.expiresIn} minutes\n`);
  console.log('   Instructions:');
  console.log('   1. Go to: https://www.ecobee.com/consumerportal');
  console.log('   2. Login to your Ecobee account');
  console.log('   3. Click "My Apps" in the menu');
  console.log('   4. Click "Add Application"');
  console.log(`   5. Enter PIN: ${pinResult.data.pin}`);
  console.log('   6. Click "Authorize"\n');

  // Wait for user to enter PIN
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => {
    rl.question('Press Enter after you\'ve authorized the app... ', () => {
      resolve();
    });
  });
  rl.close();

  // Check authorization
  console.log('\n⏳ Checking authorization...\n');

  // Poll a few times
  for (let i = 0; i < 5; i++) {
    const authResult = await checkAuthorization(userId);

    if (authResult.success && authResult.data?.authorized) {
      console.log('✅ Successfully connected to Ecobee!\n');

      // Get thermostat status
      const status = await getStatus(userId);
      if (status.success && status.data) {
        console.log('🌡️  Your Thermostat:');
        console.log(`   Name: ${status.data.name}`);
        console.log(`   Current: ${status.data.currentTemp}°F`);
        console.log(`   Mode: ${status.data.mode}\n`);
      }

      console.log('You can now run:');
      console.log('   pnpm test:real-home        # Run real home tests');
      console.log('   pnpm test:real-home:vibe   # Test vibe presets\n');
      return;
    }

    if (i < 4) {
      console.log(`   Attempt ${i + 1}/5 - waiting...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.log('\n⚠️ Authorization not complete yet.\n');
  console.log('   Make sure you\'ve entered the PIN at ecobee.com/consumerportal');
  console.log('   Then run this script again.\n');
}

main().catch(console.error);
