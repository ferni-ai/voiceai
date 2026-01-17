#!/usr/bin/env npx ts-node
/**
 * Create a test sponsored identity
 */

import { config } from 'dotenv';
config();

import { createSponsoredIdentity, lookupByPhone } from '../src/services/identity/sponsored-identity.js';

async function main() {
  const testPhone = process.argv[2] || '+15551234567';
  const testName = process.argv[3] || 'Mom';
  const sponsorId = process.argv[4] || 'seth-test-uid';
  
  console.log('\n🔍 Checking if identity already exists...');
  
  const existing = await lookupByPhone(testPhone);
  if (existing && 'id' in existing) {
    console.log('✅ Identity already exists:');
    console.log(JSON.stringify(existing, null, 2));
    process.exit(0);
  }
  
  if (existing && 'found' in existing && !existing.found) {
    console.log('📝 No existing identity found, creating new one...');
  }
  
  console.log(`\n📝 Creating sponsored identity for ${testName}...`);
  
  try {
    const identity = await createSponsoredIdentity(sponsorId, {
      displayName: testName,
      phoneNumber: testPhone,
      relationship: 'mother',
      accessLevel: 'full',
      allowedPersonas: ['*'],
      notes: 'Test identity for phone identity system validation'
    });
    
    console.log('\n✅ Created sponsored identity:');
    console.log(JSON.stringify(identity, null, 2));
    
    console.log('\n📞 To test: Call +18885983952 from ' + testPhone);
    console.log('   Ferni should greet you by name: "' + testName + '"');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Failed:', (error as Error).message);
    process.exit(1);
  }
}

// Timeout after 30 seconds
setTimeout(() => {
  console.error('\n❌ Script timed out');
  process.exit(1);
}, 30000);

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
