// GENERATED FILE - DO NOT EDIT.
// Source: design-system/tokens/colors.json
// Regenerate: pnpm tokens:sync (design-system/generate-native-tokens.js)
// tokens v1.0.0

import SwiftUI

/// Raw hex values from the design tokens (use with `Color(hex:)`).
public enum FerniTokens {
    public enum Persona {
        /// Ferni: Deep sage green - grounding, wise, natural leader
        public static let ferniPrimary: UInt = 0x4a6741
        public static let ferniSecondary: UInt = 0x3d5a35
        public static let ferniTextOnDark: UInt = 0xa5c99a
        /// Jack: LEGACY: Warm cedar brown brand accent. NOT a persona - use for brand accents. Alias: --color-cedar
        public static let jackPrimary: UInt = 0x9a7b5a
        public static let jackSecondary: UInt = 0x7d6348
        public static let jackTextOnDark: UInt = 0xd4c4a8
        /// Peter: Ocean teal - depth, discovery, research
        public static let peterPrimary: UInt = 0x3a6b73
        public static let peterSecondary: UInt = 0x2d5359
        public static let peterTextOnDark: UInt = 0x8bc4cf
        /// Alex: Soft indigo - clarity, flow, communication
        public static let alexPrimary: UInt = 0x5a6b8a
        public static let alexSecondary: UInt = 0x4a5a73
        public static let alexTextOnDark: UInt = 0xa8b8d8
        /// Maya: Dusty terracotta - nurturing, warmth, habits
        public static let mayaPrimary: UInt = 0xa67a6a
        public static let mayaSecondary: UInt = 0x8a635a
        public static let mayaTextOnDark: UInt = 0xe0b8a8
        /// Jordan: Warm sunset coral - celebration, joy, events
        public static let jordanPrimary: UInt = 0xc4856a
        public static let jordanSecondary: UInt = 0xa86d55
        public static let jordanTextOnDark: UInt = 0xf0c0a0
        /// Nayan: Golden Amber - wisdom, warmth, guidance
        public static let nayanPrimary: UInt = 0xb8956a
        public static let nayanSecondary: UInt = 0x9a7a52
        public static let nayanTextOnDark: UInt = 0xe8d0a8
        /// Joel: Vanguard burgundy red - distinguished, trustworthy, Stanford PhD mentor
        public static let joelPrimary: UInt = 0x9a0718
        public static let joelSecondary: UInt = 0x7a0514
        public static let joelTextOnDark: UInt = 0xf0a8a8
        /// Eli: Deep purple - focus, calm amidst chaos, ADHD coach
        public static let eliPrimary: UInt = 0x6b5b95
        public static let eliSecondary: UInt = 0x4a4063
        public static let eliTextOnDark: UInt = 0xb8a8d8
        /// Marcus: Deep forest green - grounding, stability, sobriety companion
        public static let marcusPrimary: UInt = 0x2d5a4a
        public static let marcusSecondary: UInt = 0x1e3d32
        public static let marcusTextOnDark: UInt = 0x88c4a8
        /// Kenji: Midnight blue - calm, sleep, peaceful nights
        public static let kenjiPrimary: UInt = 0x2c3e50
        public static let kenjiSecondary: UInt = 0x1a252f
        public static let kenjiTextOnDark: UInt = 0x90b0c8
        /// Carmen: Warm sand - nurturing, earthy, parenting partner
        public static let carmenPrimary: UInt = 0xd4a373
        public static let carmenSecondary: UInt = 0xa67b5b
        public static let carmenTextOnDark: UInt = 0xf0d0a8
        /// Amara: Soft violet - healing, understanding, chronic illness ally
        public static let amaraPrimary: UInt = 0x7b6ba8
        public static let amaraSecondary: UInt = 0x5a4d80
        public static let amaraTextOnDark: UInt = 0xc0b0d8
        /// Sasha: Creative coral - inspiration, energy, creative catalyst
        public static let sashaPrimary: UInt = 0xe07b53
        public static let sashaSecondary: UInt = 0xb85c3c
        public static let sashaTextOnDark: UInt = 0xf8b898
        /// Ray: Professional slate - strategic, grounded, career architect
        public static let rayPrimary: UInt = 0x4a5568
        public static let raySecondary: UInt = 0x2d3748
        public static let rayTextOnDark: UInt = 0xa0b0c0

