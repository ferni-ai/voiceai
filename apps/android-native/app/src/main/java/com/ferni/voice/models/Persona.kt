package com.ferni.voice.models

import androidx.compose.ui.graphics.Color

/**
 * Represents a Ferni team member persona with their unique styling.
 * Colors sourced from design-system/tokens/colors.json
 */
data class Persona(
    val id: String,
    val name: String,
    val emoji: String,
    val initials: String,
    val role: String,
    val specialty: String,
    val primaryColor: Color,
    val secondaryColor: Color,
    val glowColor: Color
) {
    /** The primary hex value for gradient generation */
    val primaryHex: String
        get() = when (id) {
            "ferni" -> "#4a6741"
            "maya" -> "#a67a6a"
            "alex" -> "#5a6b8a"
            "jordan" -> "#c4856a"
            "peter" -> "#3a6b73"
            "nayan" -> "#9a7b5a"
            else -> "#4a6741"
        }

    /** Short tagline for display (alias for role) */
    val tagline: String get() = role

    companion object {
        /** Ferni - CEO & Life Coach (Sage Green) */
        val ferni = Persona(
            id = "ferni",
            name = "Ferni",
            emoji = "\uD83C\uDF3F", // 🌿
            initials = "FE",
            role = "Life Coach",
            specialty = "Leadership, life direction, bringing in the right expert",
            primaryColor = Color(0xFF4a6741),
            secondaryColor = Color(0xFF3d5a35),
            glowColor = Color(0xFF4a6741).copy(alpha = 0.4f)
        )

        /** Maya Santos - Habits Coach (Rose/Terracotta) */
        val maya = Persona(
            id = "maya",
            name = "Maya",
            emoji = "\uD83E\uDD8B", // 🦋
            initials = "MS",
            role = "Habits Coach",
            specialty = "Building habits, breaking bad ones, behavior change",
            primaryColor = Color(0xFFa67a6a),
            secondaryColor = Color(0xFF8a635a),
            glowColor = Color(0xFFa67a6a).copy(alpha = 0.4f)
        )

        /** Alex Chen - Communications Coach (Slate Blue) */
        val alex = Persona(
            id = "alex",
            name = "Alex",
            emoji = "\uD83D\uDCAC", // 💬
            initials = "AC",
            role = "Communications",
            specialty = "Difficult conversations, relationships, conflict resolution",
            primaryColor = Color(0xFF5a6b8a),
            secondaryColor = Color(0xFF4a5a73),
            glowColor = Color(0xFF5a6b8a).copy(alpha = 0.4f)
        )

        /** Jordan Taylor - Life Planner (Coral) */
        val jordan = Persona(
            id = "jordan",
            name = "Jordan",
            emoji = "\uD83D\uDCCB", // 📋
            initials = "JT",
            role = "Life Planner",
            specialty = "Goals, planning, productivity, time management",
            primaryColor = Color(0xFFc4856a),
            secondaryColor = Color(0xFFa86d55),
            glowColor = Color(0xFFc4856a).copy(alpha = 0.4f)
        )

        /** Peter John - Research Analyst (Ocean Teal) */
        val peter = Persona(
            id = "peter",
            name = "Peter",
            emoji = "\uD83D\uDD2C", // 🔬
            initials = "PJ",
            role = "Research",
            specialty = "Deep research, analysis, finding answers",
            primaryColor = Color(0xFF3a6b73),
            secondaryColor = Color(0xFF2d5359),
            glowColor = Color(0xFF3a6b73).copy(alpha = 0.4f)
        )

        /** Nayan Patel - Wisdom Sage (Warm Brown/Gold) */
        val nayan = Persona(
            id = "nayan",
            name = "Nayan",
            emoji = "\uD83E\uDDD8", // 🧘
            initials = "NP",
            role = "Wisdom",
            specialty = "Philosophy, mindfulness, deeper meaning",
            primaryColor = Color(0xFF9a7b5a),
            secondaryColor = Color(0xFF7a5b3a),
            glowColor = Color(0xFFb8956a).copy(alpha = 0.4f)
        )

        /** All personas in display order */
        val all: List<Persona> = listOf(ferni, maya, alex, jordan, peter, nayan)

        /** Get persona by ID, defaults to Ferni */
        fun get(id: String): Persona = all.find { it.id == id } ?: ferni
    }
}
