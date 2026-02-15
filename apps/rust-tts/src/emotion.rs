/// Emotion-to-voice parameter mapping for Qwen3-TTS VoiceDesign mode.
///
/// Converts emotion strings (sent by the TypeScript backend) into
/// VoiceDesign description modifiers and speed adjustments so that
/// synthesized speech reflects emotional state.

/// Resolved prosody parameters for a given emotion.
#[derive(Debug, Clone)]
pub struct EmotionParams {
    /// Canonical emotion name (lowercase).
    pub emotion: String,
    /// Fragment appended to the VoiceDesign description to convey the emotion.
    pub description_modifier: String,
    /// Intended speed multiplier (1.0 = normal). Conveyed to the model via
    /// description text since VoiceDesignOptions has no direct speed knob.
    pub speed: f32,
    /// Approximate pitch shift in semitones (metadata only — VoiceDesign
    /// doesn't expose a direct pitch knob, but the description modifier
    /// steers the model in this direction).
    pub pitch_shift_semitones: i8,
    /// Sampling temperature adjustment. Higher values produce more expressive
    /// speech; lower values are more controlled and measured.
    pub temperature: Option<f64>,
}

/// Map an emotion string to VoiceDesign parameters.
///
/// Unknown emotions fall back to `neutral`.
pub fn resolve_emotion(emotion: Option<&str>) -> EmotionParams {
    let key = emotion
        .map(|e| e.trim().to_lowercase())
        .unwrap_or_default();

    match key.as_str() {
        "warm" => EmotionParams {
            emotion: "warm".into(),
            description_modifier: "Speaking with a warm, gentle tone, soft energy, slightly slower pace, like comforting a close friend".into(),
            speed: 0.95,
            pitch_shift_semitones: -2,
            temperature: Some(0.8),
        },
        "gentle" => EmotionParams {
            emotion: "gentle".into(),
            description_modifier: "Speaking very softly, almost whispering, with tender and soothing delivery, slow deliberate pace".into(),
            speed: 0.90,
            pitch_shift_semitones: -1,
            temperature: Some(0.7),
        },
        "excited" => EmotionParams {
            emotion: "excited".into(),
            description_modifier: "Speaking with high energy, bright and enthusiastic, voice rising with excitement, fast animated pace".into(),
            speed: 1.10,
            pitch_shift_semitones: 3,
            temperature: Some(0.95),
        },
        "concerned" => EmotionParams {
            emotion: "concerned".into(),
            description_modifier: "Speaking with gentle concern, slightly lower and softer, careful and empathetic, measured slow pace".into(),
            speed: 0.88,
            pitch_shift_semitones: -1,
            temperature: Some(0.75),
        },
        "contemplative" => EmotionParams {
            emotion: "contemplative".into(),
            description_modifier: "Speaking thoughtfully with measured pacing, reflective pauses, calm and even, slow and deliberate".into(),
            speed: 0.85,
            pitch_shift_semitones: 0,
            temperature: Some(0.65),
        },
        "cheerful" => EmotionParams {
            emotion: "cheerful".into(),
            description_modifier: "Speaking with a bright, happy tone, smiling voice, upbeat and light, slightly faster pace".into(),
            speed: 1.05,
            pitch_shift_semitones: 2,
            temperature: Some(0.9),
        },
        "sad" => EmotionParams {
            emotion: "sad".into(),
            description_modifier: "Speaking with a subdued, somber tone, lower pitch, soft and slightly breathy, slow heavy pace".into(),
            speed: 0.85,
            pitch_shift_semitones: -3,
            temperature: Some(0.7),
        },
        "empathetic" => EmotionParams {
            emotion: "empathetic".into(),
            description_modifier: "Speaking with deep understanding, warm and supportive, gentle reassurance, unhurried pace".into(),
            speed: 0.92,
            pitch_shift_semitones: -1,
            temperature: Some(0.8),
        },
        "encouraging" => EmotionParams {
            emotion: "encouraging".into(),
            description_modifier: "Speaking with uplifting energy, confident and supportive, motivating tone, steady pace".into(),
            speed: 1.02,
            pitch_shift_semitones: 1,
            temperature: Some(0.85),
        },
        "serious" => EmotionParams {
            emotion: "serious".into(),
            description_modifier: "Speaking with gravity and weight, lower register, deliberate and authoritative, slow measured pace".into(),
            speed: 0.90,
            pitch_shift_semitones: -2,
            temperature: Some(0.6),
        },

        // ── Positive Emotions ──────────────────────────────────────────

        "joyful" => EmotionParams {
            emotion: "joyful".into(),
            description_modifier: "Speaking with pure radiant joy, voice bright and bouncy, each word bubbling with delight, quick lilting pace as if unable to contain happiness".into(),
            speed: 1.12,
            pitch_shift_semitones: 3,
            temperature: Some(0.95),
        },
        "playful" => EmotionParams {
            emotion: "playful".into(),
            description_modifier: "Speaking with teasing, lighthearted fun energy, voice dancing with mischief and amusement, slightly faster with a singsong lilt".into(),
            speed: 1.08,
            pitch_shift_semitones: 2,
            temperature: Some(0.9),
        },
        "amused" => EmotionParams {
            emotion: "amused".into(),
            description_modifier: "Speaking with a chuckling, light-hearted quality, warmth of contained laughter in the voice, relaxed and gently entertained pace".into(),
            speed: 1.05,
            pitch_shift_semitones: 1,
            temperature: Some(0.85),
        },
        "grateful" => EmotionParams {
            emotion: "grateful".into(),
            description_modifier: "Speaking with deep heartfelt appreciation, voice warm and sincere, each word carrying genuine thankfulness, unhurried and meaningful delivery".into(),
            speed: 0.92,
            pitch_shift_semitones: -1,
            temperature: Some(0.8),
        },
        "hopeful" => EmotionParams {
            emotion: "hopeful".into(),
            description_modifier: "Speaking with quiet optimism, voice gently lifting as if seeing light ahead, forward-looking and encouraging, steady uplifting pace".into(),
            speed: 1.0,
            pitch_shift_semitones: 1,
            temperature: Some(0.85),
        },
        "proud" => EmotionParams {
            emotion: "proud".into(),
            description_modifier: "Speaking with confident satisfaction, voice full and slightly louder, standing tall in each word, steady assured pace with subtle warmth".into(),
            speed: 0.98,
            pitch_shift_semitones: 1,
            temperature: Some(0.85),
        },
        "triumphant" => EmotionParams {
            emotion: "triumphant".into(),
            description_modifier: "Speaking with victorious power, voice soaring and commanding, each word a celebration of achievement, bold and exuberant delivery".into(),
            speed: 1.05,
            pitch_shift_semitones: 2,
            temperature: Some(0.9),
        },
        "tender" => EmotionParams {
            emotion: "tender".into(),
            description_modifier: "Speaking with intimate softness, deeply caring and delicate, voice barely above a whisper, slow and precious as if cradling each word".into(),
            speed: 0.88,
            pitch_shift_semitones: -2,
            temperature: Some(0.75),
        },
        "whimsical" => EmotionParams {
            emotion: "whimsical".into(),
            description_modifier: "Speaking with dreamy imaginative wonder, voice lilting and fanciful, as if narrating a fairy tale, gently meandering pace with playful inflections".into(),
            speed: 1.0,
            pitch_shift_semitones: 1,
            temperature: Some(0.9),
        },
        "mischievous" => EmotionParams {
            emotion: "mischievous".into(),
            description_modifier: "Speaking with playfully sly conspiratorial energy, voice carrying a knowing wink, slightly hushed as if sharing a delicious secret".into(),
            speed: 1.05,
            pitch_shift_semitones: 1,
            temperature: Some(0.9),
        },

        // ── Negative / Complex Emotions ────────────────────────────────

        "angry" => EmotionParams {
            emotion: "angry".into(),
            description_modifier: "Speaking with controlled anger, voice tense and sharp-edged, clipped consonants and simmering intensity, fast and forceful delivery".into(),
            speed: 1.08,
            pitch_shift_semitones: 1,
            temperature: Some(0.85),
        },
        "frustrated" => EmotionParams {
            emotion: "frustrated".into(),
            description_modifier: "Speaking with strained exasperation, voice tight with thinning patience, sighing undertone, slightly pressured pace as if holding back".into(),
            speed: 1.02,
            pitch_shift_semitones: 0,
            temperature: Some(0.8),
        },
        "anxious" => EmotionParams {
            emotion: "anxious".into(),
            description_modifier: "Speaking with nervous breathless energy, voice slightly higher and unsteady, words tumbling with worry, quick and fidgety pace".into(),
            speed: 1.05,
            pitch_shift_semitones: 1,
            temperature: Some(0.85),
        },
        "disappointed" => EmotionParams {
            emotion: "disappointed".into(),
            description_modifier: "Speaking with deflated let-down energy, voice sinking and subdued, each word carrying the weight of unmet expectations, slow and heavy".into(),
            speed: 0.90,
            pitch_shift_semitones: -2,
            temperature: Some(0.7),
        },
        "fearful" => EmotionParams {
            emotion: "fearful".into(),
            description_modifier: "Speaking with trembling quiet urgency, voice thin and wavering, hushed as if danger is near, careful halting pace with nervous pauses".into(),
            speed: 1.0,
            pitch_shift_semitones: 2,
            temperature: Some(0.8),
        },
        "disgusted" => EmotionParams {
            emotion: "disgusted".into(),
            description_modifier: "Speaking with visceral repulsion, voice clipped and recoiling, words pushed out with distaste, slower deliberate pace dripping with disdain".into(),
            speed: 0.95,
            pitch_shift_semitones: -1,
            temperature: Some(0.7),
        },
        "resigned" => EmotionParams {
            emotion: "resigned".into(),
            description_modifier: "Speaking with quiet acceptance of defeat, voice flat and drained, no fight left, slow monotone delivery as if energy has been spent".into(),
            speed: 0.88,
            pitch_shift_semitones: -1,
            temperature: Some(0.6),
        },
        "bitter" => EmotionParams {
            emotion: "bitter".into(),
            description_modifier: "Speaking with sharp-edged controlled resentment, voice carrying acid undertones, each word precisely placed with cold intensity".into(),
            speed: 0.95,
            pitch_shift_semitones: 0,
            temperature: Some(0.7),
        },
        "defiant" => EmotionParams {
            emotion: "defiant".into(),
            description_modifier: "Speaking with bold unwavering resolve, voice standing firm and unyielding, each word a declaration of resistance, strong and unshakable pace".into(),
            speed: 1.02,
            pitch_shift_semitones: 1,
            temperature: Some(0.85),
        },

        // ── Thoughtful / Calm Emotions ─────────────────────────────────

        "curious" => EmotionParams {
            emotion: "curious".into(),
            description_modifier: "Speaking with bright interested wonder, voice tilting upward with questioning lilt, each phrase an exploration, engaged and gently probing pace".into(),
            speed: 1.02,
            pitch_shift_semitones: 1,
            temperature: Some(0.85),
        },
        "nostalgic" => EmotionParams {
            emotion: "nostalgic".into(),
            description_modifier: "Speaking with wistful remembrance, voice soft and far-away, bittersweet warmth coloring each memory, slow drifting pace like turning old pages".into(),
            speed: 0.88,
            pitch_shift_semitones: -1,
            temperature: Some(0.75),
        },
        "serene" => EmotionParams {
            emotion: "serene".into(),
            description_modifier: "Speaking with deep unshakable peace, voice still and clear as a mountain lake, each word placed with quiet certainty, very slow and tranquil".into(),
            speed: 0.85,
            pitch_shift_semitones: -2,
            temperature: Some(0.6),
        },
        "reverent" => EmotionParams {
            emotion: "reverent".into(),
            description_modifier: "Speaking with hushed sacred awe, voice low and deeply respectful, each word offered like a prayer, slow and measured with weightless gravity".into(),
            speed: 0.85,
            pitch_shift_semitones: -2,
            temperature: Some(0.65),
        },
        "awestruck" => EmotionParams {
            emotion: "awestruck".into(),
            description_modifier: "Speaking with breathless wonder, voice catching in amazement, wide-eyed and spellbound, slow pace as if witnessing something magnificent for the first time".into(),
            speed: 0.90,
            pitch_shift_semitones: 1,
            temperature: Some(0.8),
        },
        "wistful" => EmotionParams {
            emotion: "wistful".into(),
            description_modifier: "Speaking with gentle yearning, voice tinged with longing for what was or could be, soft and aching, slow dreamy pace like watching rain".into(),
            speed: 0.90,
            pitch_shift_semitones: -1,
            temperature: Some(0.75),
        },
        "solemn" => EmotionParams {
            emotion: "solemn".into(),
            description_modifier: "Speaking with grave ceremonial dignity, voice deep and weighty, each word a stone laid with purpose, very slow and profoundly measured".into(),
            speed: 0.85,
            pitch_shift_semitones: -3,
            temperature: Some(0.6),
        },
        "bittersweet" => EmotionParams {
            emotion: "bittersweet".into(),
            description_modifier: "Speaking with joy and sadness intertwined, voice wavering between warmth and ache, smiling through tears, gentle uneven pace reflecting mixed emotions".into(),
            speed: 0.92,
            pitch_shift_semitones: -1,
            temperature: Some(0.75),
        },
        "longing" => EmotionParams {
            emotion: "longing".into(),
            description_modifier: "Speaking with deep aching desire, voice reaching toward something distant, each word stretching with unfulfilled want, slow and yearning delivery".into(),
            speed: 0.88,
            pitch_shift_semitones: -1,
            temperature: Some(0.75),
        },

        // ── Intensity / Action Emotions ────────────────────────────────

        "confident" => EmotionParams {
            emotion: "confident".into(),
            description_modifier: "Speaking with self-assured steadiness, voice grounded and unwavering, each word carrying calm authority, even measured pace radiating competence".into(),
            speed: 1.0,
            pitch_shift_semitones: 0,
            temperature: Some(0.8),
        },
        "determined" => EmotionParams {
            emotion: "determined".into(),
            description_modifier: "Speaking with resolute driven focus, voice locked onto its target with iron will, each word a step forward, steady relentless pace".into(),
            speed: 1.0,
            pitch_shift_semitones: 0,
            temperature: Some(0.8),
        },
        "urgent" => EmotionParams {
            emotion: "urgent".into(),
            description_modifier: "Speaking with pressing time-critical energy, voice crisp and rapid, words tumbling forward with immediacy, fast clipped pace demanding attention now".into(),
            speed: 1.15,
            pitch_shift_semitones: 2,
            temperature: Some(0.9),
        },
        "fierce" => EmotionParams {
            emotion: "fierce".into(),
            description_modifier: "Speaking with intense burning passion, voice blazing with raw power, each word ignited with conviction, strong and commanding delivery".into(),
            speed: 1.05,
            pitch_shift_semitones: 1,
            temperature: Some(0.9),
        },
        "compassionate" => EmotionParams {
            emotion: "compassionate".into(),
            description_modifier: "Speaking with deep moving empathy, voice rich with caring and understanding, holding space for pain, slow and tender as if wrapping words in comfort".into(),
            speed: 0.90,
            pitch_shift_semitones: -1,
            temperature: Some(0.8),
        },
        "relieved" => EmotionParams {
            emotion: "relieved".into(),
            description_modifier: "Speaking with exhaling release of tension, voice lightening and loosening, words flowing with newfound ease, gentle pace as weight lifts away".into(),
            speed: 0.95,
            pitch_shift_semitones: 0,
            temperature: Some(0.8),
        },
        "vulnerable" => EmotionParams {
            emotion: "vulnerable".into(),
            description_modifier: "Speaking with exposed fragile openness, voice quiet and trembling slightly, each word offered without armor, slow careful pace as if afraid of breaking".into(),
            speed: 0.88,
            pitch_shift_semitones: -1,
            temperature: Some(0.7),
        },
        "surprised" => EmotionParams {
            emotion: "surprised".into(),
            description_modifier: "Speaking with sudden startled exclamation, voice leaping upward in shock, wide-eyed and breathless, quick burst of energy followed by stunned pause".into(),
            speed: 1.08,
            pitch_shift_semitones: 3,
            temperature: Some(0.9),
        },

        // ── Cartesia Emotion Aliases ───────────────────────────────────

        "positivity" => resolve_emotion(Some("cheerful")),
        "anger" => resolve_emotion(Some("angry")),
        "sadness" => resolve_emotion(Some("sad")),
        "fear" => resolve_emotion(Some("fearful")),
        "surprise" => resolve_emotion(Some("surprised")),
        "disgust" => resolve_emotion(Some("disgusted")),
        "curiosity" => resolve_emotion(Some("curious")),

        // neutral / unknown / empty
        _ => EmotionParams {
            emotion: "neutral".into(),
            description_modifier: String::new(),
            speed: 1.0,
            pitch_shift_semitones: 0,
            temperature: None,
        },
    }
}