        /// Primary color as "#rrggbb" (Ferni for unknown ids)
        public static func primaryHexString(for id: String) -> String {
            switch id.lowercased() {
            case "ferni": return "#4a6741"
            case "jack": return "#9a7b5a"
            case "peter": return "#3a6b73"
            case "alex": return "#5a6b8a"
            case "maya": return "#a67a6a"
            case "jordan": return "#c4856a"
            case "nayan": return "#b8956a"
            case "joel": return "#9a0718"
            case "eli": return "#6b5b95"
            case "marcus": return "#2d5a4a"
            case "kenji": return "#2c3e50"
            case "carmen": return "#d4a373"
            case "amara": return "#7b6ba8"
            case "sasha": return "#e07b53"
            case "ray": return "#4a5568"
            default: return "#4a6741"
            }
        }
    }

    /// Light (zen) theme
    public enum Zen {
        public static let backgroundPrimary: UInt = 0xfaf8f5
        public static let backgroundSecondary: UInt = 0xf5f2ed
        public static let backgroundElevated: UInt = 0xfffdfb
        public static let textPrimary: UInt = 0x2c2520
        public static let textSecondary: UInt = 0x5c544a
        public static let textMuted: UInt = 0x6b635a
        public static let textDimmed: UInt = 0x756a5e
        public static let accent: UInt = 0x3d5a45
        public static let accentHover: UInt = 0x4a6b52
        public static let accentPressed: UInt = 0x2d4535
        public static let success: UInt = 0x3d7a52
        public static let error: UInt = 0xb5453a
        public static let warning: UInt = 0xa67c35
        public static let info: UInt = 0x3a6b9c
    }

    /// Dark (midnight) theme
    public enum Midnight {
        public static let backgroundPrimary: UInt = 0x584840
        public static let backgroundSecondary: UInt = 0x60504a
        public static let backgroundElevated: UInt = 0x70605a
        public static let textPrimary: UInt = 0xfaf6f0
        public static let textSecondary: UInt = 0xf0ebe4
        public static let textMuted: UInt = 0xe8e2da
        public static let textDimmed: UInt = 0xe0d8ce
        public static let accent: UInt = 0xd4a84a
        public static let accentHover: UInt = 0xe0bc6a
        public static let accentPressed: UInt = 0xc49a3a
        public static let success: UInt = 0x6bc48f
        public static let error: UInt = 0xe07575
        public static let warning: UInt = 0xe0b860
        public static let info: UInt = 0x7da6cf
    }
}

// MARK: - FerniColors (token-derived part; hand-written part in FerniColors.swift)

