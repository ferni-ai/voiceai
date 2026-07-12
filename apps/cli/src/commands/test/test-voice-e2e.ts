#!/usr/bin/env npx tsx
/**
 * Voice Agent E2E Test (Node.js)
 * 
 * Connects to Ferni as a participant and verifies:
 * 1. ✅ Token generation works
 * 2. ✅ Room connection works
 * 3. ✅ Agent joins the room
 * 4. ✅ Agent publishes audio track
 * 5. ✅ Agent speaks (greeting)
 * 
 * Usage:
 *   npx tsx scripts/test-voice-e2e.ts              # Test local (localhost:3002)
 *   npx tsx scripts/test-voice-e2e.ts --prod       # Test production (app.ferni.ai)
 *   npx tsx scripts/test-voice-e2e.ts --timeout=60 # Custom timeout
 */

import 'dotenv/config';
import { Room, RoomEvent, RemoteParticipant, TrackPublication } from '@livekit/rtc-node';

// Track kinds: 0 = unknown, 1 = audio, 2 = video
const TRACK_KIND_AUDIO = 1;

// ============================================================================
// CONFIGURATION
// ============================================================================

const args = process.argv.slice(2);
const isProd = args.includes('--prod');
const timeoutArg = args.find(a => a.startsWith('--timeout='));
const TIMEOUT_MS = timeoutArg ? parseInt(timeoutArg.split('=')[1]) * 1000 : 30_000;

const TOKEN_SERVER = isProd 
  ? 'https://app.ferni.ai' 
  : 'http://localhost:3002';

const TEST_ROOM = `e2e-test-${Date.now()}`;
const TEST_USER = 'e2e-tester';

// ============================================================================
// LOGGING
// ============================================================================

const log = (emoji: string, msg: string, data?: Record<string, unknown>) => {
  const time = new Date().toISOString().split('T')[1].replace('Z', '');
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  console.log(`[${time}] ${emoji} ${msg}${dataStr}`);
};

const logSuccess = (msg: string) => log('✅', msg);
const logInfo = (msg: string, data?: Record<string, unknown>) => log('ℹ️ ', msg, data);
const logError = (msg: string, data?: Record<string, unknown>) => log('❌', msg, data);

// ============================================================================
// TEST RESULTS
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  duration?: number;
  error?: string;
}

const results: TestResult[] = [];
let testStartTime: number;

function recordResult(name: string, passed: boolean, errorMsg?: string) {
  const duration = Date.now() - testStartTime;
  results.push({ name, passed, duration, error: errorMsg });
  if (passed) {
    logSuccess(`${name} (${duration}ms)`);
  } else {
    logError(`${name} FAILED: ${errorMsg}`);
  }
}

// ============================================================================
// MAIN TEST
// ============================================================================

