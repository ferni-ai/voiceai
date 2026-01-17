#!/usr/bin/env npx tsx
/**
 * Check contacts in Firestore
 */

import { getFirestoreDb } from '../src/services/superhuman/firestore-utils.js';

async function checkContacts() {
  const db = getFirestoreDb();
  if (!db) {
    console.log('❌ Firestore not initialized');
    return;
  }

  const userId = process.env.FERNI_USER_ID || 'seth';
  console.log(`\n📇 Checking contacts for user: ${userId}\n`);

  // Check contacts collection
  const contacts = await db.collection('bogle_users').doc(userId).collection('contacts').get();
  console.log(`Found ${contacts.size} contacts:\n`);
  
  contacts.forEach(doc => {
    const data = doc.data();
    console.log(`  📞 ${data.name}`);
    console.log(`     ID: ${doc.id}`);
    console.log(`     Phone: ${data.phone || 'N/A'}`);
    console.log(`     Relationship: ${data.relationship || 'N/A'}`);
    console.log(`     Aliases: ${data.aliases?.join(', ') || 'N/A'}`);
    console.log();
  });

  // Also check contact_relationships collection (used by searchContacts)
  console.log('\n📊 Checking contact_relationships collection...');
  const relationships = await db.collection('bogle_users').doc(userId).collection('contact_relationships').get();
  console.log(`Found ${relationships.size} relationships:\n`);
  
  relationships.forEach(doc => {
    const data = doc.data();
    console.log(`  🔗 ${data.contactName || doc.id}`);
    console.log(`     ID: ${doc.id}`);
    console.log(`     Phone: ${data.phone || 'N/A'}`);
    console.log(`     Relationship: ${data.relationship || 'N/A'}`);
    console.log();
  });
}

checkContacts().catch(console.error);

