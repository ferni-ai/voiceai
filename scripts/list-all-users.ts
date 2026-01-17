#!/usr/bin/env npx tsx
/**
 * List all users in Firestore
 */

import { getFirestoreDb } from '../src/services/superhuman/firestore-utils.js';

async function listAllUsers() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  👥 ALL FERNI USERS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const db = getFirestoreDb();
  if (!db) {
    console.log('❌ Firestore not initialized');
    return;
  }

  const usersSnapshot = await db.collection('bogle_users').limit(50).get();
  
  console.log(`Found ${usersSnapshot.size} users:\n`);
  
  for (const doc of usersSnapshot.docs) {
    const userId = doc.id;
    const data = doc.data();
    
    // Get some context about this user
    const name = data.name || data.preferredName || 'Unknown';
    const email = data.email || '-';
    const conversations = data.totalConversations || 0;
    const lastContact = data.lastContact?.toDate?.()?.toISOString?.()?.slice(0, 10) || '-';
    
    // Count subcollections
    const memoriesCount = (await db.collection('bogle_users').doc(userId).collection('memories').limit(1).get()).size;
    const contactsCount = (await db.collection('bogle_users').doc(userId).collection('contacts').limit(1).get()).size;
    const sessionsCount = (await db.collection('bogle_users').doc(userId).collection('sessions').limit(1).get()).size;
    
    console.log(`📧 ${userId}`);
    console.log(`   Name: ${name} | Email: ${email}`);
    console.log(`   Conversations: ${conversations} | Last contact: ${lastContact}`);
    console.log(`   Has: ${memoriesCount > 0 ? '✅memories ' : ''}${contactsCount > 0 ? '✅contacts ' : ''}${sessionsCount > 0 ? '✅sessions' : ''}`);
    console.log();
  }

  console.log('═══════════════════════════════════════════════════════════════\n');
}

listAllUsers().catch(console.error);
