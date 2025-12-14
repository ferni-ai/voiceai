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

// Detect if running as SEA binary (shim URL) vs normal execution
const isSEA = import.meta.url.includes('ferni-sea-binary');
const __dirname = isSEA ? process.cwd() : dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = isSEA ? process.cwd() : dirname(dirname(__dirname));

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
// SOUND EFFECTS - Match frontend sound.ui.ts exactly
// ============================================================================

/**
 * Sound configurations matching frontend's Web Audio API synthesis.
 * Uses sox to generate matching tones with same frequencies, delays, and durations.
 */
interface SoundTone {
  frequency: number;
  delay: number;
  duration: number;
  volume: number;
}

interface SoundConfig {
  tones: SoundTone[];
  type: 'sine';
}

// Sound configs matching frontend sound.ui.ts exactly
const SOUND_CONFIGS: Record<string, SoundConfig> = {
  // C major chord ascending - connect feel
  connect: {
    type: 'sine',
    tones: [
      { frequency: 523.25, delay: 0, duration: 0.15, volume: 0.12 },     // C5
      { frequency: 659.25, delay: 0.08, duration: 0.15, volume: 0.12 },  // E5
      { frequency: 783.99, delay: 0.16, duration: 0.15, volume: 0.12 },  // G5
    ],
  },
  // Descending chord - disconnect feel
  disconnect: {
    type: 'sine',
    tones: [
      { frequency: 783.99, delay: 0, duration: 0.12, volume: 0.1 },      // G5
      { frequency: 659.25, delay: 0.06, duration: 0.12, volume: 0.1 },   // E5
      { frequency: 523.25, delay: 0.12, duration: 0.12, volume: 0.1 },   // C5
    ],
  },
  // Warm goodbye ceremony - Am7 → G/B → Cmaj7 resolution (~2s)
  goodbye: {
    type: 'sine',
    tones: [
      { frequency: 220.0, delay: 0, duration: 0.8, volume: 0.08 },       // A3 - Am7 root
      { frequency: 261.63, delay: 0.05, duration: 0.8, volume: 0.08 },   // C4 - Am7 color
      { frequency: 329.63, delay: 0.1, duration: 0.8, volume: 0.08 },    // E4 - Am7 fifth
      { frequency: 246.94, delay: 0.5, duration: 0.8, volume: 0.08 },    // B3 - G/B bass
      { frequency: 293.66, delay: 0.55, duration: 0.8, volume: 0.08 },   // D4 - G chord
      { frequency: 392.0, delay: 0.6, duration: 0.8, volume: 0.08 },     // G4 - G chord root
      { frequency: 261.63, delay: 1.0, duration: 0.8, volume: 0.08 },    // C4 - Cmaj7 root
      { frequency: 329.63, delay: 1.05, duration: 0.8, volume: 0.08 },   // E4 - Cmaj7
      { frequency: 392.0, delay: 1.1, duration: 0.8, volume: 0.08 },     // G4 - Cmaj7
      { frequency: 493.88, delay: 1.15, duration: 0.8, volume: 0.08 },   // B4 - Cmaj7 seventh
    ],
  },
  // Phone receiver click - tactile finality
  hangup: {
    type: 'sine',
    tones: [
      { frequency: 180, delay: 0, duration: 0.06, volume: 0.12 },        // Low thud
      { frequency: 420, delay: 0.015, duration: 0.06, volume: 0.12 },    // Mid click
      { frequency: 280, delay: 0.04, duration: 0.06, volume: 0.12 },     // Low resonance
    ],
  },
};

/**
 * Play a synthesized sound using sox, matching frontend pacing exactly.
 */
