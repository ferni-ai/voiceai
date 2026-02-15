/// Speaking style and social register mapping for Qwen3-TTS VoiceDesign mode.
///
/// Converts style/register strings into VoiceDesign description modifiers
/// so that synthesized speech reflects the desired delivery style and social context.

/// Resolved parameters for a speaking style.
#[derive(Debug, Clone)]
pub struct StyleParams {
    /// Canonical style name (lowercase).
    pub style: String,
    /// Fragment appended to the VoiceDesign description to convey the style.
    pub description_modifier: String,
    /// Speed multiplier (1.0 = normal).
    pub speed: f32,
    /// Sampling temperature adjustment for expressiveness control.
    pub temperature: Option<f64>,
}

/// Resolved parameters for a social register.
#[derive(Debug, Clone)]
pub struct RegisterParams {
    /// Canonical register name (lowercase).
    pub register: String,
    /// Fragment appended to the VoiceDesign description to convey the register.
    pub description_modifier: String,
    /// Speed multiplier (1.0 = normal).
    pub speed: f32,
    /// Sampling temperature adjustment.
    pub temperature: Option<f64>,
}

/// Map a speaking style string to VoiceDesign parameters.
///
/// Returns `None` for unknown or empty styles.
pub fn resolve_style(style: Option<&str>) -> Option<StyleParams> {
    let key = style?.trim().to_lowercase();
    if key.is_empty() {
        return None;
    }

    let params = match key.as_str() {
        "whisper" => StyleParams {
            style: "whisper".into(),
            description_modifier: "Speaking in a hushed whisper, barely audible, intimate and secretive".into(),
            speed: 0.85,
            temperature: Some(0.6),
        },
        "soft" => StyleParams {
            style: "soft".into(),
            description_modifier: "Speaking softly, gentle volume, as if in a quiet room".into(),
            speed: 0.90,
            temperature: Some(0.7),
        },
        "loud" => StyleParams {
            style: "loud".into(),
            description_modifier: "Speaking loudly and clearly, projecting voice with authority".into(),
            speed: 1.10,
            temperature: Some(0.9),
        },
        "shout" => StyleParams {
            style: "shout".into(),
            description_modifier: "Shouting with full force, maximum volume and intensity".into(),
            speed: 1.15,
            temperature: Some(1.0),
        },
        "storytelling" => StyleParams {
            style: "storytelling".into(),
            description_modifier: "Narrating like a master storyteller, varied pace, dramatic pauses, vivid imagery".into(),
            speed: 0.90,
            temperature: Some(0.85),
        },
        "sarcastic" => StyleParams {
            style: "sarcastic".into(),
            description_modifier: "Speaking with heavy sarcasm, drawn-out syllables, exaggerated monotone, obvious irony".into(),
            speed: 0.92,
            temperature: Some(0.8),
        },
        "monotone" => StyleParams {
            style: "monotone".into(),
            description_modifier: "Speaking in a flat monotone, no pitch variation, robotic delivery".into(),
            speed: 1.0,
            temperature: Some(0.3),
        },
        "sing-song" => StyleParams {
            style: "sing-song".into(),
            description_modifier: "Speaking in a melodic, sing-song pattern, musical intonation rising and falling".into(),
            speed: 0.95,
            temperature: Some(0.9),
        },
        "breathless" => StyleParams {
            style: "breathless".into(),
            description_modifier: "Speaking breathlessly, rushed, as if just finished running, gasping between phrases".into(),
            speed: 1.20,
            temperature: Some(0.85),
        },
        "authoritative" => StyleParams {
            style: "authoritative".into(),
            description_modifier: "Speaking with commanding authority, deep resonance, deliberate and measured".into(),
            speed: 0.88,
            temperature: Some(0.7),
        },
        "news-anchor" => StyleParams {
            style: "news-anchor".into(),
            description_modifier: "Speaking like a professional news anchor, clear articulation, measured cadence, neutral authority".into(),
            speed: 0.95,
            temperature: Some(0.5),
        },
        "bedtime-story" => StyleParams {
            style: "bedtime-story".into(),
            description_modifier: "Speaking like reading a bedtime story, very soft, slow, soothing, with gentle warmth".into(),
            speed: 0.75,
            temperature: Some(0.6),
        },
        "lecture" => StyleParams {
            style: "lecture".into(),
            description_modifier: "Speaking in a lecture style, educational, measured pace, clear enunciation, explanatory tone".into(),
            speed: 0.90,
            temperature: Some(0.6),
        },
        "confiding" => StyleParams {
            style: "confiding".into(),
            description_modifier: "Speaking as if sharing a secret, low volume, intimate, drawing the listener close".into(),
            speed: 0.85,
            temperature: Some(0.75),
        },
        _ => return None,
    };
    Some(params)
}

