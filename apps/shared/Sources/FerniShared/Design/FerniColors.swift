import SwiftUI

// MARK: - Ferni Colors
/// Centralized color system for Ferni iOS app and widgets.
/// Token colors (personas, Zen/Midnight themes, semantic colors and
/// `persona(for:)`) are GENERATED from design-system/tokens/colors.json into
/// FerniTokens.generated.swift as an extension of this enum. Only colors that
/// aren't design tokens live here.
///
/// Usage:
///   .foregroundColor(FerniColors.ferni.text)      // Theme-aware text color
///   .background(FerniColors.ferni.primary)        // Background/fill color
///   .shadow(color: FerniColors.ferni.glow, ...)   // Glow effect

public enum FerniColors {

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
