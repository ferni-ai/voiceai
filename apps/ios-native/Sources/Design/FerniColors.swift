import SwiftUI

// MARK: - Ferni Colors
/// Centralized color system for Ferni iOS app.
/// Colors are sourced from design-system/tokens/colors.json and provide
/// theme-aware variants for light and dark mode.
///
/// Usage:
///   .foregroundColor(FerniColors.ferni.text)      // Theme-aware text color
///   .background(FerniColors.ferni.primary)        // Background/fill color
///   .shadow(color: FerniColors.ferni.glow, ...)   // Glow effect

enum FerniColors {

    // MARK: - Persona Colors

    /// Ferni - Sage Green (Life Coach)
    static let ferni = PersonaColor(
        primary: Color(hex: 0x4a6741),
        secondary: Color(hex: 0x3d5a35),
        textOnDark: Color(hex: 0xa5c99a),  // 4.8:1 contrast
        glow: Color(hex: 0x4a6741).opacity(0.28)
    )

    /// Peter - Ocean Teal (Research)
    static let peter = PersonaColor(
        primary: Color(hex: 0x3a6b73),
        secondary: Color(hex: 0x2d5359),
        textOnDark: Color(hex: 0x8bc4cf),  // 4.9:1 contrast
        glow: Color(hex: 0x3a6b73).opacity(0.28)
    )

    /// Alex - Slate Blue (Communications)
    static let alex = PersonaColor(
        primary: Color(hex: 0x5a6b8a),
        secondary: Color(hex: 0x4a5a73),
        textOnDark: Color(hex: 0xa8b8d8),  // 4.7:1 contrast
        glow: Color(hex: 0x5a6b8a).opacity(0.28)
    )

    /// Maya - Terracotta (Habits Coach)
    static let maya = PersonaColor(
        primary: Color(hex: 0xa67a6a),
        secondary: Color(hex: 0x8a635a),
        textOnDark: Color(hex: 0xe0b8a8),  // 5.2:1 contrast
        glow: Color(hex: 0xa67a6a).opacity(0.28)
    )

    /// Jordan - Coral (Life Planner)
    static let jordan = PersonaColor(
        primary: Color(hex: 0xc4856a),
        secondary: Color(hex: 0xa86d55),
        textOnDark: Color(hex: 0xf0c0a0),  // 5.5:1 contrast
        glow: Color(hex: 0xc4856a).opacity(0.28)
    )

    /// Nayan - Golden Amber (Wisdom)
    static let nayan = PersonaColor(
        primary: Color(hex: 0xb8956a),
        secondary: Color(hex: 0x9a7a52),
        textOnDark: Color(hex: 0xe8d0a8),  // 5.8:1 contrast
        glow: Color(hex: 0xb8956a).opacity(0.28)
    )

    /// Jack - Cedar Brown (Brand accent, not a persona)
    static let jack = PersonaColor(
        primary: Color(hex: 0x9a7b5a),
        secondary: Color(hex: 0x7d6348),
        textOnDark: Color(hex: 0xd4c4a8),
        glow: Color(hex: 0x9a7b5a).opacity(0.28)
    )

    // MARK: - Marketplace Personas

    static let eli = PersonaColor(
        primary: Color(hex: 0x6B5B95),
        secondary: Color(hex: 0x4A4063),
        textOnDark: Color(hex: 0xb8a8d8),
        glow: Color(hex: 0x6B5B95).opacity(0.28)
    )

    static let marcus = PersonaColor(
        primary: Color(hex: 0x2D5A4A),
        secondary: Color(hex: 0x1E3D32),
        textOnDark: Color(hex: 0x88c4a8),
        glow: Color(hex: 0x2D5A4A).opacity(0.28)
    )

    static let kenji = PersonaColor(
        primary: Color(hex: 0x2C3E50),
        secondary: Color(hex: 0x1A252F),
        textOnDark: Color(hex: 0x90b0c8),
        glow: Color(hex: 0x2C3E50).opacity(0.28)
    )

    static let carmen = PersonaColor(
        primary: Color(hex: 0xD4A373),
        secondary: Color(hex: 0xA67B5B),
        textOnDark: Color(hex: 0xf0d0a8),
        glow: Color(hex: 0xD4A373).opacity(0.28)
    )

    static let amara = PersonaColor(
        primary: Color(hex: 0x7B6BA8),
        secondary: Color(hex: 0x5A4D80),
        textOnDark: Color(hex: 0xc0b0d8),
        glow: Color(hex: 0x7B6BA8).opacity(0.28)
    )