extension FerniColors {
    /// Ferni: Deep sage green - grounding, wise, natural leader
    public static let ferni = PersonaColor(
        primary: Color(hex: FerniTokens.Persona.ferniPrimary),
        secondary: Color(hex: FerniTokens.Persona.ferniSecondary),
        textOnDark: Color(hex: FerniTokens.Persona.ferniTextOnDark),
        glow: Color(hex: FerniTokens.Persona.ferniPrimary).opacity(0.28)
    )
    /// Jack: LEGACY: Warm cedar brown brand accent. NOT a persona - use for brand accents. Alias: --color-cedar
    public static let jack = PersonaColor(
        primary: Color(hex: FerniTokens.Persona.jackPrimary),
        secondary: Color(hex: FerniTokens.Persona.jackSecondary),
        textOnDark: Color(hex: FerniTokens.Persona.jackTextOnDark),
        glow: Color(hex: FerniTokens.Persona.jackPrimary).opacity(0.28)
    )
    /// Peter: Ocean teal - depth, discovery, research
    public static let peter = PersonaColor(
        primary: Color(hex: FerniTokens.Persona.peterPrimary),
        secondary: Color(hex: FerniTokens.Persona.peterSecondary),
        textOnDark: Color(hex: FerniTokens.Persona.peterTextOnDark),
        glow: Color(hex: FerniTokens.Persona.peterPrimary).opacity(0.28)
    )
    /// Alex: Soft indigo - clarity, flow, communication
    public static let alex = PersonaColor(
        primary: Color(hex: FerniTokens.Persona.alexPrimary),
        secondary: Color(hex: FerniTokens.Persona.alexSecondary),
        textOnDark: Color(hex: FerniTokens.Persona.alexTextOnDark),
        glow: Color(hex: FerniTokens.Persona.alexPrimary).opacity(0.28)
    )
    /// Maya: Dusty terracotta - nurturing, warmth, habits
    public static let maya = PersonaColor(
        primary: Color(hex: FerniTokens.Persona.mayaPrimary),
        secondary: Color(hex: FerniTokens.Persona.mayaSecondary),
        textOnDark: Color(hex: FerniTokens.Persona.mayaTextOnDark),
        glow: Color(hex: FerniTokens.Persona.mayaPrimary).opacity(0.28)
    )
    /// Jordan: Warm sunset coral - celebration, joy, events
    public static let jordan = PersonaColor(
        primary: Color(hex: FerniTokens.Persona.jordanPrimary),
        secondary: Color(hex: FerniTokens.Persona.jordanSecondary),
        textOnDark: Color(hex: FerniTokens.Persona.jordanTextOnDark),
        glow: Color(hex: FerniTokens.Persona.jordanPrimary).opacity(0.28)
    )
    /// Nayan: Golden Amber - wisdom, warmth, guidance
    public static let nayan = PersonaColor(
        primary: Color(hex: FerniTokens.Persona.nayanPrimary),
        secondary: Color(hex: FerniTokens.Persona.nayanSecondary),
        textOnDark: Color(hex: FerniTokens.Persona.nayanTextOnDark),
        glow: Color(hex: FerniTokens.Persona.nayanPrimary).opacity(0.28)
    )
    /// Joel: Vanguard burgundy red - distinguished, trustworthy, Stanford PhD mentor
    public static let joel = PersonaColor(
        primary: Color(hex: FerniTokens.Persona.joelPrimary),
        secondary: Color(hex: FerniTokens.Persona.joelSecondary),
        textOnDark: Color(hex: FerniTokens.Persona.joelTextOnDark),
        glow: Color(hex: FerniTokens.Persona.joelPrimary).opacity(0.28)
    )
    /// Eli: Deep purple - focus, calm amidst chaos, ADHD coach
    public static let eli = PersonaColor(
        primary: Color(hex: FerniTokens.Persona.eliPrimary),
        secondary: Color(hex: FerniTokens.Persona.eliSecondary),
        textOnDark: Color(hex: FerniTokens.Persona.eliTextOnDark),
        glow: Color(hex: FerniTokens.Persona.eliPrimary).opacity(0.28)
    )
    /// Marcus: Deep forest green - grounding, stability, sobriety companion
    public static let marcus = PersonaColor(
        primary: Color(hex: FerniTokens.Persona.marcusPrimary),
        secondary: Color(hex: FerniTokens.Persona.marcusSecondary),
        textOnDark: Color(hex: FerniTokens.Persona.marcusTextOnDark),
        glow: Color(hex: FerniTokens.Persona.marcusPrimary).opacity(0.28)
    )
    /// Kenji: Midnight blue - calm, sleep, peaceful nights
    public static let kenji = PersonaColor(
        primary: Color(hex: FerniTokens.Persona.kenjiPrimary),
        secondary: Color(hex: FerniTokens.Persona.kenjiSecondary),
        textOnDark: Color(hex: FerniTokens.Persona.kenjiTextOnDark),
        glow: Color(hex: FerniTokens.Persona.kenjiPrimary).opacity(0.28)
    )
    /// Carmen: Warm sand - nurturing, earthy, parenting partner
    public static let carmen = PersonaColor(
        primary: Color(hex: FerniTokens.Persona.carmenPrimary),
        secondary: Color(hex: FerniTokens.Persona.carmenSecondary),
        textOnDark: Color(hex: FerniTokens.Persona.carmenTextOnDark),
        glow: Color(hex: FerniTokens.Persona.carmenPrimary).opacity(0.28)
    )
    /// Amara: Soft violet - healing, understanding, chronic illness ally
    public static let amara = PersonaColor(
        primary: Color(hex: FerniTokens.Persona.amaraPrimary),
        secondary: Color(hex: FerniTokens.Persona.amaraSecondary),
        textOnDark: Color(hex: FerniTokens.Persona.amaraTextOnDark),
        glow: Color(hex: FerniTokens.Persona.amaraPrimary).opacity(0.28)
    )
    /// Sasha: Creative coral - inspiration, energy, creative catalyst
    public static let sasha = PersonaColor(
        primary: Color(hex: FerniTokens.Persona.sashaPrimary),
        secondary: Color(hex: FerniTokens.Persona.sashaSecondary),
        textOnDark: Color(hex: FerniTokens.Persona.sashaTextOnDark),
        glow: Color(hex: FerniTokens.Persona.sashaPrimary).opacity(0.28)
    )
    /// Ray: Professional slate - strategic, grounded, career architect
    public static let ray = PersonaColor(
        primary: Color(hex: FerniTokens.Persona.rayPrimary),
        secondary: Color(hex: FerniTokens.Persona.raySecondary),
        textOnDark: Color(hex: FerniTokens.Persona.rayTextOnDark),
        glow: Color(hex: FerniTokens.Persona.rayPrimary).opacity(0.28)
    )

