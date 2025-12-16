/**
 * Spotify Mood Integration Service
 *
 * Connects emotional weather to music recommendations.
 * Suggests playlists based on mood, energy, and persona.
 */

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
      { id: 'sunny-high-1', name: 'Morning Energy', description: 'Upbeat tracks to start your day', mood: 'sunny', energy: 'high' },
      { id: 'sunny-high-2', name: 'Feel Good Hits', description: 'Songs that make you smile', mood: 'sunny', energy: 'high' },
      { id: 'sunny-high-3', name: 'Confidence Boost', description: 'Empowering anthems', mood: 'sunny', energy: 'high' },
    ],
    medium: [
      { id: 'sunny-med-1', name: 'Positive Vibes', description: 'Warm, optimistic sounds', mood: 'sunny', energy: 'medium' },
      { id: 'sunny-med-2', name: 'Sunday Morning', description: 'Relaxed happiness', mood: 'sunny', energy: 'medium' },
    ],
    low: [
      { id: 'sunny-low-1', name: 'Peaceful Joy', description: 'Gentle contentment', mood: 'sunny', energy: 'low' },
      { id: 'sunny-low-2', name: 'Gratitude', description: 'Thankful and calm', mood: 'sunny', energy: 'low' },
    ],
  },
  'partly-cloudy': {
    high: [
      { id: 'pc-high-1', name: 'Motivated', description: 'Push through with energy', mood: 'partly-cloudy', energy: 'high' },
      { id: 'pc-high-2', name: 'Focus Flow', description: 'Concentration fuel', mood: 'partly-cloudy', energy: 'high' },
    ],
    medium: [
      { id: 'pc-med-1', name: 'Balanced', description: 'Steady and composed', mood: 'partly-cloudy', energy: 'medium' },
      { id: 'pc-med-2', name: 'Working Through', description: 'Productive neutrality', mood: 'partly-cloudy', energy: 'medium' },
    ],
    low: [
      { id: 'pc-low-1', name: 'Contemplative', description: 'Thoughtful reflection', mood: 'partly-cloudy', energy: 'low' },
      { id: 'pc-low-2', name: 'Quiet Strength', description: 'Gentle persistence', mood: 'partly-cloudy', energy: 'low' },
    ],
  },
  cloudy: {
    high: [
      { id: 'cloudy-high-1', name: 'Push Through', description: 'Energy despite uncertainty', mood: 'cloudy', energy: 'high' },
    ],
    medium: [
      { id: 'cloudy-med-1', name: 'Uncertain Path', description: 'Navigating the grey', mood: 'cloudy', energy: 'medium' },
      { id: 'cloudy-med-2', name: 'Finding Clarity', description: 'Seeking direction', mood: 'cloudy', energy: 'medium' },
    ],
    low: [
      { id: 'cloudy-low-1', name: 'Introspective', description: 'Deep inner reflection', mood: 'cloudy', energy: 'low' },
      { id: 'cloudy-low-2', name: 'Quiet Moments', description: 'Peaceful uncertainty', mood: 'cloudy', energy: 'low' },
    ],
  },
  rainy: {
    high: [
      { id: 'rainy-high-1', name: 'Determined', description: 'Fighting through the storm', mood: 'rainy', energy: 'high' },
    ],
    medium: [
      { id: 'rainy-med-1', name: 'Processing', description: 'Working through feelings', mood: 'rainy', energy: 'medium' },
      { id: 'rainy-med-2', name: 'Rainy Day', description: 'Melancholic but present', mood: 'rainy', energy: 'medium' },
    ],
    low: [
      { id: 'rainy-low-1', name: 'Sad Songs', description: 'Feel the feelings', mood: 'rainy', energy: 'low' },
      { id: 'rainy-low-2', name: 'Comfort', description: 'Gentle support', mood: 'rainy', energy: 'low' },
      { id: 'rainy-low-3', name: 'Release', description: 'Let it out', mood: 'rainy', energy: 'low' },
    ],
  },
  stormy: {
    high: [
      { id: 'stormy-high-1', name: 'Catharsis', description: 'Release the intensity', mood: 'stormy', energy: 'high' },
      { id: 'stormy-high-2', name: 'Venting', description: 'Let it all out', mood: 'stormy', energy: 'high' },
    ],
    medium: [
      { id: 'stormy-med-1', name: 'Turbulent', description: 'Riding the waves', mood: 'stormy', energy: 'medium' },
    ],
    low: [
      { id: 'stormy-low-1', name: 'After the Storm', description: 'Quiet exhaustion', mood: 'stormy', energy: 'low' },
      { id: 'stormy-low-2', name: 'Recovery', description: 'Beginning to heal', mood: 'stormy', energy: 'low' },
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
    description: 'Grounded, nature-inspired soundscapes',
  },
  'alex-chen': {
    genreBoost: ['lo-fi', 'focus', 'instrumental', 'study beats'],
    description: 'Productive, focused work music',
  },
  'maya-santos': {
    genreBoost: ['motivational', 'pop', 'upbeat', 'gym'],
    description: 'Energizing habit-building soundtracks',
  },
  'jordan-taylor': {
    genreBoost: ['indie', 'storytelling', 'singer-songwriter', 'narrative'],
    description: 'Story-rich, meaningful compositions',
  },
  'nayan-patel': {
    genreBoost: ['meditation', 'classical', 'spa', 'healing'],
    description: 'Calming, wellness-focused audio',
  },
  'peter-john': {
    genreBoost: ['spirituals', 'gospel', 'inspirational', 'choir'],
    description: 'Uplifting, soul-nourishing music',
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

    const moodDescriptions: Record<MoodProfile['primary'], string> = {
      sunny: 'feeling bright and optimistic',
      'partly-cloudy': 'in a balanced, neutral space',
      cloudy: 'experiencing some uncertainty',
      rainy: 'processing some difficult feelings',
      stormy: 'going through intense emotions',
    };

    const energyDescriptions: Record<MoodProfile['energy'], string> = {
      high: 'with plenty of energy',
      medium: 'at a steady pace',
      low: 'needing something gentle',
    };

    const moodDesc = moodDescriptions[this.currentMood.primary];
    const energyDesc = energyDescriptions[this.currentMood.energy];

    return `Based on your emotional weather, you're ${moodDesc} ${energyDesc}. Would you like some music to match?`;
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