    static let sasha = PersonaColor(
        primary: Color(hex: 0xE07B53),
        secondary: Color(hex: 0xB85C3C),
        textOnDark: Color(hex: 0xf8b898),
        glow: Color(hex: 0xE07B53).opacity(0.28)
    )

    static let ray = PersonaColor(
        primary: Color(hex: 0x4A5568),
        secondary: Color(hex: 0x2D3748),
        textOnDark: Color(hex: 0xa0b0c0),
        glow: Color(hex: 0x4A5568).opacity(0.28)
    )

    // MARK: - Theme Colors (Zen/Light)

    enum Zen {
        static let bgPrimary = Color(hex: 0xfaf8f5)
        static let bgSecondary = Color(hex: 0xf5f2ed)
        static let bgElevated = Color(hex: 0xfffdfb)

        static let textPrimary = Color(hex: 0x2c2520)
        static let textSecondary = Color(hex: 0x5c544a)
        static let textMuted = Color(hex: 0x756a5e)

        static let accent = Color(hex: 0x3D5A45)
        static let accentHover = Color(hex: 0x4a6b52)
    }

    // MARK: - Theme Colors (Midnight/Dark)

    enum Midnight {
        static let bgPrimary = Color(hex: 0x584840)
        static let bgSecondary = Color(hex: 0x60504a)
        static let bgElevated = Color(hex: 0x70605a)

        static let textPrimary = Color(hex: 0xfaf6f0)
        static let textSecondary = Color(hex: 0xf0ebe4)
        static let textMuted = Color(hex: 0xe8e2da)

        static let accent = Color(hex: 0xd4a84a)
        static let accentHover = Color(hex: 0xe0bc6a)
    }

    // MARK: - Semantic Colors

    enum Semantic {
        static let success = Color(hex: 0x3d7a52)
        static let successDark = Color(hex: 0x6bc48f)

        static let error = Color(hex: 0xb5453a)
        static let errorDark = Color(hex: 0xe07575)

        static let warning = Color(hex: 0xa67c35)
        static let warningDark = Color(hex: 0xe0b860)
    }

    // MARK: - Widget Colors

    enum Widget {
        /// Widget background colors
        static let bgDark = Color(hex: 0x1a1612)
        static let bgMedium = Color(hex: 0x2c2520)
        static let zenDark = Color(hex: 0x1f1c18)

        /// Quick action button colors
        static let actionVent = Color(hex: 0x6B8E9B)      // Soft teal for venting
        static let actionMusic = Color(hex: 0x9B8E6B)     // Warm gold for music
        static let actionCheckIn = Color(hex: 0x9B6B8E)   // Soft mauve for check-in

        /// Mood selection colors (Interactive Widgets)
        static let moodGreat = Color(hex: 0x4a9a5a)       // Bright green
        static let moodGood = Color(hex: 0x6b9a4a)        // Lime green
        static let moodOkay = Color(hex: 0x9a9a4a)        // Yellow-green
        static let moodMeh = Color(hex: 0x9a7a4a)         // Orange
        static let moodLow = Color(hex: 0x9a5a4a)         // Soft red

        /// Glow effect for emotional state
        static let glowWarm = Color(hex: 0xc4a265).opacity(0.3)
        static let glowCool = Color(hex: 0x65a2c4).opacity(0.3)
    }

    // MARK: - Lookup by ID

    static func persona(for id: String) -> PersonaColor {
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
struct PersonaColor {
    /// Primary brand color (use for backgrounds, avatars)
    let primary: Color

    /// Darker variant (use for pressed states, borders)
    let secondary: Color

    /// WCAG AA compliant text color for dark backgrounds
    /// Use when displaying persona-colored text on dark theme
    let textOnDark: Color

    /// Glow effect color with opacity
    let glow: Color

    /// Theme-aware text color that adapts to light/dark mode
    /// - In light mode: returns primary (good contrast on light bg)
    /// - In dark mode: returns textOnDark (good contrast on dark bg)
    @available(iOS 13.0, macOS 10.15, *)
    var text: Color {
        // For iOS, we always use dark backgrounds, so use textOnDark
        // If you need dynamic switching, use a view modifier with @Environment(\.colorScheme)
        textOnDark
    }
}

// MARK: - Color Extension

// Note: Color.init(hex:) extension is provided by FerniShared/Extensions/Color+Hex.swift
