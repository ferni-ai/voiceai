/**
 * Twilio Stream → LiveKit Bridge
 *
 * Enables two-way real-time conversations by:
 * 1. Twilio makes the outbound call
 * 2. Twilio streams audio via WebSocket to our server
 * 3. We bridge the audio to LiveKit for the AI agent
 * 4. Agent audio flows back through the same bridge
 *
 * This avoids the need for Twilio Elastic SIP Trunking ($$)
 *
 * @module twilio-stream-bridge
 */

import { WebSocket, WebSocketServer } from 'ws';
import { RoomServiceClient } from 'livekit-server-sdk';
import { createLogger } from '../../utils/safe-logger.js';
import { EventEmitter } from 'events';

const log = createLogger({ module: 'twilio-stream-bridge' });

// ============================================================================
// TYPES
// ============================================================================

export interface TwilioStreamMessage {
  event: 'connected' | 'start' | 'media' | 'stop' | 'mark' | 'dtmf';
  sequenceNumber?: string;
  streamSid?: string;
  start?: {
    streamSid: string;
    accountSid: string;
    callSid: string;
    tracks: string[];
    customParameters: Record<string, string>;
    mediaFormat: {
      encoding: string;
      sampleRate: number;
      channels: number;
    };
  };
  media?: {
    track: 'inbound' | 'outbound';
    chunk: string;
    timestamp: string;
    payload: string; // Base64 encoded audio (mulaw 8kHz)
  };
  mark?: {
    name: string;
  };
  dtmf?: {
    track: string;
    digit: string;
  };
}

export interface BridgeSession {
  callSid: string;
  streamSid: string;
  livekitRoomName: string;
  twilioWs: WebSocket;
  startedAt: Date;
  status: 'connecting' | 'active' | 'ended';
}

export interface BridgeConfig {
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  port?: number;
}

// ============================================================================
// AUDIO CONVERSION UTILITIES
// ============================================================================

/**
 * Convert μ-law (Twilio) to Linear PCM (LiveKit)
 * Twilio sends 8kHz μ-law, we need 16kHz or 48kHz linear PCM
 */
function mulawToLinear(mulawData: Buffer): Buffer {
  const MULAW_BIAS = 33;
  const MULAW_MAX = 0x1FFF;

  const linearData = Buffer.alloc(mulawData.length * 2);

  for (let i = 0; i < mulawData.length; i++) {
    // Decode μ-law
    let mulaw = ~mulawData[i];
    const sign = mulaw & 0x80;
    const exponent = (mulaw >> 4) & 0x07;
    const mantissa = mulaw & 0x0f;

    let linear = ((mantissa << 3) + MULAW_BIAS) << exponent;
    linear -= MULAW_BIAS;

    if (sign !== 0) {
      linear = -linear;
    }

    // Clamp to 16-bit signed
    linear = Math.max(-32768, Math.min(32767, linear));

    // Write as little-endian 16-bit
    linearData.writeInt16LE(linear, i * 2);
  }

  return linearData;
}

/**
 * Convert Linear PCM (LiveKit) to μ-law (Twilio)
 */
function linearToMulaw(linearData: Buffer): Buffer {
  const MULAW_BIAS = 33;
  const MULAW_MAX = 0x7F7F;
  const MULAW_TABLE = [
    0, 0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3,
    4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
    5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
    5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
    6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
    6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
    6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
    6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  ];

  const mulawData = Buffer.alloc(linearData.length / 2);

  for (let i = 0; i < mulawData.length; i++) {
    let sample = linearData.readInt16LE(i * 2);

    // Get the sign bit
    let sign = 0;
    if (sample < 0) {
      sign = 0x80;
      sample = -sample;
    }

    // Add bias
    sample += MULAW_BIAS;

    // Clip to max
    if (sample > MULAW_MAX) {
      sample = MULAW_MAX;
    }

    // Get exponent
    const exponent = MULAW_TABLE[(sample >> 7) & 0xFF];

    // Get mantissa
    const mantissa = (sample >> (exponent + 3)) & 0x0F;

    // Combine and complement
    mulawData[i] = ~(sign | (exponent << 4) | mantissa);
  }

  return mulawData;
}

/**
 * Upsample 8kHz to 16kHz (simple linear interpolation)
 */
function upsample8to16(input: Buffer): Buffer {
  const output = Buffer.alloc(input.length * 2);
  const samples = input.length / 2;

  for (let i = 0; i < samples - 1; i++) {
    const s1 = input.readInt16LE(i * 2);
    const s2 = input.readInt16LE((i + 1) * 2);

    output.writeInt16LE(s1, i * 4);
    output.writeInt16LE(Math.round((s1 + s2) / 2), i * 4 + 2);
  }

  // Last sample - just duplicate
  const last = input.readInt16LE((samples - 1) * 2);
  output.writeInt16LE(last, (samples - 1) * 4);
  output.writeInt16LE(last, (samples - 1) * 4 + 2);

  return output;
}

/**
 * Downsample 16kHz to 8kHz
 */
