/**
 * 🌉 Voice → Music Bridge
 *
 * Connects voice prosody analysis to music suggestions.
 * This is the "superhuman" feature - detecting mood from voice and proactively offering music.
 *
 * Features:
 * - Tired voice → energizing music offer
 * - Stressed voice → calming music offer
 * - Excited voice → match the energy
 * - Sad voice → comforting music
 * - Anxious markers → grounding music
 *
 * Part of the "Better than Human" experience - Ferni notices what humans might miss.
 */

import type { VoiceEmotionResult } from '../../speech/audio-prosody.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceMusicSuggestion {
  /** Should we offer music? */
  shouldOffer: boolean;
  /** The offer phrase to speak */
  offer: string;
  /** Search query for music */
  searchQuery: string;
  /** Why we're offering (for logging) */
  reason: string;
  /** Urgency level (affects timing) */
  urgency: 'low' | 'medium' | 'high';
  /** Confidence in the suggestion */
  confidence: number;
}

export interface VoiceMusicBridgeState {
  /** Last time we offered music */
  lastOfferTime: number;
  /** Last detected emotion */
  lastEmotion: string | null;
  /** Last stress level */
  lastStressLevel: number;
  /** Consecutive high-stress readings */
  consecutiveHighStress: number;
  /** Consecutive low-energy readings */
  consecutiveLowEnergy: number;
  /** Has user accepted a music offer recently? */
  recentAcceptance: boolean;
  /** Has user declined a music offer recently? */
  recentDecline: boolean;
  /** Total offers this session */
  totalOffers: number;
  /** Accepted offers this session */
  acceptedOffers: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const OFFER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between offers
const HIGH_STRESS_THRESHOLD = 0.7;
const LOW_ENERGY_THRESHOLD = 0.3;
const HIGH_AROUSAL_THRESHOLD = 0.7;
const CONSECUTIVE_READINGS_FOR_OFFER = 2;

// ============================================================================
// VOICE-BASED MUSIC OFFERS
// ============================================================================

const VOICE_MUSIC_OFFERS = {
  tired: {
    offers: [
      'You sound a bit tired. Want some music to lift your energy?',
      'I hear some tiredness in your voice. How about some uplifting tunes?',
      'Long day? I could put on something to energize you.',
      'Your voice tells me you might need a pick-me-up. Music?',
    ],
    searchQueries: [
      'uplifting energizing music',
      'feel good morning playlist',
      'motivational pop songs',
      'energy boost workout music',
    ],
  },
  stressed: {
    offers: [
      "I can hear you're carrying a lot. Want some calming music?",
      'You sound stressed. Let me put on something soothing.',
      "There's tension in your voice. Music might help.",
      'Sounds like you could use a moment to breathe. Some calming music?',
    ],
    searchQueries: [
      'calming stress relief music',
      'peaceful meditation sounds',
      'relaxing piano music',
      'anxiety relief ambient',
    ],
  },
  anxious: {
    offers: [
      'I notice some anxiety. Want some grounding music?',
      'Let me put on something to help settle those nerves.',
      'How about some music to help you feel more centered?',
      'Some calming sounds might help right now.',
    ],
    searchQueries: [
      'grounding music anxiety',
      'calming instrumental',
      'peaceful nature sounds music',
      'slow relaxing music',
    ],
  },
  excited: {
    offers: [
      'I love this energy! Want some music to match?',
      'You sound pumped! Let me find something to ride this wave!',
      'This excitement needs a soundtrack!',
      'Your energy is contagious! Music time?',
    ],
    searchQueries: [
      'upbeat happy music',
      'feel good dance hits',
      'celebration party music',
      'energetic pop songs',
    ],
  },
  sad: {
    offers: [
      'I hear it in your voice. Want some music that understands?',
      "Sometimes music helps when words don't. Want me to play something?",
      'Music can be good company right now. Want some?',
      'Let me put on something gentle.',
    ],
    searchQueries: [
      'comforting sad music',
      'healing emotional songs',
      'gentle acoustic ballads',
      'melancholy beautiful music',
    ],
  },
  neutral_low_energy: {
    offers: [
      'Feeling mellow? Want some background music?',
      'How about some chill tunes while we talk?',
      'Want me to set a vibe with some music?',
    ],
    searchQueries: ['chill background music', 'lo-fi study beats', 'ambient focus music'],
  },
};

// ============================================================================
// VOICE MUSIC BRIDGE CLASS
// ============================================================================

export class VoiceMusicBridge {
  private state: VoiceMusicBridgeState;
  private personaId = 'ferni';

  constructor() {
    this.state = this.createInitialState();
    log.info('🌉 Voice-Music Bridge initialized');
  }

  private createInitialState(): VoiceMusicBridgeState {
    return {
      lastOfferTime: 0,
      lastEmotion: null,
      lastStressLevel: 0,
      consecutiveHighStress: 0,
      consecutiveLowEnergy: 0,
      recentAcceptance: false,
      recentDecline: false,
      totalOffers: 0,
      acceptedOffers: 0,
    };
  }

  /**
   * Set current persona for personalized offers
   */
  setPersona(personaId: string): void {
    this.personaId = personaId;
  }

