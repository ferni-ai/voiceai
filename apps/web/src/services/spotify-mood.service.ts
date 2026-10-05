/**
 * Spotify Mood Integration Service
 *
 * Connects emotional weather to music recommendations.
 * Suggests playlists based on mood, energy, and persona.
 */

import { t } from '../i18n/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface MoodProfile {
  primary: 'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'stormy';
  energy: 'high' | 'medium' | 'low';
  tags?: string[];
}

export interface PlaylistRecommendation {
  id: string;
  name: string;
  description: string;
  mood: MoodProfile['primary'];
  energy: MoodProfile['energy'];
  spotifyUri?: string;
  previewUrl?: string;
  imageUrl?: string;
}

export interface MoodPlaylistMap {
  [mood: string]: {
    [energy: string]: PlaylistRecommendation[];
  };
}

// ============================================================================
// CURATED PLAYLISTS BY MOOD
// ============================================================================

const MOOD_PLAYLISTS: MoodPlaylistMap = {
  sunny: {
    high: [
      { id: 'sunny-high-1', name: t('spotifyMood.playlist.sunnyHigh1.name'), description: t('spotifyMood.playlist.sunnyHigh1.description'), mood: 'sunny', energy: 'high' },
      { id: 'sunny-high-2', name: t('spotifyMood.playlist.sunnyHigh2.name'), description: t('spotifyMood.playlist.sunnyHigh2.description'), mood: 'sunny', energy: 'high' },
      { id: 'sunny-high-3', name: t('spotifyMood.playlist.sunnyHigh3.name'), description: t('spotifyMood.playlist.sunnyHigh3.description'), mood: 'sunny', energy: 'high' },
    ],
    medium: [
      { id: 'sunny-med-1', name: t('spotifyMood.playlist.sunnyMed1.name'), description: t('spotifyMood.playlist.sunnyMed1.description'), mood: 'sunny', energy: 'medium' },
      { id: 'sunny-med-2', name: t('spotifyMood.playlist.sunnyMed2.name'), description: t('spotifyMood.playlist.sunnyMed2.description'), mood: 'sunny', energy: 'medium' },
    ],
    low: [
      { id: 'sunny-low-1', name: t('spotifyMood.playlist.sunnyLow1.name'), description: t('spotifyMood.playlist.sunnyLow1.description'), mood: 'sunny', energy: 'low' },
      { id: 'sunny-low-2', name: t('spotifyMood.playlist.sunnyLow2.name'), description: t('spotifyMood.playlist.sunnyLow2.description'), mood: 'sunny', energy: 'low' },
    ],
  },
  'partly-cloudy': {
    high: [
      { id: 'pc-high-1', name: t('spotifyMood.playlist.pcHigh1.name'), description: t('spotifyMood.playlist.pcHigh1.description'), mood: 'partly-cloudy', energy: 'high' },
      { id: 'pc-high-2', name: t('spotifyMood.playlist.pcHigh2.name'), description: t('spotifyMood.playlist.pcHigh2.description'), mood: 'partly-cloudy', energy: 'high' },
    ],
    medium: [
      { id: 'pc-med-1', name: t('spotifyMood.playlist.pcMed1.name'), description: t('spotifyMood.playlist.pcMed1.description'), mood: 'partly-cloudy', energy: 'medium' },
      { id: 'pc-med-2', name: t('spotifyMood.playlist.pcMed2.name'), description: t('spotifyMood.playlist.pcMed2.description'), mood: 'partly-cloudy', energy: 'medium' },
    ],
    low: [
      { id: 'pc-low-1', name: t('spotifyMood.playlist.pcLow1.name'), description: t('spotifyMood.playlist.pcLow1.description'), mood: 'partly-cloudy', energy: 'low' },
      { id: 'pc-low-2', name: t('spotifyMood.playlist.pcLow2.name'), description: t('spotifyMood.playlist.pcLow2.description'), mood: 'partly-cloudy', energy: 'low' },
    ],
  },
  cloudy: {
    high: [
      { id: 'cloudy-high-1', name: t('spotifyMood.playlist.cloudyHigh1.name'), description: t('spotifyMood.playlist.cloudyHigh1.description'), mood: 'cloudy', energy: 'high' },
    ],
    medium: [
      { id: 'cloudy-med-1', name: t('spotifyMood.playlist.cloudyMed1.name'), description: t('spotifyMood.playlist.cloudyMed1.description'), mood: 'cloudy', energy: 'medium' },
      { id: 'cloudy-med-2', name: t('spotifyMood.playlist.cloudyMed2.name'), description: t('spotifyMood.playlist.cloudyMed2.description'), mood: 'cloudy', energy: 'medium' },
    ],
    low: [
      { id: 'cloudy-low-1', name: t('spotifyMood.playlist.cloudyLow1.name'), description: t('spotifyMood.playlist.cloudyLow1.description'), mood: 'cloudy', energy: 'low' },
      { id: 'cloudy-low-2', name: t('spotifyMood.playlist.cloudyLow2.name'), description: t('spotifyMood.playlist.cloudyLow2.description'), mood: 'cloudy', energy: 'low' },
    ],
  },
  rainy: {
    high: [
      { id: 'rainy-high-1', name: t('spotifyMood.playlist.rainyHigh1.name'), description: t('spotifyMood.playlist.rainyHigh1.description'), mood: 'rainy', energy: 'high' },
    ],
    medium: [
      { id: 'rainy-med-1', name: t('spotifyMood.playlist.rainyMed1.name'), description: t('spotifyMood.playlist.rainyMed1.description'), mood: 'rainy', energy: 'medium' },
      { id: 'rainy-med-2', name: t('spotifyMood.playlist.rainyMed2.name'), description: t('spotifyMood.playlist.rainyMed2.description'), mood: 'rainy', energy: 'medium' },
    ],
    low: [
      { id: 'rainy-low-1', name: t('spotifyMood.playlist.rainyLow1.name'), description: t('spotifyMood.playlist.rainyLow1.description'), mood: 'rainy', energy: 'low' },
      { id: 'rainy-low-2', name: t('spotifyMood.playlist.rainyLow2.name'), description: t('spotifyMood.playlist.rainyLow2.description'), mood: 'rainy', energy: 'low' },
      { id: 'rainy-low-3', name: t('spotifyMood.playlist.rainyLow3.name'), description: t('spotifyMood.playlist.rainyLow3.description'), mood: 'rainy', energy: 'low' },
    ],
  },
  stormy: {
    high: [
      { id: 'stormy-high-1', name: t('spotifyMood.playlist.stormyHigh1.name'), description: t('spotifyMood.playlist.stormyHigh1.description'), mood: 'stormy', energy: 'high' },
      { id: 'stormy-high-2', name: t('spotifyMood.playlist.stormyHigh2.name'), description: t('spotifyMood.playlist.stormyHigh2.description'), mood: 'stormy', energy: 'high' },
    ],
    medium: [
      { id: 'stormy-med-1', name: t('spotifyMood.playlist.stormyMed1.name'), description: t('spotifyMood.playlist.stormyMed1.description'), mood: 'stormy', energy: 'medium' },
    ],
    low: [
      { id: 'stormy-low-1', name: t('spotifyMood.playlist.stormyLow1.name'), description: t('spotifyMood.playlist.stormyLow1.description'), mood: 'stormy', energy: 'low' },
      { id: 'stormy-low-2', name: t('spotifyMood.playlist.stormyLow2.name'), description: t('spotifyMood.playlist.stormyLow2.description'), mood: 'stormy', energy: 'low' },
    ],
  },
};

