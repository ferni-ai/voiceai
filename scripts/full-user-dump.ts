#!/usr/bin/env npx tsx
/**
 * Full dump of everything Ferni knows about a user
 */

import { getFirestoreDb } from '../src/services/superhuman/firestore-utils.js';

async function fullUserDump() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  📋 COMPLETE FERNI DATA DUMP');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const db = getFirestoreDb();
  if (!db) {
    console.log('❌ Firestore not initialized');
    return;
  }

  const userId = process.env.FERNI_USER_ID || 'vdSfkCCXaiXpnVCvgKxHMYrNFr72';
  console.log(`👤 User ID: ${userId}\n`);

  // Get main profile
  console.log('════════════════════════════════════════════════════════════');
  console.log('📋 MAIN PROFILE');
  console.log('════════════════════════════════════════════════════════════\n');
  
  const profileDoc = await db.collection('bogle_users').doc(userId).get();
  if (profileDoc.exists) {
    const data = profileDoc.data() as Record<string, unknown>;
    
    // Key profile info
    console.log('IDENTITY:');
    console.log(`  Email: ${data.email}`);
    console.log(`  Name: ${data.name || '(not set)'}`);
    console.log(`  First contact: ${data.firstContact}`);
    console.log(`  Last contact: ${data.lastContact}`);
    console.log(`  Total conversations: ${data.totalConversations}`);
    console.log(`  Total minutes talked: ${data.totalMinutesTalked}`);
    console.log(`  Relationship stage: ${data.relationshipStage}`);
    
    console.log('\nCOMMUNICATION PREFERENCES:');
    console.log(`  Style: ${data.communicationStyle}`);
    console.log(`  Speaking pace: ${data.speakingPace}`);
    console.log(`  Humor appreciation: ${data.humorAppreciation}`);
    console.log(`  Preferred accent: ${(data.preferences as Record<string, unknown>)?.preferredAccent}`);
    
    console.log('\nLAST CONVERSATION SUMMARY:');
    console.log(`  ${data.lastConversationSummary || '(none)'}`);
    
    // Human memory
    const humanMemory = data.humanMemory as Record<string, unknown>;
    if (humanMemory) {
      console.log('\nHUMAN MEMORY (Deep Understanding):');
      
      const identity = humanMemory.identity as Record<string, unknown>;
      if (identity) {
        console.log('  Values:', JSON.stringify(identity.values));
        console.log('  Dreams:', JSON.stringify(identity.dreams));
        console.log('  Fears:', JSON.stringify(identity.fears));
      }
      
      const growthArc = humanMemory.growthArc as Record<string, unknown>;
      if (growthArc?.challenges) {
        console.log('  Active challenges:');
        (growthArc.challenges as Array<Record<string, unknown>>).forEach(c => {
          console.log(`    - ${c.challenge}`);
          console.log(`      Status: ${c.status}`);
        });
      }
      
      const emotionalSignature = humanMemory.emotionalSignature as Record<string, unknown>;
      if (emotionalSignature) {
        console.log('  Stress triggers:', JSON.stringify(emotionalSignature.stressTriggers));
        console.log('  Comfort patterns:', JSON.stringify(emotionalSignature.comfortPatterns));
      }
    }
    
    // Personal journey
    const personalJourney = data.personalJourney as Record<string, unknown>;
    if (personalJourney) {
      console.log('\nPERSONAL JOURNEY:');
      
      const rhythm = personalJourney.rhythm as Record<string, unknown>;
      if (rhythm?.sessions) {
        const sessions = rhythm.sessions as Record<string, unknown>;
        console.log(`  Current streak: ${sessions.currentStreak} sessions`);
        console.log(`  Longest streak: ${sessions.longestStreak} sessions`);
        console.log(`  Total sessions: ${sessions.totalCount}`);
      }
      
      const chapters = personalJourney.chapters as Record<string, unknown>;
      if (chapters?.currentChapter) {
        const chapter = chapters.currentChapter as Record<string, unknown>;
        console.log(`  Current chapter theme: ${chapter.theme}`);
        console.log(`  Key topics: ${JSON.stringify(chapter.keyTopics)}`);
        console.log(`  Dominant emotions: ${JSON.stringify(chapter.dominantEmotions)}`);
      }
      
      const seasonal = personalJourney.seasonal as Record<string, unknown>;
      if (seasonal?.timeAnchors) {
        console.log('  Time anchors (memorable moments):');
        (seasonal.timeAnchors as Array<Record<string, unknown>>).slice(0, 5).forEach(anchor => {
          console.log(`    - ${anchor.description}`);
        });
      }
    }
  }

  // Commitments
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('📌 COMMITMENTS (promises Ferni is tracking)');
  console.log('════════════════════════════════════════════════════════════\n');
  
  const commitments = await db.collection('bogle_users').doc(userId).collection('commitments').get();
  if (commitments.empty) {
    console.log('  No commitments tracked');
  } else {
    commitments.docs.forEach(doc => {
      const data = doc.data();
      console.log(`• ${data.statement || data.summary || data.content}`);
      console.log(`  Type: ${data.type || 'general'}`);
      console.log(`  Status: ${data.status || 'active'}`);
      console.log(`  Created: ${data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt}`);
      console.log();
    });
  }

  // Relationship network (cleaned up)
  console.log('════════════════════════════════════════════════════════════');
  console.log('👥 RELATIONSHIP NETWORK (people in your life)');
  console.log('════════════════════════════════════════════════════════════\n');
  
  const network = await db.collection('bogle_users').doc(userId).collection('relationship_network').get();
  if (network.empty) {
    console.log('  No relationships tracked');
  } else {
    // Filter out likely misclassifications (common words)
    const commonWords = ['and', 'to', 'the', 'a', 'an', 'for', 'in', 'on', 'at', 'is', 'was', 'here', 'there', 'bought', 'got', 'will', 'can'];
    network.docs.forEach(doc => {
      const data = doc.data();
      const name = (data.name || '').toLowerCase();
      if (!commonWords.includes(name)) {
        console.log(`• ${data.name} (${data.type || 'unknown'})`);
        if (data.aliases?.length > 0) console.log(`  Also known as: ${data.aliases.join(', ')}`);
        if (data.mentionCount) console.log(`  Mentioned: ${data.mentionCount} times`);
        if (data.context) console.log(`  Context: ${data.context}`);
        console.log();
      }
    });
  }

  // Contacts
  console.log('════════════════════════════════════════════════════════════');
  console.log('📱 CONTACTS');
  console.log('════════════════════════════════════════════════════════════\n');
  
  const contacts = await db.collection('bogle_users').doc(userId).collection('contacts').get();
  if (contacts.empty) {
    console.log('  No contacts stored');
  } else {
    contacts.docs.forEach(doc => {
      const data = doc.data();
      console.log(`• ${data.displayName || data.firstName || 'Unknown'}`);
      if (data.relationship) console.log(`  Relationship: ${data.relationship}`);
      if (data.phones?.length > 0) console.log(`  Phone: ${data.phones[0]?.number || data.phones[0]}`);
      if (data.emails?.length > 0) console.log(`  Email: ${data.emails[0]?.email || data.emails[0]}`);
      if (data.notes) console.log(`  Notes: ${data.notes}`);
      console.log();
    });
  }

  // Memories
  console.log('════════════════════════════════════════════════════════════');
  console.log('🧠 MEMORIES (things Ferni has learned)');
  console.log('════════════════════════════════════════════════════════════\n');
  
  const memories = await db.collection('bogle_users').doc(userId).collection('memories').limit(50).get();
  if (memories.empty) {
    console.log('  No explicit memories stored');
  } else {
    memories.docs.forEach(doc => {
      const data = doc.data();
      const type = data.type || 'general';
      const content = data.content || data.summary || data.text || 'No content';
      const confidence = data.confidence ? ` (${Math.round(data.confidence * 100)}% confident)` : '';
      console.log(`• [${type}]${confidence}: ${content}`);
    });
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

fullUserDump().catch(console.error);