function playSound(soundName: 'connect' | 'disconnect' | 'goodbye' | 'hangup'): void {
  const config = SOUND_CONFIGS[soundName];
  if (!config) return;

  // Generate each tone with sox
  for (const tone of config.tones) {
    setTimeout(() => {
      // sox -n -d synth <duration> sine <freq> vol <volume>
      spawn('sox', [
        '-n',                           // No input file
        '-d',                           // Output to default audio device
        'synth', String(tone.duration), // Duration
        'sine', String(tone.frequency), // Waveform and frequency
        'vol', String(tone.volume),     // Volume
        'fade', 'q', '0.01', String(tone.duration), '0.05', // Quick fade in, longer fade out
      ], {
        stdio: 'ignore',
        detached: true,
      }).unref();
    }, tone.delay * 1000);
  }
}

/**
 * Perform the goodbye ceremony matching frontend exactly.
 * Plays: goodbye (2s warm chord) → 400ms pause → hangup (click)
 */
async function playGoodbyeCeremony(): Promise<void> {
  playSound('goodbye');
  // Wait for goodbye sound (~2s) + 400ms pause
  await new Promise((resolve) => setTimeout(resolve, 2400));
  playSound('hangup');
  // Small pause to let hangup sound play
  await new Promise((resolve) => setTimeout(resolve, 150));
}

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
    if (participant.identity?.includes('agent')) {
      playSound('connect');
    }
    console.log(`${colors.green}Agent joined: ${participant.identity}${colors.reset}`);
  });

  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    if (participant.identity?.includes('agent')) {
      playSound('disconnect');
    }
    console.log(`${colors.yellow}Agent left: ${participant.identity}${colors.reset}`);
  });

  // Track audio playback process for cleanup
  let audioPlayProcess: ChildProcess | null = null;

  // Handle audio tracks from agent - PIPE TO SPEAKERS
  room.on(RoomEvent.TrackSubscribed, async (track, publication, participant) => {
    // Only handle audio tracks from the agent
    if (track.kind !== lk.TrackKind.KIND_AUDIO) return;
    if (!participant.identity?.includes('agent')) return;

    if (options.debug) {
      console.log(`${colors.dim}[TRACK] Subscribed to audio from ${participant.identity}${colors.reset}`);
    }

    try {
      const { AudioStream } = lk;

      // Create audio stream to receive frames
      const audioStream = new AudioStream(track);

      // Spawn sox play process to play audio
      // Format: 16-bit signed PCM, 48kHz (LiveKit default), mono
      const PLAYBACK_SAMPLE_RATE = 48000;
      const PLAYBACK_CHANNELS = 1;

      audioPlayProcess = spawn('sox', [
        '-t', 'raw',              // Input is raw PCM
        '-b', '16',               // 16-bit
        '-e', 'signed-integer',   // Signed integers
        '-r', String(PLAYBACK_SAMPLE_RATE),  // Sample rate (48kHz default for LiveKit)
        '-c', String(PLAYBACK_CHANNELS),     // Mono
        '-',                      // Read from stdin
        '-d',                     // Output to default audio device (speakers)
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      audioPlayProcess.on('error', (err) => {
        console.log(`${colors.yellow}Audio playback error: ${err.message}${colors.reset}`);
      });

      audioPlayProcess.stderr?.on('data', (data) => {
        // Suppress sox WARN messages about audio format
        const msg = data.toString();
        if (!msg.includes('WARN') && options.debug) {
          console.log(`${colors.dim}[sox] ${msg}${colors.reset}`);
        }
      });

      console.log(`${colors.green}Audio playback active - you'll hear Ferni speak!${colors.reset}`);

      // Pipe audio frames to sox
      for await (const frame of audioStream) {
        if (audioPlayProcess && !audioPlayProcess.killed && audioPlayProcess.stdin) {
          // Convert samples to Buffer (16-bit signed PCM)
          const samples = frame.data;
          const buffer = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
          audioPlayProcess.stdin.write(buffer);
        }
      }
    } catch (err) {
      console.log(`${colors.yellow}Audio stream error: ${(err as Error).message}${colors.reset}`);
    }
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

  // Register text stream handler for transcriptions (newer API)
  room.registerTextStreamHandler('lk.transcription', async (reader, { identity }) => {
    const text = await reader.readAll();
    const isAgent = identity?.includes('agent');
    const speaker = isAgent ? `${colors.cyan}Ferni${colors.reset}` : `${colors.blue}You${colors.reset}`;
    if (text.trim()) {
      console.log(`${speaker}: ${text}`);
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

  // Publish microphone using sox for native audio capture
  console.log(`${colors.dim}Enabling microphone...${colors.reset}`);

  let micProcess: ChildProcess | null = null;

  try {
    const { AudioSource, LocalAudioTrack, AudioFrame, TrackPublishOptions, TrackSource } = lk;

    // Check if sox is available
    try {
      execSync('which sox', { stdio: 'pipe' });
    } catch {
      throw new Error('sox not installed. Install with: brew install sox');
    }

    // Create audio source (16kHz mono for speech)
    const SAMPLE_RATE = 16000;
    const CHANNELS = 1;
    const source = new AudioSource(SAMPLE_RATE, CHANNELS);
    const track = LocalAudioTrack.createAudioTrack('microphone', source);

    // Publish track
    const pubOptions = new TrackPublishOptions();
    pubOptions.source = TrackSource.SOURCE_MICROPHONE;
    await room.localParticipant?.publishTrack(track, pubOptions);

    // Start sox to capture mic audio as raw PCM
    micProcess = spawn(
      'sox',
      [
        '-d', // Default audio device (mic)
        '-t',
        'raw', // Output raw PCM
        '-b',
        '16', // 16-bit
        '-e',
        'signed-integer', // Signed integers
        '-r',
        String(SAMPLE_RATE), // Sample rate
        '-c',
        String(CHANNELS), // Mono
        '-', // Output to stdout
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    // Feed audio frames to LiveKit
    const FRAME_DURATION_MS = 20; // 20ms frames
    const SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_DURATION_MS) / 1000;
    const BYTES_PER_FRAME = SAMPLES_PER_FRAME * 2; // 16-bit = 2 bytes per sample
    let buffer = Buffer.alloc(0);

    micProcess.stdout?.on('data', (data: Buffer) => {
      buffer = Buffer.concat([buffer, data]);

      while (buffer.length >= BYTES_PER_FRAME) {
        const frameData = buffer.subarray(0, BYTES_PER_FRAME);
        buffer = buffer.subarray(BYTES_PER_FRAME);

        const int16Array = new Int16Array(frameData.buffer, frameData.byteOffset, SAMPLES_PER_FRAME);
        const frame = new AudioFrame(int16Array, SAMPLE_RATE, CHANNELS, SAMPLES_PER_FRAME);
        source.captureFrame(frame);
      }
    });

    micProcess.on('error', (err) => {
      console.log(`${colors.yellow}Mic process error: ${err.message}${colors.reset}`);
    });

    console.log(`${colors.green}Microphone active - start speaking!${colors.reset}`);
  } catch (err) {
    console.log(`${colors.yellow}Microphone error: ${(err as Error).message}${colors.reset}`);
    console.log(`${colors.dim}The agent may not be able to hear you.${colors.reset}`);
  }

  // Cleanup microphone and audio playback processes on exit
  const cleanupAudio = () => {
    if (micProcess && !micProcess.killed) {
      micProcess.kill();
    }
    if (audioPlayProcess && !audioPlayProcess.killed) {
      audioPlayProcess.kill();
    }
  };

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
      console.log(`\n${colors.dim}Saying goodbye...${colors.reset}`);
      cleanupAudio();
      await room.disconnect();
      dispose();
      // Play the warm goodbye ceremony (same as frontend app)
      await playGoodbyeCeremony();
      console.log(`${colors.green}Goodbye!${colors.reset}\n`);
      process.exit(0);
    }
  });

  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    console.log(`\n${colors.dim}Saying goodbye...${colors.reset}`);
    cleanupAudio();
    await room.disconnect();
    dispose();
    // Play the warm goodbye ceremony (same as frontend app)
    await playGoodbyeCeremony();
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