/// Map a social register string to VoiceDesign parameters.
///
/// Returns `None` for unknown or empty registers.
pub fn resolve_register(register: Option<&str>) -> Option<RegisterParams> {
    let key = register?.trim().to_lowercase();
    if key.is_empty() {
        return None;
    }

    let params = match key.as_str() {
        "professional" => RegisterParams {
            register: "professional".into(),
            description_modifier: "Using polished professional language, formal but not stiff, confident business tone".into(),
            speed: 0.95,
            temperature: Some(0.6),
        },
        "casual" => RegisterParams {
            register: "casual".into(),
            description_modifier: "Speaking casually, relaxed conversational tone, friendly and easygoing".into(),
            speed: 1.0,
            temperature: Some(0.85),
        },
        "intimate" => RegisterParams {
            register: "intimate".into(),
            description_modifier: "Speaking with deep intimacy, very close and personal, warm and vulnerable".into(),
            speed: 0.85,
            temperature: Some(0.75),
        },
        "parental" => RegisterParams {
            register: "parental".into(),
            description_modifier: "Speaking with loving parental warmth, patient, encouraging, slightly simplified".into(),
            speed: 0.90,
            temperature: Some(0.7),
        },
        "ceremonial" => RegisterParams {
            register: "ceremonial".into(),
            description_modifier: "Speaking with ceremony and gravitas, elevated language, measured and dignified".into(),
            speed: 0.82,
            temperature: Some(0.5),
        },
        "conspiratorial" => RegisterParams {
            register: "conspiratorial".into(),
            description_modifier: "Speaking in a conspiratorial tone, hushed and secretive, as if sharing classified information".into(),
            speed: 0.88,
            temperature: Some(0.8),
        },
        _ => return None,
    };
    Some(params)
}

