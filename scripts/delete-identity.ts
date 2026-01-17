#!/usr/bin/env npx tsx
import { config } from 'dotenv';
config();

import { lookupByPhone, deleteSponsoredIdentity } from '../src/services/identity/sponsored-identity.js';

const phone = process.argv[2];
if (!phone) {
  console.error('Usage: pnpm tsx scripts/delete-identity.ts +15551234567');
  process.exit(1);
}

async function main() {
  console.log(`🔍 Looking up ${phone}...`);
  const result = await lookupByPhone(phone);
  
  if (result && 'id' in result) {
    console.log(`🗑️  Deleting ${result.displayName} (${result.id})...`);
    await deleteSponsoredIdentity(result.id);
    console.log('✅ Deleted');
  } else {
    console.log('❌ No identity found for', phone);
  }
  process.exit(0);
}

setTimeout(() => process.exit(1), 15000);
main();
