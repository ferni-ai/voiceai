/**
 * Vibe Controller — server and agent calls
 *
 * Every call here goes to something that really exists:
 * - Spotify link status: GET /spotify/status?device_id= (src/servers/api/routes/spotify.ts)
 * - Playback: there is no HTTP playback API. Music plays inside the live call,
 *   so play/pause/skip/volume are `music_control` data messages to the voice
 *   agent (src/agents/voice-agent/data-channel-handler.ts). The agent confirms
 *   by sending music_state, which MusicStateManager tracks; we never assume.
 * - Lights: /api/vibe/lights{,/status}; thermostat: /api/ecobee/*.
 * Results are reported as confirmed by the server, never optimistically.
 */

import { apiGet, apiPost } from '../utils/api.js';
import { connectionService } from '../services/connection.service.js';
import { getMusicStateManager } from '../services/music-state-manager.js';

export type MusicAction = 'pause' | 'resume' | 'skip' | 'volume';

export interface MusicSnapshot {
  playing: boolean;
  track?: string;
  artist?: string;
}

export interface LightsStatus {
  connected: boolean;
  brightness: number;
  colorTemp: number;
}

export interface ThermostatStatus {
  connected: boolean;
  current?: number;
  target?: number;
  mode?: string;
}

/** Playback state as last confirmed by the agent (music_state events). */
export function getMusicSnapshot(): MusicSnapshot {
  const state = getMusicStateManager().getState();
  return {
    playing: state.state === 'playing' || state.state === 'ducking',
    track: state.currentTrack?.name,
    artist: state.currentTrack?.artist,
  };
}

/**
 * Ask the voice agent to control music. Returns false when there is no live
 * call to send it to (so the caller can say so instead of pretending).
 */
export function sendMusicControl(action: MusicAction, volume?: number): boolean {
  const participant = connectionService.getRoom()?.localParticipant;
  if (!participant) return false;
  const message = JSON.stringify(
    action === 'volume'
      ? { type: 'music_control', action, volume }
      : { type: 'music_control', action }
  );
  void participant.publishData(new TextEncoder().encode(message), { reliable: true });
  return true;
}

/** Whether this device has linked Spotify (null when the server couldn't be reached). */
export async function fetchSpotifyLinked(deviceId: string): Promise<boolean | null> {
  const response = await apiGet<{ linked?: boolean }>('/spotify/status', { device_id: deviceId });
  return response.ok && response.data ? response.data.linked === true : null;
}

export async function fetchLightsStatus(): Promise<LightsStatus | null> {
  const response = await apiGet<LightsStatus>('/api/vibe/lights/status');
  return response.ok && response.data ? response.data : null;
}

/** GET /api/ecobee/status → { connected, thermostat: { currentTemp, targetHeat, targetCool, mode } } */
export async function fetchThermostatStatus(): Promise<ThermostatStatus | null> {
  const response = await apiGet<{
    connected: boolean;
    thermostat?: {
      currentTemp?: number;
      targetHeat?: number;
      targetCool?: number;
      mode?: string;
    } | null;
  }>('/api/ecobee/status');
  if (!response.ok || !response.data) return null;
  const t = response.data.thermostat;
  return {
    connected: response.data.connected,
    current: t?.currentTemp,
    target: t?.targetHeat ?? t?.targetCool,
    mode: t?.mode,
  };
}

/** POST /api/vibe/lights — true only when the server says the lights changed. */
export async function setLights(settings: {
  brightness?: number;
  colorTemp?: number;
}): Promise<boolean> {
  const response = await apiPost<{ success: boolean }>('/api/vibe/lights', settings);
  return response.ok && response.data?.success === true;
}

/** POST /api/ecobee/temperature — true only when the thermostat accepted the hold. */
export async function setThermostat(target: number): Promise<boolean> {
  const response = await apiPost<{ success: boolean }>('/api/ecobee/temperature', {
    heat: target,
    cool: target + 3,
    holdType: 'nextTransition',
  });
  return response.ok && response.data?.success === true;
}

export interface PresetResult {
  /** Something in the room actually changed. */
  applied: boolean;
  lights: boolean;
  temperature: boolean;
  message?: string;
}

/** POST /api/vibe/activate. `applied` is false when the server changed nothing. */
export async function activatePresetOnServer(presetId: string): Promise<PresetResult | null> {
  const response = await apiPost<{
    success: boolean;
    message?: string;
    applied?: { music: boolean; lights: boolean; temperature: boolean };
  }>('/api/vibe/activate', { presetId });
  if (!response.data) return null;
  const applied = response.data.applied ?? { music: false, lights: false, temperature: false };
  return {
    applied:
      response.ok &&
      response.data.success &&
      (applied.music || applied.lights || applied.temperature),
    lights: applied.lights,
    temperature: applied.temperature,
    message: response.data.message,
  };
}