/// Compose a full VoiceDesign description from base + emotion + style + register modifiers.
///
/// Joins all non-empty modifiers with ". " as separator. If no modifiers are provided,
/// returns the base description unchanged.
pub fn compose_description(
    base: &str,
    emotion_modifier: &str,
    style: Option<&str>,
    register: Option<&str>,
) -> String {
    let style_modifier = resolve_style(style)
        .map(|s| s.description_modifier)
        .unwrap_or_default();
    let register_modifier = resolve_register(register)
        .map(|r| r.description_modifier)
        .unwrap_or_default();

    let modifiers: Vec<&str> = [
        emotion_modifier,
        style_modifier.as_str(),
        register_modifier.as_str(),
    ]
    .into_iter()
    .filter(|m| !m.is_empty())
    .collect();

    if modifiers.is_empty() {
        return base.to_string();
    }

    format!("{}. {}", base, modifiers.join(". "))
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL_STYLES: &[&str] = &[
        "whisper", "soft", "loud", "shout", "storytelling", "sarcastic",
        "monotone", "sing-song", "breathless", "authoritative", "news-anchor",
        "bedtime-story", "lecture", "confiding",
    ];

    const ALL_REGISTERS: &[&str] = &[
        "professional", "casual", "intimate", "parental", "ceremonial",
        "conspiratorial",
    ];

    #[test]
    fn all_styles_resolve() {
        for style in ALL_STYLES {
            let params = resolve_style(Some(style));
            assert!(params.is_some(), "style '{style}' should resolve");
            let p = params.unwrap();
            assert_eq!(p.style, *style);
            assert!(!p.description_modifier.is_empty());
        }
    }

    #[test]
    fn all_registers_resolve() {
        for reg in ALL_REGISTERS {
            let params = resolve_register(Some(reg));
            assert!(params.is_some(), "register '{reg}' should resolve");
            let p = params.unwrap();
            assert_eq!(p.register, *reg);
            assert!(!p.description_modifier.is_empty());
        }
    }

    #[test]
    fn unknown_style_returns_none() {
        assert!(resolve_style(Some("robot-voice")).is_none());
        assert!(resolve_style(Some("")).is_none());
        assert!(resolve_style(None).is_none());
    }

    #[test]
    fn unknown_register_returns_none() {
        assert!(resolve_register(Some("royal")).is_none());
        assert!(resolve_register(Some("")).is_none());
        assert!(resolve_register(None).is_none());
    }

    #[test]
    fn style_case_insensitive() {
        let upper = resolve_style(Some("WHISPER"));
        assert!(upper.is_some());
        assert_eq!(upper.unwrap().style, "whisper");

        let mixed = resolve_style(Some("Storytelling"));
        assert!(mixed.is_some());
        assert_eq!(mixed.unwrap().style, "storytelling");
    }

    #[test]
    fn register_case_insensitive() {
        let upper = resolve_register(Some("PROFESSIONAL"));
        assert!(upper.is_some());
        assert_eq!(upper.unwrap().register, "professional");
    }

    #[test]
    fn style_whitespace_trimmed() {
        let padded = resolve_style(Some("  soft  "));
        assert!(padded.is_some());
        assert_eq!(padded.unwrap().style, "soft");
    }

    #[test]
    fn all_styles_have_valid_speed() {
        for style in ALL_STYLES {
            let p = resolve_style(Some(style)).unwrap();
            assert!(
                p.speed > 0.5 && p.speed < 2.0,
                "speed for style '{style}' out of range: {}",
                p.speed
            );
        }
    }

    #[test]
    fn all_registers_have_valid_speed() {
        for reg in ALL_REGISTERS {
            let p = resolve_register(Some(reg)).unwrap();
            assert!(
                p.speed > 0.5 && p.speed < 2.0,
                "speed for register '{reg}' out of range: {}",
                p.speed
            );
        }
    }

    #[test]
    fn all_styles_have_valid_temperature() {
        for style in ALL_STYLES {
            let p = resolve_style(Some(style)).unwrap();
            if let Some(temp) = p.temperature {
                assert!(
                    temp >= 0.1 && temp <= 1.5,
                    "temperature for style '{style}' out of range: {temp}"
                );
            }
        }
    }

    #[test]
    fn compose_with_all_modifiers() {
        let result = compose_description(
            "Male, 30, warm baritone",
            "Speaking warmly",
            Some("whisper"),
            Some("professional"),
        );
        assert!(result.starts_with("Male, 30, warm baritone. "));
        assert!(result.contains("Speaking warmly"));
        assert!(result.contains("hushed whisper"));
        assert!(result.contains("professional language"));
    }

    #[test]
    fn compose_with_emotion_only() {
        let result = compose_description(
            "Female, 25, bright soprano",
            "Speaking excitedly",
            None,
            None,
        );
        assert!(result.starts_with("Female, 25, bright soprano. "));
        assert!(result.contains("Speaking excitedly"));
    }

    #[test]
    fn compose_with_style_only() {
        let result = compose_description(
            "Male, 30",
            "",
            Some("storytelling"),
            None,
        );
        assert!(result.starts_with("Male, 30. "));
        assert!(result.contains("master storyteller"));
    }

    #[test]
    fn compose_with_register_only() {
        let result = compose_description(
            "Male, 30",
            "",
            None,
            Some("casual"),
        );
        assert!(result.starts_with("Male, 30. "));
        assert!(result.contains("casually"));
    }

    #[test]
    fn compose_with_no_modifiers() {
        let result = compose_description("Male, 30, warm baritone", "", None, None);
        assert_eq!(result, "Male, 30, warm baritone");
    }

    #[test]
    fn compose_unknown_style_ignored() {
        let result = compose_description("Base", "Emotion mod", Some("unknown"), None);
        // Unknown style resolves to None, so only emotion modifier appears
        assert!(result.contains("Emotion mod"));
        assert!(!result.contains("unknown"));
    }

    #[test]
    fn style_count_is_14() {
        assert_eq!(ALL_STYLES.len(), 14);
    }

    #[test]
    fn register_count_is_6() {
        assert_eq!(ALL_REGISTERS.len(), 6);
    }
}