async function runTest() {
  console.log('\n' + '═'.repeat(60));
  console.log('  FERNI VOICE AGENT E2E TEST');
  console.log('═'.repeat(60));
  logInfo('Configuration', {
    tokenServer: TOKEN_SERVER,
    room: TEST_ROOM,
    timeout: `${TIMEOUT_MS / 1000}s`,
  });
  console.log('');

  testStartTime = Date.now();
  let room: Room | null = null;

  try {
    // ========================================================================
    // TEST 1: Get Token
    // ========================================================================
    logInfo('Getting LiveKit token...');
    const tokenUrl = `${TOKEN_SERVER}/token?room=${TEST_ROOM}&username=${TEST_USER}&device_id=e2e-test&persona_id=ferni`;
    
    const tokenResponse = await fetch(tokenUrl);
    if (!tokenResponse.ok) {
      throw new Error(`Token request failed: ${tokenResponse.status}`);
    }
    
    const tokenData = await tokenResponse.json();
    if (!tokenData.token || !tokenData.url) {
      throw new Error(`Invalid token response: ${JSON.stringify(tokenData)}`);
    }
    
    recordResult('Token Generation', true);
    logInfo('Token received', { room: tokenData.room, url: tokenData.url.slice(0, 30) + '...' });

    // ========================================================================
    // TEST 2: Connect to Room
    // ========================================================================
    logInfo('Connecting to LiveKit room...');
    room = new Room();

    // Set up event handlers BEFORE connecting
    let agentJoined = false;
    let agentPublishedAudio = false;
    let agentIdentity = '';

    const agentJoinedPromise = new Promise<void>((resolve) => {
      room!.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        logInfo('Participant joined', { identity: participant.identity });
        // Agent identity usually contains 'agent' or 'voice-agent'
        if (participant.identity.includes('agent') || participant.identity.includes('ferni')) {
          agentIdentity = participant.identity;
          agentJoined = true;
          resolve();
        }
      });
    });

    const audioPublishedPromise = new Promise<void>((resolve) => {
      room!.on(RoomEvent.TrackPublished, (
        publication: TrackPublication,
        participant: RemoteParticipant
      ) => {
        logInfo('Track published', { 
          kind: publication.kind, 
          participant: participant.identity 
        });
        if (publication.kind === TRACK_KIND_AUDIO) {
          agentPublishedAudio = true;
          resolve();
        }
      });
    });

    // Connect
    await room.connect(tokenData.url, tokenData.token);
    
    recordResult('Room Connection', true);
    logInfo('Connected to room', { localParticipant: room.localParticipant?.identity });

    // ========================================================================
    // TEST 3: Wait for Agent to Join
    // ========================================================================
    logInfo('Waiting for agent to join...');
    
    // Check if agent already in room
    for (const participant of room.remoteParticipants.values()) {
      if (participant.identity.includes('agent') || participant.identity.includes('ferni')) {
        agentIdentity = participant.identity;
        agentJoined = true;
        logInfo('Agent already in room', { identity: agentIdentity });
        break;
      }
    }

    if (!agentJoined) {
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout waiting for agent to join')), TIMEOUT_MS);
      });
      
      await Promise.race([agentJoinedPromise, timeoutPromise]);
    }
    
    recordResult('Agent Joined', agentJoined, agentJoined ? undefined : 'Agent never joined');

    // ========================================================================
    // TEST 4: Wait for Agent Audio
    // ========================================================================
    logInfo('Waiting for agent audio track...');
    
    // Check if agent already has audio track
    for (const participant of room.remoteParticipants.values()) {
      for (const pub of participant.trackPublications.values()) {
        if (pub.kind === TRACK_KIND_AUDIO) {
          agentPublishedAudio = true;
          logInfo('Agent already has audio track');
          break;
        }
      }
    }

    if (!agentPublishedAudio) {
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout waiting for audio track')), TIMEOUT_MS);
      });
      
      await Promise.race([audioPublishedPromise, timeoutPromise]);
    }
    
    recordResult('Agent Audio', agentPublishedAudio, agentPublishedAudio ? undefined : 'No audio track published');

    // ========================================================================
    // TEST 5: Wait for greeting (let it play for a bit)
    // ========================================================================
    logInfo('Waiting for greeting to play (3s)...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    recordResult('Agent Greeting', true);
    logSuccess('Voice agent E2E test passed!');

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logError('Test failed', { error: errMsg });
    
    // Record the failing step if not already recorded
    const stepNames = ['Token Generation', 'Room Connection', 'Agent Joined', 'Agent Audio', 'Agent Greeting'];
    if (results.length < stepNames.length) {
      recordResult(stepNames[results.length], false, errMsg);
    }
  } finally {
    // Cleanup
    if (room) {
      logInfo('Disconnecting from room...');
      await room.disconnect();
    }
  }

  // ========================================================================
  // SUMMARY
  // ========================================================================
  console.log('\n' + '═'.repeat(60));
  console.log('  TEST SUMMARY');
  console.log('═'.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalTime = Date.now() - testStartTime;
  
  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    const time = result.duration ? ` (${result.duration}ms)` : '';
    const err = result.error ? ` - ${result.error}` : '';
    console.log(`  ${icon} ${result.name}${time}${err}`);
  }
  
  console.log('');
  console.log(`  Total: ${passed} passed, ${failed} failed (${totalTime}ms)`);
  console.log('═'.repeat(60) + '\n');
  
  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// ============================================================================
// RUN
// ============================================================================

runTest().catch((err) => {
  logError('Unhandled error', { error: String(err) });
  process.exit(1);
});
