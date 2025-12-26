import SwiftUI

// MARK: - Ferni Colors
/// Centralized color system for Ferni iOS app and widgets.
/// Colors are sourced from design-system/tokens/colors.json and provide
/// theme-aware variants for light and dark mode.
///
/// Usage:
///   .foregroundColor(FerniColors.ferni.text)      // Theme-aware text color
///   .background(FerniColors.ferni.primary)        // Background/fill color
///   .shadow(color: FerniColors.ferni.glow, ...)   // Glow effect

public enum FerniColors {

    // MARK: - Persona Colors

    /// Ferni - Sage Green (Life Coach)
    public static let ferni = PersonaColor(
        primary: Color(hex: 0x4a6741),
        secondary: Color(hex: 0x3d5a35),
        textOnDark: Color(hex: 0xa5c99a),  // 4.8:1 contrast
        glow: Color(hex: 0x4a6741).opacity(0.28)
    )

    /// Peter - Ocean Teal (Research)
    public static let peter = PersonaColor(
        primary: Color(hex: 0x3a6b73),
        secondary: Color(hex: 0x2d5359),
        textOnDark: Color(hex: 0x8bc4cf),  // 4.9:1 contrast
        glow: Color(hex: 0x3a6b73).opacity(0.28)
    )

    /// Alex - Slate Blue (Communications)
    public static let alex = PersonaColor(
        primary: Color(hex: 0x5a6b8a),
        secondary: Color(hex: 0x4a5a73),
        textOnDark: Color(hex: 0xa8b8d8),  // 4.7:1 contrast
        glow: Color(hex: 0x5a6b8a).opacity(0.28)
    )

    /// Maya - Terracotta (Habits Coach)
    public static let maya = PersonaColor(
        primary: Color(hex: 0xa67a6a),
        secondary: Color(hex: 0x8a635a),
        textOnDark: Color(hex: 0xe0b8a8),  // 5.2:1 contrast
        glow: Color(hex: 0xa67a6a).opacity(0.28)
    )

    /// Jordan - Coral (Life Planner)
    public static let jordan = PersonaColor(
        primary: Color(hex: 0xc4856a),
        secondary: Color(hex: 0xa86d55),
        textOnDark: Color(hex: 0xf0c0a0),  // 5.5:1 contrast
        glow: Color(hex: 0xc4856a).opacity(0.28)
    )

    /// Nayan - Golden Amber (Wisdom)
    public static let nayan = PersonaColor(
        primary: Color(hex: 0xb8956a),
        secondary: Color(hex: 0x9a7a52),
        textOnDark: Color(hex: 0xe8d0a8),  // 5.8:1 contrast
        glow: Color(hex: 0xb8956a).opacity(0.28)
    )

    /// Jack - Cedar Brown (Brand accent, not a persona)
    public static let jack = PersonaColor(
        primary: Color(hex: 0x9a7b5a),
        secondary: Color(hex: 0x7d6348),
        textOnDark: Color(hex: 0xd4c4a8),
        glow: Color(hex: 0x9a7b5a).opacity(0.28)
    )

    // MARK: - Marketplace Personas

    public static let eli = PersonaColor(
        primary: Color(hex: 0x6B5B95),
        secondary: Color(hex: 0x4A4063),
        textOnDark: Color(hex: 0xb8a8d8),
        glow: Color(hex: 0x6B5B95).opacity(0.28)
    )

    public static let marcus = PersonaColor(
        primary: Color(hex: 0x2D5A4A),
        secondary: Color(hex: 0x1E3D32),
        textOnDark: Color(hex: 0x88c4a8),
        glow: Color(hex: 0x2D5A4A).opacity(0.28)
    )

    public static let kenji = PersonaColor(
        primary: Color(hex: 0x2C3E50),
        secondary: Color(hex: 0x1A252F),
        textOnDark: Color(hex: 0x90b0c8),
        glow: Color(hex: 0x2C3E50).opacity(0.28)
    )

    public static let carmen = PersonaColor(
        primary: Color(hex: 0xD4A373),
        secondary: Color(hex: 0xA67B5B),
        textOnDark: Color(hex: 0xf0d0a8),
        glow: Color(hex: 0xD4A373).opacity(0.28)
    )