/// Build a VoiceDesign description that incorporates emotion.
///
/// Combines the base persona description with the emotion modifier.
/// If the emotion is neutral (empty modifier), returns the base description unchanged.
pub fn apply_emotion_to_description(base_description: &str, params: &EmotionParams) -> String {
    if params.description_modifier.is_empty() {
        return base_description.to_string();
    }
    format!("{}. {}", base_description, params.description_modifier)
}

/// Compute the final speed value.
///
/// If the caller provided an explicit speed override, use that.
/// Otherwise use the emotion-derived speed.
pub fn resolve_speed(emotion_speed: f32, explicit_speed: Option<f32>) -> f32 {
    explicit_speed.unwrap_or(emotion_speed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_emotions_resolve() {
        let warm = resolve_emotion(Some("warm"));
        assert_eq!(warm.emotion, "warm");
        assert!(warm.speed < 1.0);
        assert!(!warm.description_modifier.is_empty());

        let excited = resolve_emotion(Some("excited"));
        assert_eq!(excited.emotion, "excited");
        assert!(excited.speed > 1.0);
        assert_eq!(excited.pitch_shift_semitones, 3);
    }

    #[test]
    fn unknown_falls_back_to_neutral() {
        let params = resolve_emotion(Some("alien-rage"));
        assert_eq!(params.emotion, "neutral");
        assert_eq!(params.speed, 1.0);
        assert!(params.description_modifier.is_empty());
    }

    #[test]
    fn none_is_neutral() {
        let params = resolve_emotion(None);
        assert_eq!(params.emotion, "neutral");
    }

    #[test]
    fn case_insensitive() {
        let upper = resolve_emotion(Some("WARM"));
        assert_eq!(upper.emotion, "warm");

        let mixed = resolve_emotion(Some("Cheerful"));
        assert_eq!(mixed.emotion, "cheerful");
    }

    #[test]
    fn whitespace_trimmed() {
        let padded = resolve_emotion(Some("  sad  "));
        assert_eq!(padded.emotion, "sad");
    }

    #[test]
    fn apply_emotion_neutral_unchanged() {
        let base = "Male, 30, warm baritone";
        let params = resolve_emotion(None);
        let result = apply_emotion_to_description(base, &params);
        assert_eq!(result, base);
    }

    #[test]
    fn apply_emotion_appends_modifier() {
        let base = "Male, 30, warm baritone";
        let params = resolve_emotion(Some("warm"));
        let result = apply_emotion_to_description(base, &params);
        assert!(result.starts_with(base));
        assert!(result.contains("warm, gentle tone"));
    }

    #[test]
    fn explicit_speed_overrides_emotion() {
        assert_eq!(resolve_speed(0.85, Some(1.2)), 1.2);
        assert_eq!(resolve_speed(0.85, None), 0.85);
    }

    /// All canonical emotion names (not aliases).
    const ALL_EMOTIONS: &[&str] = &[
        // Original 10
        "warm", "gentle", "excited", "concerned", "contemplative",
        "cheerful", "sad", "empathetic", "encouraging", "serious",
        // Positive
        "joyful", "playful", "amused", "grateful", "hopeful",
        "proud", "triumphant", "tender", "whimsical", "mischievous",
        // Negative / Complex
        "angry", "frustrated", "anxious", "disappointed", "fearful",
        "disgusted", "resigned", "bitter", "defiant",
        // Thoughtful / Calm
        "curious", "nostalgic", "serene", "reverent", "awestruck",
        "wistful", "solemn", "bittersweet", "longing",
        // Intensity / Action
        "confident", "determined", "urgent", "fierce", "compassionate",
        "relieved", "vulnerable", "surprised",
    ];

    #[test]
    fn all_emotions_have_valid_speed() {
        for emo in ALL_EMOTIONS {
            let params = resolve_emotion(Some(emo));
            assert!(params.speed > 0.5 && params.speed < 2.0,
                "speed for {emo} out of range: {}", params.speed);
        }
    }

    #[test]
    fn test_all_emotions_have_description_modifier() {
        for emo in ALL_EMOTIONS {
            let params = resolve_emotion(Some(emo));
            assert!(!params.description_modifier.is_empty(),
                "emotion '{emo}' has empty description_modifier");
        }
    }

    #[test]
    fn test_all_emotions_have_valid_temperature() {
        for emo in ALL_EMOTIONS {
            let params = resolve_emotion(Some(emo));
            if let Some(temp) = params.temperature {
                assert!(temp >= 0.5 && temp <= 1.0,
                    "temperature for '{emo}' out of range [0.5, 1.0]: {temp}");
            }
        }
    }

    #[test]
    fn test_all_emotions_have_valid_pitch() {
        for emo in ALL_EMOTIONS {
            let params = resolve_emotion(Some(emo));
            assert!(params.pitch_shift_semitones >= -5 && params.pitch_shift_semitones <= 5,
                "pitch for '{emo}' out of range [-5, +5]: {}", params.pitch_shift_semitones);
        }
    }

    #[test]
    fn test_cartesia_aliases_resolve() {
        let aliases = [
            ("positivity", "cheerful"),
            ("anger", "angry"),
            ("sadness", "sad"),
            ("fear", "fearful"),
            ("surprise", "surprised"),
            ("disgust", "disgusted"),
            ("curiosity", "curious"),
        ];
        for (alias, canonical) in &aliases {
            let alias_params = resolve_emotion(Some(alias));
            let canonical_params = resolve_emotion(Some(canonical));
            assert_eq!(alias_params.emotion, canonical_params.emotion,
                "alias '{alias}' should resolve to '{canonical}' but got '{}'", alias_params.emotion);
            assert_eq!(alias_params.speed, canonical_params.speed,
                "alias '{alias}' speed mismatch");
        }
    }

    #[test]
    fn test_emotion_count_exceeds_40() {
        let mut count = 0;
        for emo in ALL_EMOTIONS {
            let params = resolve_emotion(Some(emo));
            assert_eq!(params.emotion, *emo, "emotion name mismatch for '{emo}'");
            count += 1;
        }
        // +1 for neutral (default)
        count += 1;
        assert!(count >= 40,
            "expected at least 40 distinct emotions, found {count}");
    }
}
