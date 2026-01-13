/**
 * 🎵 Session Sound Effects
 *
 * Audio stingers for session lifecycle events:
 * - Session start (welcoming warmth)
 * - Session end (satisfying closure)
 * - Thinking moments (subtle processing indicator)
 * - Success celebrations
 * - Game sounds
 *
 * These are designed to be:
 * - Short (under 2 seconds)
 * - Warm and human (not robotic beeps)
 * - Consistent with Ferni's earthy aesthetic
 *
 * 🔊 NOTE: Uses dedicated SoundEffectsPlayer (NOT MusicPlayer!)
 * This ensures sound effects don't trigger "music ended" announcements
 * or any other DJ/music callbacks.
 */
export type SessionSoundType = 'session-start' | 'session-end' | 'thinking-start' | 'thinking-end' | 'success' | 'correct' | 'wrong' | 'hint' | 'game-start' | 'game-end' | 'high-score' | 'handoff' | 'notification' | 'milestone-fanfare' | 'milestone-sparkle' | 'milestone-applause' | 'streak-fire';
/**
 * SSML verbal fallbacks when audio files aren't available
 * These are spoken by TTS and still feel like "sounds"
 */
export declare const VERBAL_SOUNDS: Record<SessionSoundType, string[]>;
declare class SessionSoundsService {
    private audioCache;
    private isEnabled;
    constructor();
    /**
     * Enable or disable session sounds
     */
    setEnabled(enabled: boolean): void;
    /**
     * Play a session sound effect
     * Returns the verbal fallback if audio couldn't play
     *
     * 🔊 Uses dedicated SoundEffectsPlayer - NOT the music player!
     * This prevents "music ended" announcements and DJ callbacks.
     */
    playSound(type: SessionSoundType): Promise<{
        played: boolean;
        verbalFallback?: string;
    }>;
    /**
     * Get a random verbal sound effect for TTS
     */
    getVerbalSound(type: SessionSoundType): string;
    /**
     * Play session start sound
     */
    playSessionStart(): Promise<string | undefined>;
    /**
     * Play session end sound
     */
    playSessionEnd(): Promise<string | undefined>;
    /**
     * Play game sound with verbal fallback
     */
    playGameSound(type: 'correct' | 'wrong' | 'hint' | 'game-start' | 'game-end' | 'high-score'): Promise<string>;
}
export declare function getSessionSounds(): SessionSoundsService;
export declare function resetSessionSounds(): void;
/**
 * Play a session sound effect
 */
export declare function playSessionSound(type: SessionSoundType): Promise<{
    played: boolean;
    verbalFallback?: string;
}>;
/**
 * Get verbal sound for TTS (when audio not available)
 */
export declare function getVerbalSound(type: SessionSoundType): string;
export default getSessionSounds;
//# sourceMappingURL=session-sounds.d.ts.map