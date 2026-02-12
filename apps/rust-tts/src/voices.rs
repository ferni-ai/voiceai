/// Persona voice configuration for Ferni AI.
///
/// Maps persona IDs to natural language voice descriptions used by
/// Qwen3-TTS VoiceDesign mode. Mirrors the Python server's
/// PERSONA_VOICE_DESIGNS and PERSONA_ALIASES.

/// Voice design descriptions for Ferni personas.
/// Used as the `voice_description` parameter in `generate_voice_design_from_text()`.
pub const PERSONA_VOICE_DESIGNS: &[(&str, &str)] = &[
    (
        "ferni",
        "Male, 30 years old, warm baritone, friendly and grounded, like a caring life coach who genuinely listens",
    ),
    (
        "maya",
        "Female, 28 years old, alto range, encouraging and energetic, like a personal trainer who motivates with warmth",
    ),
    (
        "peter",
        "Male, 45 years old, deep tenor, thoughtful and measured, like an Ivy League professor explaining complex topics simply",
    ),
    (
        "alex",
        "Female, 32 years old, clear and articulate mezzo-soprano, professional yet warm, like a trusted communications advisor",
    ),
    (
        "jordan",
        "Female, 26 years old, bright soprano, enthusiastic and organized, like a creative wedding planner full of ideas",
    ),
    (
        "nayan",
        "Male, 60 years old, deep bass-baritone, wise and serene, like an Indian philosopher sharing ancient wisdom",
    ),
    (
        "joel",
        "Male, 55 years old, authoritative baritone, confident and direct, like a legendary investor explaining market wisdom",
    ),
    (
        "lynch",
        "Male, 65 years old, warm tenor, folksy and approachable, like a legendary fund manager sharing investing stories",
    ),
    (
        "bogle",
        "Male, 70 years old, deep resonant voice, principled and measured, like the father of index investing giving a lecture",
    ),
];

/// Full persona IDs to short names.
const PERSONA_ALIASES: &[(&str, &str)] = &[
    ("maya-santos", "maya"),
    ("peter-john", "peter"),
    ("alex-chen", "alex"),
    ("jordan-taylor", "jordan"),
    ("nayan-patel", "nayan"),
    ("joel-dickson", "joel"),
    ("peter-lynch", "lynch"),
    ("john-bogle", "bogle"),
];

/// Resolve a voice ID to a short persona name.
///
/// Handles full names ("maya-santos" -> "maya"), underscores ("maya_santos" -> "maya"),
/// and passes through already-short names unchanged.
pub fn resolve_voice(voice_id: &str) -> String {
    let key = voice_id.to_lowercase().replace('_', "-");

    // Check aliases first (full names like "maya-santos")
    for &(alias, short) in PERSONA_ALIASES {
        if key == alias {
            return short.to_string();
        }
    }

    // Check if it's already a known persona name
    for &(name, _) in PERSONA_VOICE_DESIGNS {
        if key == name {
            return name.to_string();
        }
    }

    // Pass through unknown voices
    key
}

/// Get the voice description for a persona.
///
/// Returns the natural language description used by Qwen3-TTS VoiceDesign mode.
/// Falls back to a generic description for unknown personas.
pub fn get_voice_description(voice_id: &str) -> String {
    let resolved = resolve_voice(voice_id);

    for &(name, desc) in PERSONA_VOICE_DESIGNS {
        if resolved == name {
            return desc.to_string();
        }
    }

    format!("Natural conversational voice, {resolved}")
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── resolve_voice ────────────────────────────────────────

    #[test]
    fn resolve_short_name() {
        assert_eq!(resolve_voice("ferni"), "ferni");
        assert_eq!(resolve_voice("maya"), "maya");
        assert_eq!(resolve_voice("bogle"), "bogle");
    }

    #[test]
    fn resolve_full_name_alias() {
        assert_eq!(resolve_voice("maya-santos"), "maya");
        assert_eq!(resolve_voice("peter-lynch"), "lynch");
        assert_eq!(resolve_voice("john-bogle"), "bogle");
        assert_eq!(resolve_voice("joel-dickson"), "joel");
    }

    #[test]
    fn resolve_underscore_variant() {
        assert_eq!(resolve_voice("maya_santos"), "maya");
        assert_eq!(resolve_voice("peter_lynch"), "lynch");
    }

    #[test]
    fn resolve_case_insensitive() {
        assert_eq!(resolve_voice("FERNI"), "ferni");
        assert_eq!(resolve_voice("Maya-Santos"), "maya");
        assert_eq!(resolve_voice("PETER_LYNCH"), "lynch");
    }

    #[test]
    fn resolve_unknown_passthrough() {
        assert_eq!(resolve_voice("unknown-voice"), "unknown-voice");
        assert_eq!(resolve_voice("Custom_Voice"), "custom-voice");
    }

    #[test]
    fn resolve_all_nine_personas() {
        let expected = ["ferni", "maya", "peter", "alex", "jordan", "nayan", "joel", "lynch", "bogle"];
        for name in &expected {
            assert_eq!(resolve_voice(name), *name, "failed for persona: {name}");
        }
    }

    // ── get_voice_description ────────────────────────────────

    #[test]
    fn description_known_persona() {
        let desc = get_voice_description("ferni");
        assert!(desc.contains("warm baritone"), "ferni desc: {desc}");

        let desc = get_voice_description("maya");
        assert!(desc.contains("alto"), "maya desc: {desc}");
    }

    #[test]
    fn description_via_alias() {
        let desc = get_voice_description("maya-santos");
        assert!(desc.contains("alto"), "maya-santos should resolve to maya desc: {desc}");
    }

    #[test]
    fn description_unknown_fallback() {
        let desc = get_voice_description("unknown-voice");
        assert!(desc.starts_with("Natural conversational voice"), "fallback: {desc}");
        assert!(desc.contains("unknown-voice"), "should include voice id: {desc}");
    }

    #[test]
    fn all_personas_have_descriptions() {
        for &(name, expected_desc) in PERSONA_VOICE_DESIGNS {
            let desc = get_voice_description(name);
            assert_eq!(desc, expected_desc, "persona {name} description mismatch");
        }
    }
}