// ============================================================================
// PERSONA-SPECIFIC PLAYLIST MODIFIERS
// ============================================================================

interface PersonaMusicProfile {
  genreBoost: string[];
  moodShift?: Partial<Record<MoodProfile['primary'], MoodProfile['primary']>>;
  description: string;
}

const PERSONA_MUSIC_PROFILES: Record<string, PersonaMusicProfile> = {
  ferni: {
    genreBoost: ['ambient', 'folk', 'acoustic', 'nature sounds'],
    description: t('spotifyMood.persona.ferni.description'),
  },
  'alex-chen': {
    genreBoost: ['lo-fi', 'focus', 'instrumental', 'study beats'],
    description: t('spotifyMood.persona.alexChen.description'),
  },
  'maya-santos': {
    genreBoost: ['motivational', 'pop', 'upbeat', 'gym'],
    description: t('spotifyMood.persona.mayaSantos.description'),
  },
  'jordan-taylor': {
    genreBoost: ['indie', 'storytelling', 'singer-songwriter', 'narrative'],
    description: t('spotifyMood.persona.jordanTaylor.description'),
  },
  'nayan-patel': {
    genreBoost: ['meditation', 'classical', 'spa', 'healing'],
    description: t('spotifyMood.persona.nayanPatel.description'),
  },
  'peter-john': {
    genreBoost: ['spirituals', 'gospel', 'inspirational', 'choir'],
    description: t('spotifyMood.persona.peterJohn.description'),
  },
};

// ============================================================================
// SPOTIFY MOOD SERVICE CLASS
// ============================================================================

class SpotifyMoodService {
  private currentMood: MoodProfile | null = null;
  private currentPersonaId: string = 'ferni';