function downsample16to8(input: Buffer): Buffer {
  const output = Buffer.alloc(input.length / 2);
  const samples = input.length / 4; // 16-bit samples at 16kHz → 8kHz

  for (let i = 0; i < samples; i++) {
    const sample = input.readInt16LE(i * 4);
    output.writeInt16LE(sample, i * 2);
  }

  return output;
}

// ============================================================================
// TWILIO STREAM BRIDGE
// ============================================================================

export class TwilioStreamBridge extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private sessions: Map<string, BridgeSession> = new Map();
  private roomService: RoomServiceClient;
  private config: BridgeConfig;

  constructor(config: BridgeConfig) {
    super();
    this.config = config;
    this.roomService = new RoomServiceClient(
      config.livekitUrl,
      config.livekitApiKey,
      config.livekitApiSecret
    );
  }

  /**
   * Start the WebSocket server for Twilio streams
   * Use this for standalone mode (local testing)
   */
  start(port: number = 8765): void {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws, req) => {
      log.info({ url: req.url }, '🔌 New Twilio stream connection');
      this.handleConnection(ws, req.url || '');
    });

    this.wss.on('error', (error) => {
      log.error({ error: String(error) }, '❌ WebSocket server error');
    });

    log.info({ port }, '🚀 Twilio Stream Bridge started');
  }

  /**
   * Attach to an existing HTTP server for WebSocket upgrades
   * Use this for Cloud Run where only one port is available
   */
  attachToServer(httpServer: import('http').Server, path = '/stream'): void {
    // Create WebSocket server without its own HTTP server
    this.wss = new WebSocketServer({ noServer: true });

    this.wss.on('connection', (ws, req) => {
      log.info({ url: req.url }, '🔌 New Twilio stream connection');
      this.handleConnection(ws, req.url || '');
    });

    // Handle upgrade requests on the specified path
    httpServer.on('upgrade', (request, socket, head) => {
      const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;

      if (pathname === path || pathname.startsWith(`${path}/`)) {
        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          this.wss?.emit('connection', ws, request);
        });
      }
      // Let other paths be handled by other WebSocket servers
    });

    log.info({ path }, '🚀 Twilio Stream Bridge attached to HTTP server');
  }

  /**
   * Stop the bridge
   */
  async stop(): Promise<void> {
    // Close all sessions
    for (const [callSid, session] of this.sessions) {
      try {
        session.twilioWs.close();
        session.status = 'ended';
      } catch {
        // Ignore
      }
    }
    this.sessions.clear();

    // Close the server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    log.info('🛑 Twilio Stream Bridge stopped');
  }

  /**
   * Handle a new Twilio WebSocket connection
   */
  private handleConnection(ws: WebSocket, url: string): void {
    let session: BridgeSession | null = null;

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString()) as TwilioStreamMessage;

        switch (message.event) {
          case 'connected':
            log.debug('Twilio stream connected');
            break;

          case 'start':
            if (message.start) {
              session = await this.handleStreamStart(ws, message.start);
            }
            break;

          case 'media':
            if (session && message.media) {
              await this.handleMedia(session, message.media);
            }
            break;

          case 'dtmf':
            if (session && message.dtmf) {
              this.emit('dtmf', {
                callSid: session.callSid,
                digit: message.dtmf.digit,
              });
              log.info({ digit: message.dtmf.digit }, '🔢 DTMF detected');
            }
            break;

          case 'stop':
            if (session) {
              log.info({ callSid: session.callSid }, '📞 Stream stopped');
              session.status = 'ended';
              this.sessions.delete(session.callSid);
              this.emit('callEnded', { callSid: session.callSid });
            }
            break;
        }
      } catch (error) {
        log.error({ error: String(error) }, 'Error processing Twilio message');
      }
    });

    ws.on('close', () => {
      if (session) {
        log.info({ callSid: session.callSid }, '🔌 Twilio stream disconnected');
        session.status = 'ended';
        this.sessions.delete(session.callSid);
        this.emit('callEnded', { callSid: session.callSid });
      }
    });

    ws.on('error', (error) => {
      log.error({ error: String(error), callSid: session?.callSid }, '❌ WebSocket error');
    });
  }

  /**
   * Handle stream start - set up LiveKit room
   */
  private async handleStreamStart(
    ws: WebSocket,
    start: NonNullable<TwilioStreamMessage['start']>
  ): Promise<BridgeSession> {
    const { callSid, streamSid, customParameters } = start;

    log.info({ callSid, streamSid, customParameters }, '▶️ Stream starting');

    // Create or get LiveKit room name from custom parameters
    const roomName = customParameters?.roomName || `call_${callSid}`;

    // Ensure room exists
    try {
      await this.roomService.createRoom({
        name: roomName,
        emptyTimeout: 300, // 5 minutes
        maxParticipants: 10,
      });
    } catch (error) {
      // Room might already exist, that's fine
      log.debug({ roomName, error: String(error) }, 'Room creation (might already exist)');
    }

    const session: BridgeSession = {
      callSid,
      streamSid,
      livekitRoomName: roomName,
      twilioWs: ws,
      startedAt: new Date(),
      status: 'active',
    };

    this.sessions.set(callSid, session);

    this.emit('callStarted', {
      callSid,
      roomName,
      customParameters,
    });

    log.info({ callSid, roomName }, '✅ Bridge session created');

    return session;
  }

  /**
   * Handle incoming audio from Twilio
   * Convert μ-law 8kHz → Linear PCM 16kHz and forward to LiveKit
   */
  private async handleMedia(
    session: BridgeSession,
    media: NonNullable<TwilioStreamMessage['media']>
  ): Promise<void> {
    if (media.track !== 'inbound') {
      return; // Only process inbound (caller's voice)
    }

    // Decode base64 μ-law audio
    const mulawBuffer = Buffer.from(media.payload, 'base64');

    // Convert to linear PCM
    const linearBuffer = mulawToLinear(mulawBuffer);

    // Upsample to 16kHz
    const upsampledBuffer = upsample8to16(linearBuffer);

    // Forward to LiveKit (this would need a proper audio track)
    // For now, emit an event that the intelligent agent can handle
    this.emit('audioFromCaller', {
      callSid: session.callSid,
      roomName: session.livekitRoomName,
      audio: upsampledBuffer,
      timestamp: media.timestamp,
    });
  }

  /**
   * Send audio to Twilio (from LiveKit/agent)
   * Convert Linear PCM 16kHz → μ-law 8kHz and send to Twilio
   */
  sendAudioToCaller(callSid: string, linearPcm16k: Buffer): void {
    const session = this.sessions.get(callSid);
    if (!session || session.status !== 'active') {
      log.warn({ callSid }, 'No active session for audio send');
      return;
    }

    // Downsample from 16kHz to 8kHz
    const downsampled = downsample16to8(linearPcm16k);

    // Convert to μ-law
    const mulawBuffer = linearToMulaw(downsampled);

    // Encode as base64
    const payload = mulawBuffer.toString('base64');

    // Send to Twilio
    const message = {
      event: 'media',
      streamSid: session.streamSid,
      media: {
        payload,
      },
    };

    session.twilioWs.send(JSON.stringify(message));
  }

  /**
   * Send a mark event to Twilio (for sync/timing)
   */
  sendMark(callSid: string, markName: string): void {
    const session = this.sessions.get(callSid);
    if (!session || session.status !== 'active') {
      return;
    }

    const message = {
      event: 'mark',
      streamSid: session.streamSid,
      mark: {
        name: markName,
      },
    };

    session.twilioWs.send(JSON.stringify(message));
  }

  /**
   * Get active session info
   */
  getSession(callSid: string): BridgeSession | undefined {
    return this.sessions.get(callSid);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): BridgeSession[] {
    return Array.from(this.sessions.values());
  }
}

