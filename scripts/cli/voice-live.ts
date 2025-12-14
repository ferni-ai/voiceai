#!/usr/bin/env npx tsx
/**
 * Live Voice Conversation CLI
 *
 * Connect to the REAL Ferni voice agent - same platform as the web UI.
 * Uses LiveKit for real-time voice with full platform capabilities:
 * - All 70+ context builders
 * - Persistent memory
 * - Gemini Live STT
 * - Cartesia TTS
 *
 * Prerequisites:
 *   1. Token server running: node token-server.js
 *   2. Agent running: pnpm agent:dev (or deployed to Cloud Run)
 *   3. brew install sox portaudio (for audio)
 *
 * Usage:
 *   ferni voice                    # Talk to Ferni
 *   ferni voice --persona maya     # Talk to Maya
 */

import { config as dotenvConfig } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';
import { spawn, ChildProcess, execSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
  createWriteStream,
  readFileSync,
} from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(dirname(__dirname));

// Load environment
dotenvConfig({ path: join(PROJECT_ROOT, '.env') });

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  tokenServerUrl: process.env.CLI_TOKEN_SERVER || 'http://localhost:3001',
  livekitUrl: process.env.LIVEKIT_URL || '',
};

// ============================================================================
// COLORS
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// ============================================================================
// TOKEN FETCHING
// ============================================================================

interface TokenResponse {
  token: string;
  url: string;
  room?: string;
}

async function fetchToken(
  roomName: string,
  username: string,
  personaId: string
): Promise<TokenResponse> {
  // Token server uses query parameters, not POST body
  const params = new URLSearchParams({
    room: roomName,
    username,
    device_id: `cli-${Date.now()}`,
    persona_id: personaId,
  });

  const response = await fetch(`${CONFIG.tokenServerUrl}/token?${params}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token server error: ${response.status} - ${error}`);
  }

  return response.json();
}

// ============================================================================
// LIVEKIT CONNECTION
// ============================================================================

async function connectToRoom(
  token: string,
  url: string,
  options: { debug: boolean; persona: string }
): Promise<void> {
  // Dynamic import for the native module
  const lk = await import('@livekit/rtc-node');
  const { Room, RoomEvent, dispose } = lk;

  console.log(`${colors.dim}Connecting to LiveKit...${colors.reset}`);

  const room = new Room();

  // Handle connection events
  room.on(RoomEvent.Connected, () => {
    console.log(`${colors.green}Connected to room!${colors.reset}`);
  });

  room.on(RoomEvent.Disconnected, (reason?: string) => {
    console.log(`\n${colors.yellow}Disconnected: ${reason || 'unknown'}${colors.reset}`);
  });

  // Handle participants
  room.on(RoomEvent.ParticipantConnected, (participant) => {
    console.log(`${colors.green}Agent joined: ${participant.identity}${colors.reset}`);
  });

  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    console.log(`${colors.yellow}Agent left: ${participant.identity}${colors.reset}`);
  });

  // Handle transcription (what the agent says and what we say)
  room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
    for (const segment of segments) {
      if (segment.final && segment.text) {
        const isAgent = participant?.identity?.includes('agent');
        const speaker = isAgent ? `${colors.cyan}Ferni${colors.reset}` : `${colors.blue}You${colors.reset}`;
        console.log(`${speaker}: ${segment.text}`);
      }
    }
  });

  // Handle data messages
  room.on(RoomEvent.DataReceived, (data, participant) => {
    if (options.debug) {
      try {
        const msg = JSON.parse(new TextDecoder().decode(data));
        console.log(`${colors.dim}[DATA] ${JSON.stringify(msg).substring(0, 100)}${colors.reset}`);
      } catch {}
    }
  });

  // Handle audio tracks from agent
  room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
    if (options.debug) {
      console.log(
        `${colors.dim}[TRACK] Subscribed to ${track.kind} from ${participant.identity}${colors.reset}`
      );
    }
    // The rtc-node SDK handles audio playback through the system
  });

  // Connect
  try {
    await room.connect(url, token, {
      autoSubscribe: true,
    });
  } catch (err) {
    throw new Error(`Failed to connect: ${(err as Error).message}`);
  }

  console.log(`${colors.dim}Room: ${room.name}${colors.reset}`);
  console.log(`${colors.dim}Local: ${room.localParticipant?.identity}${colors.reset}`);

  // Publish microphone
  console.log(`${colors.dim}Enabling microphone...${colors.reset}`);

  try {
    const { LocalAudioTrack } = lk;
    const micTrack = await LocalAudioTrack.createMicrophoneTrack();
    await room.localParticipant?.publishTrack(micTrack);
    console.log(`${colors.green}Microphone active - start speaking!${colors.reset}`);
  } catch (err) {
    console.log(`${colors.yellow}Microphone error: ${(err as Error).message}${colors.reset}`);
    console.log(`${colors.dim}The agent may not be able to hear you.${colors.reset}`);
  }

  // Wait for agent
  const existingAgents = Array.from(room.remoteParticipants?.values() || []).filter((p) =>
    p.identity?.includes('agent')
  );

  if (existingAgents.length === 0) {
    console.log(`\n${colors.yellow}Waiting for agent to join...${colors.reset}`);
    console.log(`${colors.dim}Make sure the agent is running: pnpm agent:dev${colors.reset}\n`);
  }

  console.log(`
${colors.green}Ready!${colors.reset} Speak naturally - Ferni is listening.

${colors.dim}Type 'exit' to disconnect.${colors.reset}
`);

  // Keep alive and handle exit
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on('line', async (line) => {
    if (line.trim().toLowerCase() === 'exit' || line.trim().toLowerCase() === 'quit') {
      console.log(`\n${colors.dim}Disconnecting...${colors.reset}`);
      await room.disconnect();
      dispose();
      console.log(`${colors.green}Goodbye!${colors.reset}\n`);
      process.exit(0);
    }
  });

  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    console.log(`\n${colors.dim}Disconnecting...${colors.reset}`);
    await room.disconnect();
    dispose();
    console.log(`${colors.green}Goodbye!${colors.reset}\n`);
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