  /**
   * Set current mood from emotional weather
   */
  setMood(mood: MoodProfile): void {
    this.currentMood = mood;
  }

  /**
   * Set current persona for music style
   */
  setPersona(personaId: string): void {
    this.currentPersonaId = personaId;
  }

  /**
   * Get playlist recommendations based on current mood and persona
   */
  getRecommendations(count: number = 3): PlaylistRecommendation[] {
    if (!this.currentMood) {
      return this.getDefaultRecommendations(count);
    }

    const moodPlaylists = MOOD_PLAYLISTS[this.currentMood.primary];
    if (!moodPlaylists) {
      return this.getDefaultRecommendations(count);
    }

    const energyPlaylists = moodPlaylists[this.currentMood.energy] || moodPlaylists['medium'];
    if (!energyPlaylists || energyPlaylists.length === 0) {
      return this.getDefaultRecommendations(count);
    }

    // Apply persona influence to descriptions
    const personaProfile = PERSONA_MUSIC_PROFILES[this.currentPersonaId];
    const recommendations = energyPlaylists.slice(0, count).map(playlist => ({
      ...playlist,
      description: personaProfile 
        ? `${playlist.description} (${personaProfile.description})`
        : playlist.description,
    }));

    return recommendations;
  }

  /**
   * Get default recommendations when no mood is set
   */
  private getDefaultRecommendations(count: number): PlaylistRecommendation[] {
    const defaultPlaylists = MOOD_PLAYLISTS['partly-cloudy']?.['medium'];
    return defaultPlaylists?.slice(0, count) ?? [];
  }

  /**
   * Generate a prompt for suggesting music based on mood
   */
  getMoodMusicPrompt(): string | null {
    if (!this.currentMood) return null;

    const moodKeyMap: Record<MoodProfile['primary'], string> = {
      sunny: 'spotifyMood.moodDescription.sunny',
      'partly-cloudy': 'spotifyMood.moodDescription.partlyCloudy',
      cloudy: 'spotifyMood.moodDescription.cloudy',
      rainy: 'spotifyMood.moodDescription.rainy',
      stormy: 'spotifyMood.moodDescription.stormy',
    };

    const energyKeyMap: Record<MoodProfile['energy'], string> = {
      high: 'spotifyMood.energyDescription.high',
      medium: 'spotifyMood.energyDescription.medium',
      low: 'spotifyMood.energyDescription.low',
    };

    const moodDesc = t(moodKeyMap[this.currentMood.primary]);
    const energyDesc = t(energyKeyMap[this.currentMood.energy]);

    return t('spotifyMood.prompt', { mood: moodDesc, energy: energyDesc });
  }

  /**
   * Get Spotify search query based on mood
   */
  getSpotifySearchQuery(): string {
    if (!this.currentMood) return 'focus';

    const moodKeywords: Record<MoodProfile['primary'], string[]> = {
      sunny: ['happy', 'upbeat', 'positive'],
      'partly-cloudy': ['focus', 'productive', 'balanced'],
      cloudy: ['contemplative', 'introspective', 'thinking'],
      rainy: ['melancholic', 'emotional', 'sad'],
      stormy: ['intense', 'cathartic', 'powerful'],
    };

    const energyKeywords: Record<MoodProfile['energy'], string[]> = {
      high: ['energetic', 'upbeat', 'driving'],
      medium: ['moderate', 'steady'],
      low: ['calm', 'gentle', 'peaceful'],
    };

    const moodWords = moodKeywords[this.currentMood.primary] ?? [];
    const energyWords = energyKeywords[this.currentMood.energy] ?? [];
    const personaProfile = PERSONA_MUSIC_PROFILES[this.currentPersonaId];
    const personaGenres = personaProfile?.genreBoost ?? [];

    // Combine keywords for search
    const allKeywords = [...moodWords, ...energyWords.slice(0, 1), ...personaGenres.slice(0, 1)];
    return allKeywords.join(' ');
  }

  /**
   * Get current mood summary
   */
  getMoodSummary(): string | null {
    if (!this.currentMood) return null;
    return `${this.currentMood.primary} (${this.currentMood.energy} energy)`;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: SpotifyMoodService | null = null;

export function getSpotifyMoodService(): SpotifyMoodService {
  if (!instance) {
    instance = new SpotifyMoodService();
  }
  return instance;
}

export function setMoodForMusic(mood: MoodProfile): void {
  getSpotifyMoodService().setMood(mood);
}

export function getPlaylistRecommendations(count?: number): PlaylistRecommendation[] {
  return getSpotifyMoodService().getRecommendations(count);
}

export function getMoodMusicPrompt(): string | null {
  return getSpotifyMoodService().getMoodMusicPrompt();
}

export default SpotifyMoodService;