    public enum Zen {
        public static let bgPrimary = Color(hex: FerniTokens.Zen.backgroundPrimary)
        public static let bgSecondary = Color(hex: FerniTokens.Zen.backgroundSecondary)
        public static let bgElevated = Color(hex: FerniTokens.Zen.backgroundElevated)
        public static let textPrimary = Color(hex: FerniTokens.Zen.textPrimary)
        public static let textSecondary = Color(hex: FerniTokens.Zen.textSecondary)
        public static let textMuted = Color(hex: FerniTokens.Zen.textMuted)
        public static let textDimmed = Color(hex: FerniTokens.Zen.textDimmed)
        public static let accent = Color(hex: FerniTokens.Zen.accent)
        public static let accentHover = Color(hex: FerniTokens.Zen.accentHover)
        public static let accentPressed = Color(hex: FerniTokens.Zen.accentPressed)
        public static let success = Color(hex: FerniTokens.Zen.success)
        public static let error = Color(hex: FerniTokens.Zen.error)
        public static let warning = Color(hex: FerniTokens.Zen.warning)
        public static let info = Color(hex: FerniTokens.Zen.info)
    }

    public enum Midnight {
        public static let bgPrimary = Color(hex: FerniTokens.Midnight.backgroundPrimary)
        public static let bgSecondary = Color(hex: FerniTokens.Midnight.backgroundSecondary)
        public static let bgElevated = Color(hex: FerniTokens.Midnight.backgroundElevated)
        public static let textPrimary = Color(hex: FerniTokens.Midnight.textPrimary)
        public static let textSecondary = Color(hex: FerniTokens.Midnight.textSecondary)
        public static let textMuted = Color(hex: FerniTokens.Midnight.textMuted)
        public static let textDimmed = Color(hex: FerniTokens.Midnight.textDimmed)
        public static let accent = Color(hex: FerniTokens.Midnight.accent)
        public static let accentHover = Color(hex: FerniTokens.Midnight.accentHover)
        public static let accentPressed = Color(hex: FerniTokens.Midnight.accentPressed)
        public static let success = Color(hex: FerniTokens.Midnight.success)
        public static let error = Color(hex: FerniTokens.Midnight.error)
        public static let warning = Color(hex: FerniTokens.Midnight.warning)
        public static let info = Color(hex: FerniTokens.Midnight.info)
    }

    public enum Semantic {
        public static let success = Color(hex: FerniTokens.Zen.success)
        public static let successDark = Color(hex: FerniTokens.Midnight.success)
        public static let error = Color(hex: FerniTokens.Zen.error)
        public static let errorDark = Color(hex: FerniTokens.Midnight.error)
        public static let warning = Color(hex: FerniTokens.Zen.warning)
        public static let warningDark = Color(hex: FerniTokens.Midnight.warning)
        public static let info = Color(hex: FerniTokens.Zen.info)
        public static let infoDark = Color(hex: FerniTokens.Midnight.info)
    }

    /// Persona colors by id (Ferni for unknown ids)
    public static func persona(for id: String) -> PersonaColor {
        switch id.lowercased() {
        case "ferni": return ferni
        case "jack": return jack
        case "peter": return peter
        case "alex": return alex
        case "maya": return maya
        case "jordan": return jordan
        case "nayan": return nayan
        case "joel": return joel
        case "eli": return eli
        case "marcus": return marcus
        case "kenji": return kenji
        case "carmen": return carmen
        case "amara": return amara
        case "sasha": return sasha
        case "ray": return ray
        default: return ferni
        }
    }
}
