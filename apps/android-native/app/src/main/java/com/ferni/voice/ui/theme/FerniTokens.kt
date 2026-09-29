// GENERATED FILE - DO NOT EDIT.
// Source: design-system/tokens/colors.json
// Regenerate: pnpm tokens:sync (design-system/generate-native-tokens.js)
// tokens v1.0.0

package com.ferni.voice.ui.theme

import androidx.compose.ui.graphics.Color

object FerniTokens {
    object Persona {
        /** Ferni: Deep sage green - grounding, wise, natural leader */
        val FerniPrimary = Color(0xFF4a6741)
        val FerniSecondary = Color(0xFF3d5a35)
        val FerniTextOnDark = Color(0xFFa5c99a)
        /** Jack: LEGACY: Warm cedar brown brand accent. NOT a persona - use for brand accents. Alias: --color-cedar */
        val JackPrimary = Color(0xFF9a7b5a)
        val JackSecondary = Color(0xFF7d6348)
        val JackTextOnDark = Color(0xFFd4c4a8)
        /** Peter: Ocean teal - depth, discovery, research */
        val PeterPrimary = Color(0xFF3a6b73)
        val PeterSecondary = Color(0xFF2d5359)
        val PeterTextOnDark = Color(0xFF8bc4cf)
        /** Alex: Soft indigo - clarity, flow, communication */
        val AlexPrimary = Color(0xFF5a6b8a)
        val AlexSecondary = Color(0xFF4a5a73)
        val AlexTextOnDark = Color(0xFFa8b8d8)
        /** Maya: Dusty terracotta - nurturing, warmth, habits */
        val MayaPrimary = Color(0xFFa67a6a)
        val MayaSecondary = Color(0xFF8a635a)
        val MayaTextOnDark = Color(0xFFe0b8a8)
        /** Jordan: Warm sunset coral - celebration, joy, events */
        val JordanPrimary = Color(0xFFc4856a)
        val JordanSecondary = Color(0xFFa86d55)
        val JordanTextOnDark = Color(0xFFf0c0a0)
        /** Nayan: Golden Amber - wisdom, warmth, guidance */
        val NayanPrimary = Color(0xFFb8956a)
        val NayanSecondary = Color(0xFF9a7a52)
        val NayanTextOnDark = Color(0xFFe8d0a8)
        /** Joel: Vanguard burgundy red - distinguished, trustworthy, Stanford PhD mentor */
        val JoelPrimary = Color(0xFF9a0718)
        val JoelSecondary = Color(0xFF7a0514)
        val JoelTextOnDark = Color(0xFFf0a8a8)
        /** Eli: Deep purple - focus, calm amidst chaos, ADHD coach */
        val EliPrimary = Color(0xFF6b5b95)
        val EliSecondary = Color(0xFF4a4063)
        val EliTextOnDark = Color(0xFFb8a8d8)
        /** Marcus: Deep forest green - grounding, stability, sobriety companion */
        val MarcusPrimary = Color(0xFF2d5a4a)
        val MarcusSecondary = Color(0xFF1e3d32)
        val MarcusTextOnDark = Color(0xFF88c4a8)
        /** Kenji: Midnight blue - calm, sleep, peaceful nights */
        val KenjiPrimary = Color(0xFF2c3e50)
        val KenjiSecondary = Color(0xFF1a252f)
        val KenjiTextOnDark = Color(0xFF90b0c8)
        /** Carmen: Warm sand - nurturing, earthy, parenting partner */
        val CarmenPrimary = Color(0xFFd4a373)
        val CarmenSecondary = Color(0xFFa67b5b)
        val CarmenTextOnDark = Color(0xFFf0d0a8)
        /** Amara: Soft violet - healing, understanding, chronic illness ally */
        val AmaraPrimary = Color(0xFF7b6ba8)
        val AmaraSecondary = Color(0xFF5a4d80)
        val AmaraTextOnDark = Color(0xFFc0b0d8)
        /** Sasha: Creative coral - inspiration, energy, creative catalyst */
        val SashaPrimary = Color(0xFFe07b53)
        val SashaSecondary = Color(0xFFb85c3c)
        val SashaTextOnDark = Color(0xFFf8b898)
        /** Ray: Professional slate - strategic, grounded, career architect */
        val RayPrimary = Color(0xFF4a5568)
        val RaySecondary = Color(0xFF2d3748)
        val RayTextOnDark = Color(0xFFa0b0c0)

        /** Primary color as "#rrggbb" (Ferni for unknown ids) */
        fun primaryHex(id: String): String = when (id.lowercase()) {
            "ferni" -> "#4a6741"
            "jack" -> "#9a7b5a"
            "peter" -> "#3a6b73"
            "alex" -> "#5a6b8a"
            "maya" -> "#a67a6a"
            "jordan" -> "#c4856a"
            "nayan" -> "#b8956a"
            "joel" -> "#9a0718"
            "eli" -> "#6b5b95"
            "marcus" -> "#2d5a4a"
            "kenji" -> "#2c3e50"
            "carmen" -> "#d4a373"
            "amara" -> "#7b6ba8"
            "sasha" -> "#e07b53"
            "ray" -> "#4a5568"
            else -> "#4a6741"
        }
    }

    /** Light (zen) theme */
    object Zen {
        val BackgroundPrimary = Color(0xFFfaf8f5)
        val BackgroundSecondary = Color(0xFFf5f2ed)
        val BackgroundElevated = Color(0xFFfffdfb)
        val TextPrimary = Color(0xFF2c2520)
        val TextSecondary = Color(0xFF5c544a)
        val TextMuted = Color(0xFF6b635a)
        val TextDimmed = Color(0xFF756a5e)
        val Accent = Color(0xFF3d5a45)
        val AccentHover = Color(0xFF4a6b52)
        val AccentPressed = Color(0xFF2d4535)
        val Success = Color(0xFF3d7a52)
        val Error = Color(0xFFb5453a)
        val Warning = Color(0xFFa67c35)
        val Info = Color(0xFF3a6b9c)
    }

    /** Dark (midnight) theme */
    object Midnight {
        val BackgroundPrimary = Color(0xFF584840)
        val BackgroundSecondary = Color(0xFF60504a)
        val BackgroundElevated = Color(0xFF70605a)
        val TextPrimary = Color(0xFFfaf6f0)
        val TextSecondary = Color(0xFFf0ebe4)
        val TextMuted = Color(0xFFe8e2da)
        val TextDimmed = Color(0xFFe0d8ce)
        val Accent = Color(0xFFd4a84a)
        val AccentHover = Color(0xFFe0bc6a)
        val AccentPressed = Color(0xFFc49a3a)
        val Success = Color(0xFF6bc48f)
        val Error = Color(0xFFe07575)
        val Warning = Color(0xFFe0b860)
        val Info = Color(0xFF7da6cf)
    }
}
