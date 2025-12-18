#!/usr/bin/env npx tsx
/**
 * Ferni Voice CLI - The CEO and His Team
 *
 * Connect to the REAL Ferni voice platform with full team capabilities.
 * Ferni leads the team and can bring in specialists when needed.
 *
 * Features:
 * - Full team: Ferni (CEO), Maya, Alex, Jordan, Peter, Nayan
 * - Live handoffs between team members
 * - All 70+ context builders
 * - Persistent memory
 * - Gemini Live STT + Cartesia TTS
 *
 * Prerequisites:
 *   1. Token server running: node token-server.js
 *   2. Agent running: pnpm agent:dev (or deployed to Cloud Run)
 *   3. brew install sox (for microphone capture)
 *
 * Usage:
 *   ferni voice                    # Talk to Ferni (CEO)
 *   ferni voice --persona maya     # Start with Maya
 *   ferni voice --team             # Show team roster
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
// ANSI COLORS & STYLES
// ============================================================================

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  // Standard colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  // Bright colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  // Background
  bgGreen: '\x1b[42m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
};

// Legacy alias for compatibility
const colors = c;

// ============================================================================
// THE TEAM - Ferni's Leadership Team
// ============================================================================

interface TeamMember {
  id: string;
  name: string;
  emoji: string;
  role: string;
  title: string;
  color: string;
  specialty: string;
}

const TEAM: Record<string, TeamMember> = {
  ferni: {
    id: 'ferni',
    name: 'Ferni',
    emoji: '🌿',
    role: 'CEO & Life Coach',
    title: 'Chief Executive Officer',
    color: c.green,
    specialty: 'Leadership, life direction, bringing in the right expert',
  },
  maya: {
    id: 'maya',
    name: 'Maya',
    emoji: '🦋',
    role: 'Habits Coach',
    title: 'Chief Habits Officer',
    color: c.magenta,
    specialty: 'Building habits, breaking bad ones, behavior change',
  },
  alex: {
    id: 'alex',
    name: 'Alex',
    emoji: '💬',
    role: 'Communications Coach',
    title: 'Chief Communications Officer',
    color: c.brightBlue,
    specialty: 'Difficult conversations, relationships, conflict resolution',
  },
  jordan: {
    id: 'jordan',
    name: 'Jordan',
    emoji: '📋',
    role: 'Life Planner',
    title: 'Chief Planning Officer',
    color: c.yellow,
    specialty: 'Goals, planning, productivity, time management',
  },
  peter: {
    id: 'peter',
    name: 'Peter',
    emoji: '🔬',
    role: 'Research Analyst',
    title: 'Chief Research Officer',
    color: c.cyan,
    specialty: 'Deep research, analysis, finding answers',
  },
  nayan: {
    id: 'nayan',
    name: 'Nayan',
    emoji: '🧘',
    role: 'Wisdom Sage',
    title: 'Chief Wisdom Officer',
    color: c.brightYellow,
    specialty: 'Philosophy, mindfulness, deeper meaning',
  },
};

// Current active persona (tracks handoffs)
let activePersona: TeamMember = TEAM.ferni;

// Session tracking
let sessionStartTime: number | null = null;
let turnCount = 0;
let handoffCount = 0;

// ============================================================================
// TEAM DISPLAY FUNCTIONS
// ============================================================================

function showTeamRoster(): void {
  console.log(`
${c.bold}${c.green}╔══════════════════════════════════════════════════════════════════╗
║                    🌿 FERNI'S LEADERSHIP TEAM                    ║
╚══════════════════════════════════════════════════════════════════╝${c.reset}
`);

  for (const member of Object.values(TEAM)) {
    const isActive = member.id === activePersona.id;
    const indicator = isActive ? `${c.brightGreen}●${c.reset}` : `${c.dim}○${c.reset}`;
    console.log(`  ${indicator} ${member.color}${member.emoji} ${member.name}${c.reset} - ${c.dim}${member.role}${c.reset}`);
    console.log(`      ${c.dim}${member.specialty}${c.reset}`);
    console.log();
  }

  console.log(`${c.dim}Ask Ferni to bring in any team member, or say "Let me talk to Maya"${c.reset}\n`);
}

function showHandoffTransition(from: TeamMember, to: TeamMember): void {
  console.log();
  console.log(`${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`  ${from.color}${from.emoji} ${from.name}${c.reset} ${c.dim}is handing off to${c.reset} ${to.color}${to.emoji} ${to.name}${c.reset}`);
  console.log(`  ${c.dim}${to.role} • ${to.specialty}${c.reset}`);
  console.log(`${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log();
}

function showActivePersona(): void {
  console.log(`\n  ${c.dim}Currently speaking with:${c.reset} ${activePersona.color}${activePersona.emoji} ${activePersona.name}${c.reset} ${c.dim}(${activePersona.role})${c.reset}\n`);
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function showStatus(): void {
  const duration = sessionStartTime ? formatDuration(Date.now() - sessionStartTime) : '0s';

  console.log(`
${c.bold}${c.green}Session Status${c.reset}
${c.dim}─────────────────────────────────────${c.reset}
  ${c.dim}Active:${c.reset}    ${activePersona.color}${activePersona.emoji} ${activePersona.name}${c.reset} ${c.dim}(${activePersona.role})${c.reset}
  ${c.dim}Duration:${c.reset}  ${duration}
  ${c.dim}Turns:${c.reset}     ${turnCount}
  ${c.dim}Handoffs:${c.reset}  ${handoffCount}
${c.dim}─────────────────────────────────────${c.reset}
`);
}

function showCommands(): void {
  console.log(`
${c.bold}${c.green}Available Commands${c.reset}
${c.dim}─────────────────────────────────────${c.reset}
  ${c.cyan}team${c.reset}      Show the team roster
  ${c.cyan}who${c.reset}       Who am I speaking with?
  ${c.cyan}status${c.reset}    Show session status
  ${c.cyan}help${c.reset}      Show these commands
  ${c.cyan}exit${c.reset}      End conversation
${c.dim}─────────────────────────────────────${c.reset}

${c.bold}Quick Switch (@ commands):${c.reset}
  ${c.green}@ferni${c.reset}    Switch to Ferni (CEO)
  ${c.magenta}@maya${c.reset}     Switch to Maya (Habits)
  ${c.brightBlue}@alex${c.reset}     Switch to Alex (Comms)
  ${c.yellow}@jordan${c.reset}   Switch to Jordan (Planning)
  ${c.cyan}@peter${c.reset}    Switch to Peter (Research)
  ${c.brightYellow}@nayan${c.reset}    Switch to Nayan (Wisdom)
${c.dim}─────────────────────────────────────${c.reset}

${c.dim}Voice Commands:${c.reset}
  ${c.dim}"Let me talk to Maya"${c.reset}  - Request handoff
  ${c.dim}"Take me to Ferni"${c.reset}     - Return to CEO
`);
}

// Quick persona switch animation
function showQuickSwitch(to: TeamMember): void {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;

  console.log();
  process.stdout.write(`  ${c.dim}Requesting ${to.color}${to.emoji} ${to.name}${c.reset}${c.dim}...${c.reset} `);

  const spinner = setInterval(() => {
    process.stdout.write(`\r  ${c.dim}Requesting ${to.color}${to.emoji} ${to.name}${c.reset}${c.dim}...${c.reset} ${frames[i]}`);
    i = (i + 1) % frames.length;
  }, 80);

  // Stop spinner after 2 seconds (agent should respond by then)
  setTimeout(() => {
    clearInterval(spinner);
    process.stdout.write(`\r  ${c.dim}Requesting ${to.color}${to.emoji} ${to.name}${c.reset}${c.dim}...${c.reset} ${c.green}sent${c.reset}\n\n`);
  }, 1500);
}

// Parse @ commands - returns persona if matched
function parseAtCommand(input: string): TeamMember | null {
  const match = input.match(/^@(\w+)$/i);
  if (!match) return null;

  const name = match[1].toLowerCase();
  return TEAM[name] || null;
}

function formatSpeaker(isAgent: boolean): string {
  if (isAgent) {
    return `${activePersona.color}${activePersona.emoji} ${activePersona.name}${c.reset}`;
  }
  return `${c.blue}You${c.reset}`;
}

// Detect persona from agent identity or data messages
function detectPersonaFromIdentity(identity: string): TeamMember | null {
  const lowerIdentity = identity.toLowerCase();
  for (const member of Object.values(TEAM)) {
    if (lowerIdentity.includes(member.id)) {
      return member;
    }
  }
  return null;
}

// Handle handoff data messages
function handleDataMessage(data: Uint8Array, debug: boolean): void {
  try {
    const msg = JSON.parse(new TextDecoder().decode(data));

    // Detect handoff events
    if (msg.type === 'handoff_start' || msg.type === 'handoff_initiated') {
      const targetId = msg.targetPersona || msg.target_persona || msg.to;
      if (targetId && TEAM[targetId]) {
        const oldPersona = activePersona;
        activePersona = TEAM[targetId];
        handoffCount++;
        showHandoffTransition(oldPersona, activePersona);
      }
    }

    // Detect handoff complete
    if (msg.type === 'handoff_complete' || msg.type === 'persona_changed') {
      const newId = msg.persona || msg.persona_id || msg.newPersona;
      if (newId && TEAM[newId] && TEAM[newId].id !== activePersona.id) {
        const oldPersona = activePersona;
        activePersona = TEAM[newId];
        handoffCount++;
        showHandoffTransition(oldPersona, activePersona);
      }
    }

    // Detect persona in agent greeting or state
    if (msg.type === 'agent_state' || msg.type === 'session_state') {
      const personaId = msg.persona || msg.persona_id;
      if (personaId && TEAM[personaId]) {
        activePersona = TEAM[personaId];
      }
    }

    if (debug) {
      console.log(`${c.dim}[DATA] ${JSON.stringify(msg).substring(0, 100)}${c.reset}`);
    }
  } catch {
    // Not JSON, ignore
  }
}

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
    sessionStartTime = Date.now();
    console.log(`${colors.green}Connected to room!${colors.reset}`);
  });

  room.on(RoomEvent.Disconnected, (reason?: string) => {
    console.log(`\n${colors.yellow}Disconnected: ${reason || 'unknown'}${colors.reset}`);
  });

  // Handle participants
  room.on(RoomEvent.ParticipantConnected, (participant) => {
    const detected = detectPersonaFromIdentity(participant.identity || '');
    if (detected) {
      activePersona = detected;
      console.log(`${detected.color}${detected.emoji} ${detected.name} joined${c.reset} ${c.dim}(${detected.role})${c.reset}`);
    } else {
      console.log(`${c.green}Agent joined: ${participant.identity}${c.reset}`);
    }
  });

  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    console.log(`${c.yellow}Agent left: ${participant.identity}${c.reset}`);
  });

  // Audio playback - buffer complete utterances then play
  const PLAYBACK_SAMPLE_RATE = 48000;
  const PLAYBACK_CHANNELS = 1;
  
  // Check which audio player is available (prefer sox's play for pipe support)
  let audioPlayerType: 'play' | 'afplay' | 'ffplay' = 'ffplay';
  try {
    execSync('which play', { stdio: 'pipe' });
    audioPlayerType = 'play';
  } catch {
    try {
      execSync('which afplay', { stdio: 'pipe' });
      audioPlayerType = 'afplay';
    } catch {
      audioPlayerType = 'ffplay';
    }
  }
  if (options.debug) {
    console.log(`${colors.dim}[AUDIO] Using player: ${audioPlayerType}${colors.reset}`);
  }
  
  // Temp file counter for afplay fallback
  let tempFileCounter = 0;
  
  // Play a complete audio buffer
  const playBufferedAudio = (audioData: Buffer): Promise<void> => {
    return new Promise((resolve) => {
      if (audioData.length < 1000) {
        resolve();
        return;
      }
      
      if (audioPlayerType === 'play') {
        // sox's play command - handles pipes well
        const player = spawn('play', [
          '-t', 'raw',
          '-b', '16',
          '-e', 'signed-integer',
          '-r', String(PLAYBACK_SAMPLE_RATE),
          '-c', String(PLAYBACK_CHANNELS),
          '-',
          '-q', // quiet
        ], { 
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        player.stdin?.on('error', () => {});
        player.stderr?.on('data', () => {});
        player.on('close', () => resolve());
        player.on('error', () => resolve());
        
        player.stdin?.write(audioData);
        player.stdin?.end();
      } else if (audioPlayerType === 'afplay') {
        // macOS native - needs temp file
        const fs = require('fs');
        const tempFile = `/tmp/ferni-audio-${process.pid}-${tempFileCounter++}.raw`;
        fs.writeFileSync(tempFile, audioData);
        
        // Convert to aiff using sox, then play with afplay
        const aiffFile = tempFile.replace('.raw', '.aiff');
        try {
          execSync(`sox -t raw -r ${PLAYBACK_SAMPLE_RATE} -b 16 -e signed -c ${PLAYBACK_CHANNELS} "${tempFile}" "${aiffFile}"`, { stdio: 'pipe' });
          const player = spawn('afplay', [aiffFile], { stdio: 'pipe' });
          player.on('close', () => {
            try { fs.unlinkSync(tempFile); } catch {}
            try { fs.unlinkSync(aiffFile); } catch {}
            resolve();
          });
          player.on('error', () => resolve());
        } catch {
          try { fs.unlinkSync(tempFile); } catch {}
          resolve();
        }
      } else {
        // ffplay fallback
        const player = spawn('ffplay', [
          '-f', 's16le',
          '-ar', String(PLAYBACK_SAMPLE_RATE),
          '-ac', String(PLAYBACK_CHANNELS),
          '-nodisp',
          '-autoexit',
          '-loglevel', 'quiet',
          '-i', 'pipe:0',
        ], { 
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        player.stdin?.on('error', () => {});
        player.stderr?.on('data', () => {});
        player.on('close', () => resolve());
        player.on('error', () => resolve());
        
        player.stdin?.write(audioData);
        player.stdin?.end();
      }
    });
  };
  
  // Track audio collection per utterance
  let audioCollectors: Map<string, Buffer[]> = new Map();
  let playbackQueue: Buffer[] = [];
  let isPlaying = false;
  
  // Process playback queue sequentially
  const processPlaybackQueue = async () => {
    if (isPlaying || playbackQueue.length === 0) return;
    isPlaying = true;
    
    while (playbackQueue.length > 0) {
      const audio = playbackQueue.shift();
      if (audio && audio.length > 0) {
        const durationMs = (audio.length / (PLAYBACK_SAMPLE_RATE * 2)) * 1000;
        if (options.debug) {
          console.log(`${c.dim}[AUDIO] Playing ${durationMs.toFixed(0)}ms${c.reset}`);
        }
        // Wait for actual playback to complete
        await playBufferedAudio(audio);
      }
    }
    
    isPlaying = false;
  };
  
  // Queue buffered audio for playback
  const queueAudioForPlayback = (trackId: string) => {
    const chunks = audioCollectors.get(trackId);
    if (!chunks || chunks.length === 0) return;
    
    const fullAudio = Buffer.concat(chunks);
    audioCollectors.delete(trackId);
    
    if (fullAudio.length > 1000) { // Only queue if substantial audio
      playbackQueue.push(fullAudio);
      processPlaybackQueue();
    }
  };

  // Handle audio tracks from agent - STREAM and PLAY in real-time
  room.on(RoomEvent.TrackSubscribed, async (track, _publication, participant) => {
    // Only handle audio tracks from the agent
    if (track.kind !== lk.TrackKind.KIND_AUDIO) return;
    if (!participant.identity?.includes('agent')) return;

    const trackId = `${participant.identity}-${track.sid || Date.now()}`;
    
    if (options.debug) {
      console.log(`${colors.dim}[AUDIO] Subscribed to audio track: ${trackId}${colors.reset}`);
    }
    
    // Real-time chunked playback - collect frames for 300ms then play
    const CHUNK_DURATION_MS = 300;
    const FRAMES_PER_CHUNK = Math.ceil((PLAYBACK_SAMPLE_RATE * CHUNK_DURATION_MS) / 1000 / 960); // ~15 frames per chunk
    let audioChunks: Buffer[] = [];
    let frameCount = 0;

    try {
      const { AudioStream } = lk;
      const audioStream = new AudioStream(track);

      // Process frames as they arrive, play in chunks
      for await (const frame of audioStream) {
        const samples = frame.data;
        const buffer = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
        audioChunks.push(buffer);
        frameCount++;
        
        // Every FRAMES_PER_CHUNK frames, queue for playback
        if (frameCount >= FRAMES_PER_CHUNK) {
          const chunk = Buffer.concat(audioChunks);
          audioChunks = [];
          frameCount = 0;
          
          if (chunk.length > 1000) {
            playbackQueue.push(chunk);
            processPlaybackQueue();
          }
        }
      }
      
      // Flush remaining audio when stream ends
      if (audioChunks.length > 0) {
        const finalChunk = Buffer.concat(audioChunks);
        if (finalChunk.length > 1000) {
          playbackQueue.push(finalChunk);
          processPlaybackQueue();
        }
      }
    } catch (err) {
      // Stream ended unexpectedly - flush remaining
      if (audioChunks.length > 0) {
        const finalChunk = Buffer.concat(audioChunks);
        if (finalChunk.length > 1000) {
          playbackQueue.push(finalChunk);
          processPlaybackQueue();
        }
      }
      if (options.debug) {
        console.log(`${colors.dim}[AUDIO] Stream ended: ${err}${colors.reset}`);
      }
    }
  });

  // Handle transcription (what the agent says and what we say)
  room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
    for (const segment of segments) {
      if (segment.final && segment.text) {
        const isAgent = participant?.identity?.includes('agent');
        const speaker = formatSpeaker(isAgent);
        console.log(`${speaker}: ${segment.text}`);
        turnCount++;
      }
    }
  });

  // Register text stream handler for transcriptions (newer API)
  room.registerTextStreamHandler('lk.transcription', async (reader, { identity }) => {
    const text = await reader.readAll();
    const isAgent = identity?.includes('agent');
    const speaker = formatSpeaker(isAgent);
    if (text.trim()) {
      console.log(`${speaker}: ${text}`);
      turnCount++;
    }
  });

  // Handle data messages (including handoffs)
  room.on(RoomEvent.DataReceived, (data) => {
    handleDataMessage(data, options.debug);
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
${c.green}Ready!${c.reset} Speak naturally - ${activePersona.color}${activePersona.emoji} ${activePersona.name}${c.reset} is listening.

${c.dim}Type${c.reset} help ${c.dim}for commands, or just start talking.${c.reset}
${c.dim}Say "Let me talk to Maya" to request a handoff.${c.reset}
`);

  // Keep alive and handle exit
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on('line', async (line) => {
    const cmd = line.trim().toLowerCase();

    if (cmd === 'exit' || cmd === 'quit') {
      console.log(`\n${c.dim}Disconnecting...${c.reset}`);
      cleanupAudio();
      await room.disconnect();
      dispose();
      console.log(`${activePersona.color}${activePersona.emoji} ${activePersona.name}${c.reset}: ${c.dim}Goodbye! Take care.${c.reset}\n`);
      process.exit(0);
    }

    if (cmd === 'team') {
      showTeamRoster();
      return;
    }

    if (cmd === 'who') {
      showActivePersona();
      return;
    }

    if (cmd === 'status') {
      showStatus();
      return;
    }

    if (cmd === 'help' || cmd === '?') {
      showCommands();
      return;
    }

    // @ command for quick persona switch
    const targetPersona = parseAtCommand(cmd);
    if (targetPersona) {
      // Check if already talking to this persona
      if (targetPersona.id === activePersona.id) {
        console.log(`\n  ${c.dim}Already speaking with ${activePersona.color}${activePersona.emoji} ${activePersona.name}${c.reset}\n`);
        return;
      }

      // Show animation
      showQuickSwitch(targetPersona);

      // Send handoff request via data channel
      try {
        const handoffRequest = JSON.stringify({
          type: 'handoff_request',
          source: 'cli',
          targetPersona: targetPersona.id,
          fromPersona: activePersona.id,
          timestamp: Date.now(),
        });

        await room.localParticipant?.publishData(
          new TextEncoder().encode(handoffRequest),
          { reliable: true }
        );

        if (options.debug) {
          console.log(`${c.dim}[DEBUG] Sent handoff_request for ${targetPersona.id}${c.reset}`);
        }
      } catch (err) {
        console.log(`${c.red}Failed to send switch request${c.reset}`);
        if (options.debug) {
          console.log(`${c.dim}${err}${c.reset}`);
        }
      }
      return;
    }

    // Unknown command - show suggestions
    if (cmd.startsWith('@')) {
      const attemptedName = cmd.slice(1);
      console.log(`\n  ${c.yellow}Unknown team member: ${attemptedName}${c.reset}`);
      console.log(`  ${c.dim}Available: @ferni, @maya, @alex, @jordan, @peter, @nayan${c.reset}\n`);
    }
  });

  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    console.log(`\n${c.dim}Disconnecting...${c.reset}`);
    cleanupAudio();
    await room.disconnect();
    dispose();
    console.log(`${activePersona.color}${activePersona.emoji} ${activePersona.name}${c.reset}: ${c.dim}Goodbye! Take care.${c.reset}\n`);
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

  // Show team roster if requested
  if (args.includes('--team') || args.includes('-t')) {
    showTeamRoster();
    return;
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${c.bold}${c.green}Ferni Voice CLI${c.reset} - ${c.dim}The CEO and His Team${c.reset}

Talk to Ferni, the CEO, and his leadership team. Ferni can bring in
specialists when you need specific expertise.

${c.bold}Usage:${c.reset}
  ferni voice                    # Talk to Ferni (CEO)
  ferni voice --persona maya     # Start with Maya
  ferni voice --team             # Show team roster
  ferni voice --debug            # Show debug info

${c.bold}Prerequisites:${c.reset}
  1. Token server: node token-server.js
  2. Agent: pnpm agent:dev

${c.bold}The Team:${c.reset}
  ${TEAM.ferni.color}${TEAM.ferni.emoji} ${TEAM.ferni.name}${c.reset}   - ${c.dim}CEO & Life Coach (default)${c.reset}
  ${TEAM.maya.color}${TEAM.maya.emoji} ${TEAM.maya.name}${c.reset}    - ${c.dim}Habits Coach${c.reset}
  ${TEAM.alex.color}${TEAM.alex.emoji} ${TEAM.alex.name}${c.reset}    - ${c.dim}Communications Coach${c.reset}
  ${TEAM.jordan.color}${TEAM.jordan.emoji} ${TEAM.jordan.name}${c.reset}  - ${c.dim}Life Planner${c.reset}
  ${TEAM.peter.color}${TEAM.peter.emoji} ${TEAM.peter.name}${c.reset}   - ${c.dim}Research Analyst${c.reset}
  ${TEAM.nayan.color}${TEAM.nayan.emoji} ${TEAM.nayan.name}${c.reset}   - ${c.dim}Wisdom Sage${c.reset}

${c.bold}Quick Switch:${c.reset}
  Type ${c.cyan}@maya${c.reset}, ${c.cyan}@alex${c.reset}, ${c.cyan}@jordan${c.reset}, ${c.cyan}@peter${c.reset}, ${c.cyan}@nayan${c.reset}, or ${c.cyan}@ferni${c.reset}
  Or say "Let me talk to Maya" to request a handoff.
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

  // Set initial persona from --persona flag
  if (TEAM[options.persona]) {
    activePersona = TEAM[options.persona];
  }

  console.log(`
${c.bold}${c.green}╔════════════════════════════════════════════════════════════════════╗
║  🌿 FERNI AI - Your Personal CEO                                   ║
║     One Agent to Lead Them All                                     ║
╚════════════════════════════════════════════════════════════════════╝${c.reset}

${c.dim}Starting with:${c.reset} ${activePersona.color}${activePersona.emoji} ${activePersona.name}${c.reset} ${c.dim}(${activePersona.role})${c.reset}

${c.dim}Platform capabilities:${c.reset}
  ${c.green}•${c.reset} 6 specialized team members
  ${c.green}•${c.reset} 70+ context builders
  ${c.green}•${c.reset} Persistent memory
  ${c.green}•${c.reset} Live handoffs between agents
  ${c.green}•${c.reset} Gemini Live STT + Cartesia TTS

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
  // Show team roster if requested
  if (args.includes('--team') || args.includes('-t')) {
    showTeamRoster();
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

  // Set initial persona from --persona flag
  if (TEAM[options.persona]) {
    activePersona = TEAM[options.persona];
  }

  // Same flow as main
  const roomName = `cli-voice-${Date.now()}`;
  const username = `cli-user-${Math.random().toString(36).slice(2, 6)}`;

  console.log(`
${c.bold}${c.green}╔════════════════════════════════════════════════════════════════════╗
║  🌿 FERNI AI - Your Personal CEO                                   ║
║     One Agent to Lead Them All                                     ║
╚════════════════════════════════════════════════════════════════════╝${c.reset}

${c.dim}Starting with:${c.reset} ${activePersona.color}${activePersona.emoji} ${activePersona.name}${c.reset} ${c.dim}(${activePersona.role})${c.reset}
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