// ============================================================================
// TWIML GENERATOR FOR STREAM
// ============================================================================

/**
 * Generate TwiML that streams audio to our WebSocket bridge
 *
 * @param options.greetingAudioUrl - URL to pre-generated Ferni audio (Cartesia TTS)
 * @param options.greeting - Text fallback if no audio URL provided (uses Polly)
 */
export function generateStreamTwiml(options: {
  websocketUrl: string;
  roomName: string;
  greeting?: string;
  greetingAudioUrl?: string;
  voicemailGreeting?: string;
  voicemailAudioUrl?: string;
}): string {
  const { websocketUrl, roomName, greeting, greetingAudioUrl, voicemailGreeting, voicemailAudioUrl } = options;

  // Use <Play> for Ferni's Cartesia voice, fallback to <Say> with Polly
  const greetingElement = greetingAudioUrl
    ? `<Play>${escapeXml(greetingAudioUrl)}</Play><Pause length="0.3"/>`
    : greeting
      ? `<Say voice="Polly.Joanna">${escapeXml(greeting)}</Say><Pause length="0.5"/>`
      : '';

  const voicemailElement = voicemailAudioUrl
    ? `<Play>${escapeXml(voicemailAudioUrl)}</Play>`
    : voicemailGreeting
      ? `<Say voice="Polly.Joanna">${escapeXml(voicemailGreeting)}</Say>`
      : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${greetingElement}
  <Connect>
    <Stream url="${escapeXml(websocketUrl)}">
      <Parameter name="roomName" value="${escapeXml(roomName)}"/>
    </Stream>
  </Connect>
  ${voicemailElement}
</Response>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// SINGLETON
// ============================================================================

let bridgeInstance: TwilioStreamBridge | null = null;

export function getTwilioStreamBridge(config?: BridgeConfig): TwilioStreamBridge {
  if (!bridgeInstance && config) {
    bridgeInstance = new TwilioStreamBridge(config);
  }
  if (!bridgeInstance) {
    throw new Error('TwilioStreamBridge not initialized. Provide config on first call.');
  }
  return bridgeInstance;
}
