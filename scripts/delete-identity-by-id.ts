#!/usr/bin/env npx tsx
import { config } from 'dotenv';
config();

import admin from 'firebase-admin';

// Initialize Firebase if not already done
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT || 'johnb-2025',
  });
}

const db = admin.firestore();
const id = process.argv[2] || 'sponsored_1768055737952_g4sj28';
const phone = process.argv[3] || '+15551234567';

async function main() {
  console.log(`🗑️  Deleting identity ${id}...`);
  await db.collection('sponsored_identities').doc(id).delete();
  console.log('✅ Deleted identity');
  
  // Clean up phone index
  const phoneHash = phone.replace(/[^0-9]/g, '');
  console.log(`🗑️  Cleaning phone index ${phoneHash}...`);
  await db.collection('sponsored_identity_phone_index').doc(phoneHash).delete();
  console.log('✅ Cleaned phone index');
  
  process.exit(0);
}

setTimeout(() => process.exit(1), 15000);
main().catch(e => { console.error('❌', e.message); process.exit(1); });
