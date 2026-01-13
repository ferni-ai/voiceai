/**
 * Future-Proof Nonverbal System
 *
 * Configuration for nonverbal sounds (laughter, sigh, etc.).
 * When Cartesia adds support for new sounds, just flip the 'supported' flag!
 *
 * @module speech/adaptive-ssml/alive-voice/nonverbals
 */
/**
 * Nonverbal sound configuration.
 * When Cartesia adds support, just flip the 'supported' flag!
 */
export declare const NONVERBAL_CONFIG: {
    readonly laughter: {
        readonly supported: true;
        readonly bracket: "[laughter]";
        readonly fallback: "haha";
        readonly contexts: readonly ["humor", "joy", "playful"];
    };
    readonly sigh: {
        readonly supported: false;
        readonly bracket: "[sigh]";
        readonly fallback: "";
        readonly contexts: readonly ["empathy", "heavy", "relief"];
    };
    readonly thinking: {
        readonly supported: false;
        readonly bracket: "[hmm]";
        readonly fallback: "Hmm...";
        readonly contexts: readonly ["contemplation", "question", "uncertainty"];
    };
    readonly gasp: {
        readonly supported: false;
        readonly bracket: "[gasp]";
        readonly fallback: "Oh!";
        readonly contexts: readonly ["surprise", "shock", "realization"];
    };
    readonly cough: {
        readonly supported: false;
        readonly bracket: "[cough]";
        readonly fallback: "";
        readonly contexts: readonly ["clearing throat", "pause"];
    };
};
export type NonverbalType = keyof typeof NONVERBAL_CONFIG;
/**
 * Get the appropriate representation for a nonverbal sound.
 * Returns bracket notation if supported, fallback text otherwise.
 */
export declare function getNonverbal(type: NonverbalType): string;
/**
 * Check if a nonverbal is supported by Cartesia.
 */
export declare function isNonverbalSupported(type: NonverbalType): boolean;
//# sourceMappingURL=nonverbals.d.ts.map