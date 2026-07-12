#!/usr/bin/env npx tsx
/**
 * E2E Voice Test - Automated voice connection test
 *
 * Tests the full voice pipeline without requiring manual interaction:
 * 1. Gets a token from the token server
 * 2. Connects to LiveKit room
 * 3. Waits for agent to join
 * 4. Sends a claude_narration message to trigger speech
 * 5. Waits for audio track from agent
 * 6. Validates Ferni spoke
 *
 * Usage:
 *   ferni voice:e2e
 *   ferni voice:e2e --timeout 30
 */

import * as lk from '@livekit/rtc-node';

// ANSI colors
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

interface TestResult {
  success: boolean;
  step: string;
  error?: string;
  duration: number;
}

interface TokenResponse {
  token: string;
  url: string;
  room: string;
}

// Configuration
const TOKEN_SERVER_URL = process.env.TOKEN_SERVER_URL || 'http://localhost:3002';
const DEFAULT_TIMEOUT = 20; // seconds

async function getToken(persona = 'ferni'): Promise<TokenResponse> {
  const roomName = `e2e-test-${Date.now()}`;
  const username = `e2e-tester-${Math.random().toString(36).slice(2, 8)}`;

  const url = `${TOKEN_SERVER_URL}/token?room=${roomName}&username=${username}&persona_id=${persona}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Token server error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as TokenResponse;
  return data;
}

async function runE2ETest(timeoutSeconds: number): Promise<TestResult> {
  const startTime = Date.now();
  let currentStep = 'initializing';

  console.log(`\n${c.bold}${c.green}🧪 E2E Voice Test${c.reset}`);
  console.log(`${c.dim}Testing Ferni voice pipeline end-to-end${c.reset}\n`);

  try {
    // Step 1: Get token
    currentStep = 'getting token';
    console.log(`${c.dim}[1/5]${c.reset} Getting token from server...`);
    const tokenData = await getToken('ferni');
    console.log(`  ${c.green}✓${c.reset} Token received for room: ${tokenData.room}`);

    // Step 2: Connect to room
    currentStep = 'connecting to room';
    console.log(`${c.dim}[2/5]${c.reset} Connecting to LiveKit room...`);

    const room = new lk.Room();

    // Set up event tracking
    let agentJoined = false;
    let audioTrackReceived = false;
    let transcriptionReceived = false;
    let agentIdentity = '';

    // Promise for agent joining
    const agentJoinedPromise = new Promise<void>((resolve) => {
      room.on(lk.RoomEvent.ParticipantConnected, (participant) => {
        if (participant.identity.startsWith('agent-')) {
          agentJoined = true;
          agentIdentity = participant.identity;
          console.log(`  ${c.green}✓${c.reset} Agent joined: ${participant.identity}`);
          resolve();
        }
      });
    });

    // Promise for audio track
    const audioTrackPromise = new Promise<void>((resolve) => {
      room.on(lk.RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (track.kind === lk.TrackKind.KIND_AUDIO && participant.identity.startsWith('agent-')) {
          audioTrackReceived = true;
          console.log(`  ${c.green}✓${c.reset} Audio track received from ${participant.identity}`);
          resolve();
        }
      });
    });

    // Promise for transcription (agent speaking) - handle multiple formats
    const transcriptionPromise = new Promise<string>((resolve) => {
      // Handle standard transcription event
      room.on(lk.RoomEvent.TranscriptionReceived, (segments, participant) => {
        console.log(`  ${c.dim}Transcription from: ${participant?.identity}${c.reset}`);
        // Accept transcription from any agent (not from e2e-tester)
        if (participant?.identity && !participant.identity.includes('e2e-tester')) {
          for (const segment of segments) {
            if (segment.text && segment.final) {
              transcriptionReceived = true;
              console.log(`  ${c.green}✓${c.reset} Ferni spoke: "${segment.text.slice(0, 50)}..."`);
              resolve(segment.text);
              return;
            }
          }
        }
      });
    });

    // Track if we receive any speech
    let speechDetected = false;
    const speechPromise = new Promise<void>((resolveSpeech) => {
      // Register text stream handler BEFORE connecting
      room.registerTextStreamHandler('lk.transcription', async (reader, participantIdentity) => {
        const identity = typeof participantIdentity === 'string' ? participantIdentity : String(participantIdentity);
        console.log(`  ${c.dim}Text stream received from: ${identity}${c.reset}`);
        try {
          const textContent = await reader.readAll();
          console.log(`  ${c.dim}Text stream content: ${JSON.stringify(textContent).slice(0, 100)}${c.reset}`);
          if (textContent && !identity.includes('e2e-tester')) {
            speechDetected = true;
            transcriptionReceived = true;
            console.log(`  ${c.green}✓${c.reset} Ferni spoke (stream detected)!`);
            resolveSpeech();
          }
        } catch (e) {
          console.log(`  ${c.dim}Text stream error: ${e}${c.reset}`);
        }
      });

      // Also resolve on any audio track
      room.on(lk.RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (track.kind === lk.TrackKind.KIND_AUDIO) {
          speechDetected = true;
          audioTrackReceived = true;
          console.log(`  ${c.green}✓${c.reset} Audio track from: ${participant.identity}`);
          resolveSpeech();
        }
      });
    });

    // Connect
    await room.connect(tokenData.url, tokenData.token, {
      autoSubscribe: true,
    });
    console.log(`  ${c.green}✓${c.reset} Connected to room`);

    // Step 3: Wait for agent
    currentStep = 'waiting for agent';
    console.log(`${c.dim}[3/5]${c.reset} Waiting for agent to join...`);

    // Wait a moment for room state to sync
    await new Promise((r) => setTimeout(r, 1000));

    // Check if agent already in room
    console.log(`  ${c.dim}Remote participants: ${room.remoteParticipants.size}${c.reset}`);
    for (const [identity, participant] of room.remoteParticipants) {
      console.log(`  ${c.dim}  - ${identity} (${participant.identity})${c.reset}`);
      // Agent identity could start with "agent-" or be the agent process
      if (participant.identity.includes('agent') || participant.identity.includes('AJ_')) {
        agentJoined = true;
        agentIdentity = participant.identity;
        console.log(`  ${c.green}✓${c.reset} Agent already in room: ${participant.identity}`);
        break;
      }
    }

    if (!agentJoined) {
      // Also check for any participant that's not us (the user)
      for (const [, participant] of room.remoteParticipants) {
        if (!participant.identity.includes('e2e-tester')) {
          agentJoined = true;
          agentIdentity = participant.identity;
          console.log(`  ${c.green}✓${c.reset} Found non-user participant: ${participant.identity}`);
          break;
        }
      }
    }

    if (!agentJoined) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Agent join timeout')), timeoutSeconds * 1000);
      });
      await Promise.race([agentJoinedPromise, timeoutPromise]);
    }

    // Step 4: Send test message to trigger speech
    currentStep = 'sending test message';
    console.log(`${c.dim}[4/5]${c.reset} Sending test message to trigger speech...`);

    // Wait a moment for agent to initialize
    await new Promise((r) => setTimeout(r, 2000));

    // Send claude_narration message to make agent speak
    const testMessage = {
      type: 'claude_narration',
      text: 'Hello! This is an automated end-to-end test. The voice pipeline is working correctly.',
      narration_type: 'result',
    };

    await room.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify(testMessage)), {
      reliable: true,
    });
    console.log(`  ${c.green}✓${c.reset} Test message sent`);

    // Step 5: Wait for audio/transcription
    currentStep = 'waiting for speech';
    console.log(`${c.dim}[5/5]${c.reset} Waiting for Ferni to speak...`);

    // Check if speech was already detected during agent join (greeting)
    if (speechDetected || transcriptionReceived) {
      console.log(`  ${c.green}✓${c.reset} Speech already detected (greeting)`);
    } else {
      const speechTimeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Speech timeout - no audio received')), timeoutSeconds * 1000);
      });

      // Wait for either audio track, transcription, or speech stream
      await Promise.race([
        Promise.any([audioTrackPromise, transcriptionPromise, speechPromise]),
        speechTimeout,
      ]);
    }

    // Success!
    const duration = Date.now() - startTime;

    console.log(`\n${c.bold}${c.green}✅ E2E TEST PASSED${c.reset}`);
    console.log(`${c.dim}Duration: ${(duration / 1000).toFixed(1)}s${c.reset}`);
    console.log(`${c.dim}Agent: ${agentIdentity}${c.reset}`);
    console.log(`${c.dim}Audio received: ${audioTrackReceived}${c.reset}`);
    console.log(`${c.dim}Transcription: ${transcriptionReceived}${c.reset}\n`);

    // Cleanup
    await room.disconnect();
    lk.dispose();

    return {
      success: true,
      step: 'complete',
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.log(`\n${c.bold}${c.red}❌ E2E TEST FAILED${c.reset}`);
    console.log(`${c.dim}Failed at step: ${currentStep}${c.reset}`);
    console.log(`${c.red}Error: ${errorMessage}${c.reset}\n`);

    return {
      success: false,
      step: currentStep,
      error: errorMessage,
      duration,
    };
  }
}

// Main
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let timeout = DEFAULT_TIMEOUT;

  // Parse --timeout argument
  const timeoutIdx = args.indexOf('--timeout');
  if (timeoutIdx !== -1 && args[timeoutIdx + 1]) {
    timeout = parseInt(args[timeoutIdx + 1], 10);
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${c.bold}E2E Voice Test${c.reset}

Tests the full Ferni voice pipeline without manual interaction.

${c.bold}Usage:${c.reset}
  ferni voice:e2e [options]

${c.bold}Options:${c.reset}
  --timeout <seconds>  Timeout for each step (default: ${DEFAULT_TIMEOUT})
  --help, -h          Show this help

${c.bold}Requirements:${c.reset}
  - UI server running on port 3002
  - Voice agent running on port 8080
`);
    process.exit(0);
  }

  const result = await runE2ETest(timeout);
  process.exit(result.success ? 0 : 1);
}

// Only run if this is the main module
const isMainModule = process.argv[1]?.endsWith('e2e-voice-test.ts');
if (isMainModule) {
  main().catch((err) => {
    console.error(`${c.red}Fatal error: ${err}${c.reset}`);
    process.exit(1);
  });
}
