package com.ferni.voice.ui.theme

import androidx.compose.ui.graphics.Color

// Persona colors come from FerniTokens (generated from design-system/tokens/colors.json)
object PersonaColors {
    val Ferni = FerniTokens.Persona.FerniPrimary
    val FerniSecondary = FerniTokens.Persona.FerniSecondary

    val Maya = FerniTokens.Persona.MayaPrimary
    val MayaSecondary = FerniTokens.Persona.MayaSecondary

    val Alex = FerniTokens.Persona.AlexPrimary
    val AlexSecondary = FerniTokens.Persona.AlexSecondary

    val Jordan = FerniTokens.Persona.JordanPrimary
    val JordanSecondary = FerniTokens.Persona.JordanSecondary

    val Peter = FerniTokens.Persona.PeterPrimary
    val PeterSecondary = FerniTokens.Persona.PeterSecondary

    val Nayan = FerniTokens.Persona.NayanPrimary
    val NayanSecondary = FerniTokens.Persona.NayanSecondary
}

// Brand Colors
object BrandColors {
    val Accent = FerniTokens.Zen.Accent                 // CTA buttons
    val NaturalInk = FerniTokens.Zen.TextPrimary        // Primary text
    val Cream = FerniTokens.Zen.BackgroundPrimary       // Paper Cream background
    val WarmGold = FerniTokens.Midnight.Accent          // Warmth, connection (dark-theme gold)
}

// System Colors
val SurfaceDark = Color(0xFF1A1A1A)
val SurfaceLight = BrandColors.Cream
val OnSurfaceDark = Color(0xFFFFFFFF)
val OnSurfaceLight = BrandColors.NaturalInk

// Backdrop Colors
val BackdropDark = Color(0x99000000)
val BackdropLight = Color(0x66FFFFFF)
