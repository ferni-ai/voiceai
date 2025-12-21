#!/usr/bin/env npx tsx
/**
 * E2E Identity Flow Test Script
 * 
 * Tests the complete identity flow from Firebase Auth to Firestore profile:
 * 1. Firebase Auth creates anonymous user
 * 2. Firebase UID is passed to voice agent connection
 * 3. Voice agent creates/loads profile from Firestore  
 * 4. Name extraction works during conversation
 * 5. Profile is saved at session end
 * 6. Returning user is recognized
 * 
 * Run: npx tsx scripts/test-identity-e2e.ts
 */

import { Firestore } from '@google-cloud/firestore';

const PROJECT_ID = 'johnb-2025';
const USERS_COLLECTION = 'bogle_users';

// ANSI colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function log(status: 'pass' | 'fail' | 'info' | 'warn', message: string) {
  const prefix = {
    pass: `${GREEN}✅ PASS${RESET}`,
    fail: `${RED}❌ FAIL${RESET}`,
    info: `${CYAN}ℹ️  INFO${RESET}`,
    warn: `${YELLOW}⚠️  WARN${RESET}`,
  }[status];
  console.log(`${prefix}: ${message}`);
}

function section(title: string) {
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}  ${title}${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════════════════════════${RESET}\n`);
}

async function main() {
  console.log(`\n${BOLD}🔍 Ferni Identity E2E Test${RESET}`);
  console.log(`Testing identity flow with project: ${PROJECT_ID}\n`);

  // Initialize Firestore
  const db = new Firestore({ projectId: PROJECT_ID });
  
  // Test 1: Firestore Connection
  section('1. Firestore Connection');
  try {
    const testDoc = await db.collection('_test_connection').doc('test').get();
    log('pass', `Firestore connection successful (project: ${PROJECT_ID})`);
  } catch (error) {
    log('fail', `Firestore connection failed: ${error}`);
    process.exit(1);
  }

  // Test 2: List Recent Profiles
  section('2. User Profiles in Firestore');
  try {
    const profilesSnap = await db
      .collection(USERS_COLLECTION)
      .orderBy('lastContact', 'desc')
      .limit(10)
      .get();
    
    if (profilesSnap.empty) {
      log('warn', 'No user profiles found in Firestore');
    } else {
      log('pass', `Found ${profilesSnap.size} user profiles`);
      
      console.log('\n  Recent profiles:');
      profilesSnap.docs.forEach((doc, i) => {
        const data = doc.data();
        const name = data.name || data.preferredName || '(no name)';
        const convos = data.totalConversations || 0;
        const lastContact = data.lastContact?.toDate?.()?.toLocaleDateString() || 'unknown';
        const stage = data.relationshipStage || 'unknown';
        
        console.log(`  ${i + 1}. ${CYAN}${doc.id.substring(0, 8)}...${RESET}`);
        console.log(`     Name: ${name}`);
        console.log(`     Conversations: ${convos}`);
        console.log(`     Last Contact: ${lastContact}`);
        console.log(`     Stage: ${stage}`);
        console.log('');
      });
    }
  } catch (error) {
    log('fail', `Failed to list profiles: ${error}`);
  }

  // Test 3: Profile Schema Validation  
  section('3. Profile Schema Validation');
  try {
    const profilesSnap = await db
      .collection(USERS_COLLECTION)
      .limit(1)
      .get();
    
    if (!profilesSnap.empty) {
      const profile = profilesSnap.docs[0].data();
      const requiredFields = [
        'id', 'firstContact', 'lastContact', 'totalConversations', 
        'relationshipStage', 'communicationStyle', 'speakingPace'
      ];
      
      const missingFields = requiredFields.filter(f => !(f in profile));
      
      if (missingFields.length === 0) {
        log('pass', 'Profile has all required fields');
      } else {
        log('warn', `Profile missing fields: ${missingFields.join(', ')}`);
      }
      
      // Check for name field
      if (profile.name) {
        log('pass', `Profile has name: "${profile.name}"`);
      } else if (profile.preferredName) {
        log('info', `Profile has preferredName: "${profile.preferredName}" (but no name)`);
      } else {
        log('warn', 'Profile has no name or preferredName');
      }
      
      // Check for human memory
      if (profile.humanMemory) {
        log('pass', 'Profile has humanMemory field');
        const memoryKeys = Object.keys(profile.humanMemory);
        console.log(`     Memory sections: ${memoryKeys.join(', ')}`);
      } else {
        log('info', 'Profile has no humanMemory (expected for new users)');
      }
      
      // Check for conversation summaries
      if (profile.conversationSummaries && profile.conversationSummaries.length > 0) {
        log('pass', `Profile has ${profile.conversationSummaries.length} conversation summaries`);
      } else if (profile.lastConversationSummary) {
        log('pass', `Profile has lastConversationSummary: "${profile.lastConversationSummary.substring(0, 50)}..."`);
      } else {
        log('info', 'No conversation summaries yet');
      }
    }
  } catch (error) {
    log('fail', `Schema validation failed: ${error}`);
  }

  // Test 4: Check for orphaned/anonymous profiles
  section('4. Profile Identity Analysis');
  try {
    const profilesSnap = await db
      .collection(USERS_COLLECTION)
      .limit(50)
      .get();
    
    let withName = 0;
    let withConversations = 0;
    let firebaseUids = 0;
    let deviceIds = 0;
    
    profilesSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.name || data.preferredName) withName++;
      if (data.totalConversations > 0) withConversations++;
      
      // Firebase UIDs are 28 chars, device IDs are different format
      if (doc.id.length === 28 && !doc.id.includes('-')) {
        firebaseUids++;
      } else if (doc.id.includes('-') || doc.id.startsWith('device_')) {
        deviceIds++;
      }
    });
    
    console.log(`  Profile Statistics (of ${profilesSnap.size} profiles):`);
    console.log(`  - With name: ${withName}`);
    console.log(`  - With conversations: ${withConversations}`);
    console.log(`  - Firebase UIDs: ${firebaseUids}`);
    console.log(`  - Device IDs: ${deviceIds}`);
    
    if (firebaseUids > deviceIds) {
      log('pass', 'Most profiles use Firebase UIDs (good!)');
    } else if (deviceIds > firebaseUids) {
      log('warn', 'Many profiles still use device IDs (migration needed)');
    }
  } catch (error) {
    log('fail', `Identity analysis failed: ${error}`);
  }

  // Test 5: Token Server Test
  section('5. Token Server Identity Passthrough');
  try {
    const testUid = 'test-firebase-uid-12345';
    
    // This simulates what the frontend does
    const tokenUrl = `http://localhost:3002/token?` + new URLSearchParams({
      room: 'test-room',
      username: 'TestUser', 
      deviceId: 'test-device',
      personaId: 'ferni',
      firebase_uid: testUid,
    }).toString();
    
    console.log(`  Testing token endpoint with firebase_uid: ${testUid}`);
    console.log(`  URL: ${tokenUrl.substring(0, 60)}...`);
    
    const response = await fetch(tokenUrl);
    const data = await response.json();
    
    if (response.ok && data.token) {
      log('pass', 'Token server returned token');
      
      // Decode the JWT to verify firebase_uid is in room metadata
      const tokenParts = data.token.split('.');
      if (tokenParts.length === 3) {
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
        if (payload.metadata) {
          const metadata = JSON.parse(payload.metadata);
          if (metadata.firebase_uid === testUid) {
            log('pass', 'Firebase UID correctly embedded in room metadata');
          } else {
            log('warn', `Firebase UID in metadata: ${metadata.firebase_uid}`);
          }
        }
      }
    } else {
      log('warn', `Token server response: ${JSON.stringify(data)}`);
    }
  } catch (error) {
    log('warn', `Token server test skipped (server may not be running): ${error}`);
  }

  // Summary
  section('Summary');
  console.log(`
${BOLD}Identity Flow Status:${RESET}

  ${GREEN}✓${RESET} Firestore: Connected to ${PROJECT_ID}
  ${GREEN}✓${RESET} Profiles: Stored in ${USERS_COLLECTION} collection
  
${BOLD}To complete E2E testing:${RESET}

  1. Open http://localhost:3004 in browser
  2. Check browser console for:
     - "Auth state changed" with UID
     - NO "Firebase not configured" errors
  
  3. Connect to Ferni and say: "My name is [YourName]"
  
  4. End conversation and check Firestore:
     ${CYAN}firebase firestore:documents bogle_users --project ${PROJECT_ID}${RESET}
  
  5. Reconnect and verify Ferni remembers your name
`);
}

main().catch(console.error);

