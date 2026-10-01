/**
 * Vibe Controller - API actions (music, lights, temperature, presets)
 */

import { apiGet, apiPost } from '../../utils/api.js';
import { toast } from '../whisper.ui.js';
import { t } from '../../i18n/index.js';
import { callbacks, currentState, loadingState, render } from './state.js';
import type { VibePresetUI } from './types.js';

// ============================================================================
// API FUNCTIONS
// ============================================================================

export async function fetchState(): Promise<void> {
  try {
    // Fetch music state
    const musicRes = await apiGet<{
      linked?: boolean;
      playing: boolean;
      track?: string;
      artist?: string;
      volume?: number;
    }>('/api/spotify/status');
    if (musicRes.ok && musicRes.data) {
      const { playing, track, artist, volume } = musicRes.data;
      currentState.music = {
        ...currentState.music,
        playing,
        track,
        artist,
        volume: volume ?? currentState.music.volume,
      };
    }

    // Fetch lights state via vibe API
    const lightsRes = await apiGet<{ connected: boolean; brightness: number; colorTemp: number }>(
      '/api/vibe/lights/status'
    );
    if (lightsRes.ok && lightsRes.data) {
      currentState.lights = { ...currentState.lights, ...lightsRes.data };
    }

    // Fetch thermostat state
    const thermoRes = await apiGet<{
      connected: boolean;
      current: number;
      target: number;
      mode: string;
    }>('/api/ecobee/status');
    if (thermoRes.ok && thermoRes.data) {
      currentState.temperature = { ...currentState.temperature, ...thermoRes.data };
    }
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to fetch vibe state:', error);
  }
}

export async function activatePreset(preset: VibePresetUI): Promise<void> {
  // Set loading state
  loadingState.activatingPreset = preset.id;
  currentState.activePreset = preset.id;
  render();

  toast.info(t('vibe.settingVibe', 'Setting {name} vibe...', { name: preset.name }));

  try {
    // Use the unified vibe activate endpoint
    const result = await apiPost<{
      success: boolean;
      message: string;
      applied: { music: boolean; lights: boolean; temperature: boolean };
    }>('/api/vibe/activate', { presetId: preset.id });

    if (result.ok && result.data?.success) {
      // Update local state based on what was applied
      if (result.data.applied.lights && preset.lights) {
        currentState.lights = { ...currentState.lights, ...preset.lights };
      }
      if (result.data.applied.temperature && preset.temperature) {
        currentState.temperature.target = preset.temperature.target;
      }

      toast.success(t('vibe.vibeSet', '{name} vibe set!', { name: preset.name }));
      callbacks.onVibeChanged?.(preset.id);
    } else {
      toast.warning(
        result.data?.message || t('vibe.couldNotFullySet', "Couldn't fully set the vibe")
      );
    }
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to activate preset:', error);
    toast.error(t('vibe.couldNotSetVibe', "Couldn't set that vibe. Try again?"));
  } finally {
    loadingState.activatingPreset = null;
    render();
  }
}

/** Toast for a failed Spotify call (by HTTP status); state is left as it was */
function showMusicError(status?: number): void {
  if (status === 412) {
    toast.warning(t('vibe.linkSpotifyFirst', 'Link Spotify first'));
  } else if (status === 409) {
    toast.warning(t('vibe.openSpotify', 'Open Spotify on a device first'));
  } else {
    toast.error(t('vibe.couldNotControlMusic', "Couldn't control music. Try again?"));
  }
}

export async function toggleMusic(): Promise<void> {
  const wasPlaying = currentState.music.playing;
  try {
    const res = await apiPost<{ success?: boolean; error?: string }>(
      wasPlaying ? '/api/spotify/pause' : '/api/spotify/play',
      {}
    );
    if (!res.ok) {
      showMusicError(res.status);
      return;
    }
    currentState.music.playing = !wasPlaying;
    render();
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to toggle music:', error);
    showMusicError();
  }
}

export async function skipTrack(): Promise<void> {
  try {
    const res = await apiPost<{ success?: boolean; error?: string }>('/api/spotify/skip', {});
    if (!res.ok) {
      showMusicError(res.status);
      return;
    }
    toast.info(t('vibe.skipped', 'Skipped'));
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to skip track:', error);
    showMusicError();
  }
}

export async function setMusicVolume(volume: number): Promise<void> {
  try {
    const res = await apiPost<{ success?: boolean; error?: string }>('/api/spotify/volume', {
      volume,
    });
    if (!res.ok) {
      showMusicError(res.status);
    }
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to set volume:', error);
  }
}

export async function setLightBrightness(brightness: number): Promise<void> {
  try {
    await apiPost('/api/vibe/lights', { brightness });
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to set brightness:', error);
  }
}

export async function setLightColorTemp(colorTemp: number): Promise<void> {
  try {
    await apiPost('/api/vibe/lights', { colorTemp });
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to set color temp:', error);
  }
}

export async function adjustTemperature(delta: number): Promise<void> {
  const newTarget = currentState.temperature.target + delta;
  currentState.temperature.target = newTarget;
  loadingState.adjustingTemperature = true;
  render();

  try {
    await apiPost('/api/ecobee/temperature', {
      heat: newTarget,
      cool: newTarget + 3,
      holdType: 'nextTransition',
    });
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to adjust temperature:', error);
    toast.error(t('vibe.couldNotChangeTemp', "Couldn't change temperature. Try again?"));
  } finally {
    loadingState.adjustingTemperature = false;
    render();
  }
}
