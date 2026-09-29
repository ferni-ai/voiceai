package com.ferni.voice.models

import androidx.compose.ui.graphics.Color
import com.ferni.voice.ui.theme.FerniTokens

/**
 * Represents a Ferni team member persona with their unique styling.
 * Colors come from FerniTokens (generated from design-system/tokens/colors.json)
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
        get() = FerniTokens.Persona.primaryHex(id)

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
            primaryColor = FerniTokens.Persona.FerniPrimary,
            secondaryColor = FerniTokens.Persona.FerniSecondary,
            glowColor = FerniTokens.Persona.FerniPrimary.copy(alpha = 0.4f)
        )

        /** Maya Santos - Habits Coach (Rose/Terracotta) */
        val maya = Persona(
            id = "maya",
            name = "Maya",
            emoji = "\uD83E\uDD8B", // 🦋
            initials = "MS",
            role = "Habits Coach",
            specialty = "Building habits, breaking bad ones, behavior change",
            primaryColor = FerniTokens.Persona.MayaPrimary,
            secondaryColor = FerniTokens.Persona.MayaSecondary,
            glowColor = FerniTokens.Persona.MayaPrimary.copy(alpha = 0.4f)
        )

        /** Alex Chen - Communications Coach (Slate Blue) */
        val alex = Persona(
            id = "alex",
            name = "Alex",
            emoji = "\uD83D\uDCAC", // 💬
            initials = "AC",
            role = "Communications",
            specialty = "Difficult conversations, relationships, conflict resolution",
            primaryColor = FerniTokens.Persona.AlexPrimary,
            secondaryColor = FerniTokens.Persona.AlexSecondary,
            glowColor = FerniTokens.Persona.AlexPrimary.copy(alpha = 0.4f)
        )

        /** Jordan Taylor - Life Planner (Coral) */
        val jordan = Persona(
            id = "jordan",
            name = "Jordan",
            emoji = "\uD83D\uDCCB", // 📋
            initials = "JT",
            role = "Life Planner",
            specialty = "Goals, planning, productivity, time management",
            primaryColor = FerniTokens.Persona.JordanPrimary,
            secondaryColor = FerniTokens.Persona.JordanSecondary,
            glowColor = FerniTokens.Persona.JordanPrimary.copy(alpha = 0.4f)
        )

        /** Peter John - Research Analyst (Ocean Teal) */
        val peter = Persona(
            id = "peter",
            name = "Peter",
            emoji = "\uD83D\uDD2C", // 🔬
            initials = "PJ",
            role = "Research",
            specialty = "Deep research, analysis, finding answers",
            primaryColor = FerniTokens.Persona.PeterPrimary,
            secondaryColor = FerniTokens.Persona.PeterSecondary,
            glowColor = FerniTokens.Persona.PeterPrimary.copy(alpha = 0.4f)
        )

        /** Nayan Patel - Wisdom Sage (Warm Brown/Gold) */
        val nayan = Persona(
            id = "nayan",
            name = "Nayan",
            emoji = "\uD83E\uDDD8", // 🧘
            initials = "NP",
            role = "Wisdom",
            specialty = "Philosophy, mindfulness, deeper meaning",
            primaryColor = FerniTokens.Persona.NayanPrimary,
            secondaryColor = FerniTokens.Persona.NayanSecondary,
            glowColor = FerniTokens.Persona.NayanPrimary.copy(alpha = 0.4f)
        )

        /** All personas in display order */
        val all: List<Persona> = listOf(ferni, maya, alex, jordan, peter, nayan)

        /** Get persona by ID, defaults to Ferni */
        fun get(id: String): Persona = all.find { it.id == id } ?: ferni
    }
}
