/**
 * LiveKit typing and accessor used by the connection service.
 * Extracted from connection.service.ts.
 */

import { Room, RoomEvent, Track } from 'livekit-client';

/** The slice of livekit-client the connection service uses. */
export interface LiveKitModule {
  Room: new (options?: Record<string, unknown>) => LiveKitRoom;
  RoomEvent: typeof RoomEventEnum;
  Track: { Kind: { Audio: string; Video: string } };
}

// LiveKit types from global - use 'any' for flexibility with event handlers
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface LiveKitRoom {
  state: string;
  name: string;
  localParticipant: {
    identity: string;
    setMicrophoneEnabled(enabled: boolean): Promise<void>;
    getTrackPublications(): any[];
    publishData(data: Uint8Array, options?: any): Promise<void>;
  };
  remoteParticipants: Map<string, any>;
  connect(url: string, token: string, options?: Record<string, unknown>): Promise<void>;
  disconnect(): Promise<void>;
  on(event: string, callback: (...args: any[]) => void): LiveKitRoom;
  off(event: string, callback: (...args: any[]) => void): LiveKitRoom;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const RoomEventEnum = {
  Connected: 'connected',
  Disconnected: 'disconnected',
  ConnectionStateChanged: 'connectionStateChanged',
  TrackSubscribed: 'trackSubscribed',
  DataReceived: 'dataReceived',
  ParticipantConnected: 'participantConnected',
  ParticipantDisconnected: 'participantDisconnected',
} as const;

// The bundled livekit-client (index.html used to load a second, vendored UMD
// copy as a render-blocking global just for this).
export const getLiveKit = (): LiveKitModule =>
  ({ Room, RoomEvent, Track }) as unknown as LiveKitModule;