// ============================================================================
// MAIN
// ============================================================================

interface Options {
  persona: string;
  debug: boolean;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${colors.bold}Live Voice Conversation${colors.reset}

Talk to the REAL Ferni with full platform capabilities.

${colors.bold}Usage:${colors.reset}
  ferni voice                    # Talk to Ferni
  ferni voice --persona maya     # Talk to Maya
  ferni voice --debug            # Show debug info

${colors.bold}Prerequisites:${colors.reset}
  1. Token server: node token-server.js
  2. Agent: pnpm agent:dev

${colors.bold}Available Personas:${colors.reset}
  ferni    - Life coach (default)
  maya     - Habits coach
  alex     - Communications coach
  jordan   - Life planner
  peter    - Research analyst
  nayan    - Wisdom sage
`);
    return;
  }

  const options: Options = {
    persona: 'ferni',
    debug: args.includes('--debug') || args.includes('-d'),
  };

  const personaIdx = args.indexOf('--persona');
  if (personaIdx !== -1 && args[personaIdx + 1]) {
    options.persona = args[personaIdx + 1].toLowerCase();
  }

  console.log(`
${colors.bold}${colors.magenta}╔════════════════════════════════════════════════════════════╗
║  🎙️  Live Voice with Ferni                                  ║
╚════════════════════════════════════════════════════════════╝${colors.reset}

${colors.dim}Connecting to the REAL platform with:${colors.reset}
  ${colors.cyan}•${colors.reset} All 70+ context builders
  ${colors.cyan}•${colors.reset} Persistent memory
  ${colors.cyan}•${colors.reset} Gemini Live STT
  ${colors.cyan}•${colors.reset} Cartesia TTS

`);

  // Check if token server is running
  try {
    const healthCheck = await fetch(`${CONFIG.tokenServerUrl}/health`);
    if (!healthCheck.ok) throw new Error('unhealthy');
  } catch {
    console.log(`${colors.red}Token server not running!${colors.reset}`);
    console.log(`\n${colors.yellow}Start it with:${colors.reset}`);
    console.log(`${colors.dim}  node token-server.js${colors.reset}\n`);
    process.exit(1);
  }

  // Generate room name and identity
  const roomName = `cli-voice-${Date.now()}`;
  const username = `cli-user-${Math.random().toString(36).slice(2, 6)}`;

  console.log(`${colors.dim}Persona: ${options.persona}${colors.reset}`);
  console.log(`${colors.dim}Room: ${roomName}${colors.reset}`);

  // Fetch token
  console.log(`${colors.dim}Fetching token...${colors.reset}`);

  let tokenData: TokenResponse;
  try {
    tokenData = await fetchToken(roomName, username, options.persona);
  } catch (err) {
    console.log(`${colors.red}Failed to get token: ${(err as Error).message}${colors.reset}`);
    process.exit(1);
  }

  const livekitUrl = tokenData.url || CONFIG.livekitUrl;
  if (!livekitUrl) {
    console.log(`${colors.red}No LiveKit URL configured${colors.reset}`);
    process.exit(1);
  }

  // Connect
  try {
    await connectToRoom(tokenData.token, livekitUrl, options);
  } catch (err) {
    console.log(`${colors.red}Connection failed: ${(err as Error).message}${colors.reset}`);
    if (options.debug) {
      console.log(`${colors.dim}${(err as Error).stack}${colors.reset}`);
    }
    process.exit(1);
  }
}

// Export for CLI integration
export async function handleVoiceLive(args: string[]): Promise<void> {
  const options: Options = {
    persona: 'ferni',
    debug: args.includes('--debug') || args.includes('-d'),
  };

  const personaIdx = args.indexOf('--persona');
  if (personaIdx !== -1 && args[personaIdx + 1]) {
    options.persona = args[personaIdx + 1].toLowerCase();
  }

  // Same flow as main
  const roomName = `cli-voice-${Date.now()}`;
  const username = `cli-user-${Math.random().toString(36).slice(2, 6)}`;

  console.log(`
${colors.bold}${colors.magenta}╔════════════════════════════════════════════════════════════╗
║  🎙️  Live Voice with Ferni                                  ║
╚════════════════════════════════════════════════════════════╝${colors.reset}
`);

  try {
    const healthCheck = await fetch(`${CONFIG.tokenServerUrl}/health`);
    if (!healthCheck.ok) throw new Error('unhealthy');
  } catch {
    console.log(`${colors.red}Token server not running!${colors.reset}`);
    console.log(`${colors.yellow}Start it: node token-server.js${colors.reset}\n`);
    return;
  }

  console.log(`${colors.dim}Persona: ${options.persona}${colors.reset}`);

  let tokenData: TokenResponse;
  try {
    tokenData = await fetchToken(roomName, username, options.persona);
  } catch (err) {
    console.log(`${colors.red}Token error: ${(err as Error).message}${colors.reset}`);
    return;
  }

  const livekitUrl = tokenData.url || CONFIG.livekitUrl;
  if (!livekitUrl) {
    console.log(`${colors.red}No LiveKit URL${colors.reset}`);
    return;
  }

  await connectToRoom(tokenData.token, livekitUrl, options);
}

main().catch((err) => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  process.exit(1);
});