    public static let amara = PersonaColor(
        primary: Color(hex: 0x7B6BA8),
        secondary: Color(hex: 0x5A4D80),
        textOnDark: Color(hex: 0xc0b0d8),
        glow: Color(hex: 0x7B6BA8).opacity(0.28)
    )

    public static let sasha = PersonaColor(
        primary: Color(hex: 0xE07B53),
        secondary: Color(hex: 0xB85C3C),
        textOnDark: Color(hex: 0xf8b898),
        glow: Color(hex: 0xE07B53).opacity(0.28)
    )

    public static let ray = PersonaColor(
        primary: Color(hex: 0x4A5568),
        secondary: Color(hex: 0x2D3748),
        textOnDark: Color(hex: 0xa0b0c0),
        glow: Color(hex: 0x4A5568).opacity(0.28)
    )

    // MARK: - Theme Colors (Zen/Light)

    public enum Zen {
        public static let bgPrimary = Color(hex: 0xfaf8f5)
        public static let bgSecondary = Color(hex: 0xf5f2ed)
        public static let bgElevated = Color(hex: 0xfffdfb)

        public static let textPrimary = Color(hex: 0x2c2520)
        public static let textSecondary = Color(hex: 0x5c544a)
        public static let textMuted = Color(hex: 0x756a5e)

        public static let accent = Color(hex: 0x3D5A45)
        public static let accentHover = Color(hex: 0x4a6b52)
    }

    // MARK: - Theme Colors (Midnight/Dark)

    public enum Midnight {
        public static let bgPrimary = Color(hex: 0x584840)
        public static let bgSecondary = Color(hex: 0x60504a)
        public static let bgElevated = Color(hex: 0x70605a)

        public static let textPrimary = Color(hex: 0xfaf6f0)
        public static let textSecondary = Color(hex: 0xf0ebe4)
        public static let textMuted = Color(hex: 0xe8e2da)

        public static let accent = Color(hex: 0xd4a84a)
        public static let accentHover = Color(hex: 0xe0bc6a)
    }

    // MARK: - Widget-Specific Colors

    public enum Widget {
        /// Dark background for widgets
        public static let bgDark = Color(hex: 0x1a1a1a)

        /// Zen dark background (very dark)
        public static let zenDark = Color(hex: 0x12121a)

        /// Action button variants (progressively lighter greens)
        public static let actionVent = Color(hex: 0x5a7a6a)
        public static let actionMusic = Color(hex: 0x6a8a7a)
        public static let actionCheckIn = Color(hex: 0x7a9a8a)
    }

    // MARK: - Semantic Colors

    public enum Semantic {
        public static let success = Color(hex: 0x3d7a52)
        public static let successDark = Color(hex: 0x6bc48f)

        public static let error = Color(hex: 0xb5453a)
        public static let errorDark = Color(hex: 0xe07575)

        public static let warning = Color(hex: 0xa67c35)
        public static let warningDark = Color(hex: 0xe0b860)
    }

    // MARK: - Lookup by ID

    public static func persona(for id: String) -> PersonaColor {
        switch id.lowercased() {
        case "ferni": return ferni
        case "peter": return peter
        case "alex": return alex
        case "maya": return maya
        case "jordan": return jordan
        case "nayan": return nayan
        case "jack": return jack
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

// MARK: - Persona Color Model

/// A persona's color palette with theme-aware text color
public struct PersonaColor {
    /// Primary brand color (use for backgrounds, avatars)
    public let primary: Color

    /// Darker variant (use for pressed states, borders)
    public let secondary: Color

    /// WCAG AA compliant text color for dark backgrounds
    /// Use when displaying persona-colored text on dark theme
    public let textOnDark: Color

    /// Glow effect color with opacity
    public let glow: Color

    public init(primary: Color, secondary: Color, textOnDark: Color, glow: Color) {
        self.primary = primary
        self.secondary = secondary
        self.textOnDark = textOnDark
        self.glow = glow
    }

    /// Theme-aware text color that adapts to light/dark mode
    /// - In light mode: returns primary (good contrast on light bg)
    /// - In dark mode: returns textOnDark (good contrast on dark bg)
    public var text: Color {
        // For iOS/widgets, we typically use dark backgrounds, so use textOnDark
        // If you need dynamic switching, use a view modifier with @Environment(\.colorScheme)
        textOnDark
    }
}