  /**
   * Analyze voice emotion and decide if we should offer music
   *
   * Call this after prosody analysis completes.
   */
  analyzeAndSuggest(voiceEmotion: VoiceEmotionResult): VoiceMusicSuggestion | null {
    // Update tracking
    this.state.lastEmotion = voiceEmotion.primary;
    this.state.lastStressLevel = voiceEmotion.stressLevel;

    // Track consecutive readings
    if (voiceEmotion.stressLevel >= HIGH_STRESS_THRESHOLD) {
      this.state.consecutiveHighStress++;
    } else {
      this.state.consecutiveHighStress = 0;
    }

    if (voiceEmotion.arousal < LOW_ENERGY_THRESHOLD) {
      this.state.consecutiveLowEnergy++;
    } else {
      this.state.consecutiveLowEnergy = 0;
    }

    // Check if we should offer
    const suggestion = this.getSuggestion(voiceEmotion);

    if (suggestion) {
      log.debug(
        {
          emotion: voiceEmotion.primary,
          stress: voiceEmotion.stressLevel,
          arousal: voiceEmotion.arousal,
          reason: suggestion.reason,
        },
        '🌉 Voice-Music Bridge: Suggesting music'
      );
    }

    return suggestion;
  }

  /**
   * Record that user accepted a music offer
   */
  recordAcceptance(): void {
    this.state.recentAcceptance = true;
    this.state.recentDecline = false;
    this.state.acceptedOffers++;

    // Reset decline flag after 10 minutes
    setTimeout(
      () => {
        this.state.recentAcceptance = false;
      },
      10 * 60 * 1000
    );
  }

  /**
   * Record that user declined a music offer
   */
  recordDecline(): void {
    this.state.recentDecline = true;
    this.state.recentAcceptance = false;

    // Reset after 15 minutes (be less aggressive after decline)
    setTimeout(
      () => {
        this.state.recentDecline = false;
      },
      15 * 60 * 1000
    );
  }

  /**
   * Get current state for debugging
   */
  getState(): VoiceMusicBridgeState {
    return { ...this.state };
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.state = this.createInitialState();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private getSuggestion(voiceEmotion: VoiceEmotionResult): VoiceMusicSuggestion | null {
    // Cooldown check
    const timeSinceLastOffer = Date.now() - this.state.lastOfferTime;
    if (timeSinceLastOffer < OFFER_COOLDOWN_MS) {
      return null;
    }

    // Don't offer if recently declined
    if (this.state.recentDecline) {
      return null;
    }

    // Limit total offers per session
    if (this.state.totalOffers >= 5) {
      return null;
    }

    // Determine offer type based on voice analysis
    let offerType: keyof typeof VOICE_MUSIC_OFFERS | null = null;
    let urgency: 'low' | 'medium' | 'high' = 'low';
    const confidence = voiceEmotion.confidence;
    let reason = '';

    // HIGH PRIORITY: Anxiety markers detected (boolean flag)
    if (voiceEmotion.anxietyMarkers && voiceEmotion.stressLevel > 0.6) {
      offerType = 'anxious';
      urgency = 'high';
      reason = 'Anxiety markers detected in voice';
    }
    // HIGH PRIORITY: Consecutive high stress
    else if (this.state.consecutiveHighStress >= CONSECUTIVE_READINGS_FOR_OFFER) {
      offerType = 'stressed';
      urgency = 'high';
      reason = 'Sustained high stress in voice';
    }
    // MEDIUM PRIORITY: Emotion-based (using VoiceEmotion enum values)
    else if (voiceEmotion.primary === 'sad' && confidence > 0.6) {
      offerType = 'sad';
      urgency = 'medium';
      reason = 'Sadness detected in voice';
    } else if (
      (voiceEmotion.primary === 'fearful' || voiceEmotion.primary === 'anxious') &&
      confidence > 0.6
    ) {
      offerType = 'anxious';
      urgency = 'medium';
      reason = 'Fear/anxiety detected in voice';
    } else if (
      (voiceEmotion.primary === 'happy' || voiceEmotion.primary === 'excited') &&
      voiceEmotion.arousal > HIGH_AROUSAL_THRESHOLD
    ) {
      offerType = 'excited';
      urgency = 'low';
      reason = 'High energy joy detected';
    }
    // LOW PRIORITY: Low energy
    else if (this.state.consecutiveLowEnergy >= CONSECUTIVE_READINGS_FOR_OFFER) {
      // Check if it's tired vs just calm
      if (voiceEmotion.valence < 0.4) {
        offerType = 'tired';
        urgency = 'low';
        reason = 'Low energy, potentially tired';
      } else {
        offerType = 'neutral_low_energy';
        urgency = 'low';
        reason = 'Low energy, mellow mood';
      }
    }

    if (!offerType) {
      return null;
    }

    // Get offer phrases and search queries
    const offerData = VOICE_MUSIC_OFFERS[offerType];
    const offer = this.getPersonalizedOffer(offerData.offers);
    const searchQuery =
      offerData.searchQueries[Math.floor(Math.random() * offerData.searchQueries.length)];

    // Update state
    this.state.lastOfferTime = Date.now();
    this.state.totalOffers++;

    return {
      shouldOffer: true,
      offer,
      searchQuery,
      reason,
      urgency,
      confidence,
    };
  }

  private getPersonalizedOffer(offers: string[]): string {
    // Could add persona-specific modifications here
    return offers[Math.floor(Math.random() * offers.length)];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let bridgeInstance: VoiceMusicBridge | null = null;

export function getVoiceMusicBridge(): VoiceMusicBridge {
  if (!bridgeInstance) {
    bridgeInstance = new VoiceMusicBridge();
  }
  return bridgeInstance;
}

export function resetVoiceMusicBridge(): void {
  bridgeInstance?.reset();
  bridgeInstance = null;
}

export default {
  VoiceMusicBridge,
  getVoiceMusicBridge,
  resetVoiceMusicBridge,
};

