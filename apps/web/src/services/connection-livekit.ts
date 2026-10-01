/**
 * LiveKit UMD global typing and accessor used by the connection service.
 * Extracted from connection.service.ts.
 */

// Use global LiveKit from UMD script (better iOS compatibility)
// The UMD script is loaded in index.html before this module
declare global {
  interface Window {
    LiveKit: {
      Room: new (options?: Record<string, unknown>) => LiveKitRoom;
      RoomEvent: typeof RoomEventEnum;
      Track: { Kind: { Audio: string; Video: string } };
    };
  }
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

// Get LiveKit from global (loaded via UMD script in index.html)
export const getLiveKit = () => {
  const liveKit = typeof window !== 'undefined' ? window.LiveKit : undefined;
  if (liveKit) {
    return liveKit;
  }
  throw new Error('LiveKit not loaded. Make sure the UMD script is included.');
};
