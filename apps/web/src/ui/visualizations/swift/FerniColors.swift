// MARK: - Ferni Design System Colors
// SwiftUI color tokens matching the web design system
// Source: design-system/tokens/colors.json

import SwiftUI

/// Ferni brand colors - the single source of truth for iOS
/// These match the CSS variables in the web app
enum FerniColors {

    // MARK: - Brand Colors

    /// Primary accent color - Ferni green (#3D5A45)
    static let accent = Color(hex: "3D5A45")

    /// Secondary accent - slightly lighter (#4a6741)
    static let accentSecondary = Color(hex: "4a6741")

    /// Ferni's persona color
    static let ferni = Color(hex: "4a6741")

    // MARK: - Background Colors

    /// Primary background - warm off-white (#fffdfb)
    static let background = Color(hex: "fffdfb")

    /// Elevated surface - pure white for cards (#ffffff)
    static let backgroundElevated = Color(hex: "ffffff")

    /// Secondary background - subtle warmth
    static let backgroundSecondary = Color(hex: "f8f6f4")

    // MARK: - Text Colors

    /// Primary text - Natural Ink (#2C2520)
    static let textPrimary = Color(hex: "2C2520")

    /// Secondary text (#5c544a)
    static let textSecondary = Color(hex: "5c544a")

    /// Muted text (#9a8f85)
    static let textMuted = Color(hex: "9a8f85")

    // MARK: - Border Colors

    /// Subtle border for cards
    static let borderSubtle = Color(hex: "2C2520").opacity(0.08)

    /// Medium border for inputs
    static let borderMedium = Color(hex: "2C2520").opacity(0.15)

    // MARK: - Mood Colors

    enum moods {
        static let calm = Color(hex: "3D5A45")
        static let joyful = Color(hex: "f5a623")
        static let anxious = Color(hex: "e74c3c")
        static let tired = Color(hex: "9a8f85")
        static let focused = Color(hex: "3a6b73")
        static let reflective = Color(hex: "8a7a9a")
        static let stressed = Color(hex: "c0392b")
        static let energized = Color(hex: "27ae60")
        static let peaceful = Color(hex: "5a8b73")
        static let uncertain = Color(hex: "7f8c8d")
    }

    /// Get color for a mood type
    static func mood(_ type: MoodType) -> Color {
        switch type {
        case .calm: return moods.calm
        case .joyful: return moods.joyful
        case .anxious: return moods.anxious
        case .tired: return moods.tired
        case .focused: return moods.focused
        case .reflective: return moods.reflective
        case .stressed: return moods.stressed
        case .energized: return moods.energized
        case .peaceful: return moods.peaceful
        case .uncertain: return moods.uncertain
        }
    }

    // MARK: - Energy Colors

    enum energy {
        static let emotional = Color(hex: "a67a6a")
        static let mental = Color(hex: "3a6b73")
        static let physical = Color(hex: "4a6741")
    }

    // MARK: - Status Colors

    enum statusColors {
        static let thriving = Color(hex: "27ae60")
        static let balanced = Color(hex: "3D5A45")
        static let stretched = Color(hex: "f5a623")
        static let depleted = Color(hex: "e67e22")
        static let critical = Color(hex: "e74c3c")
    }

    /// Get color for energy status
    static func status(_ status: EnergyRingsData.EnergyStatus) -> Color {
        switch status {
        case .thriving: return statusColors.thriving
        case .balanced: return statusColors.balanced
        case .stretched: return statusColors.stretched
        case .depleted: return statusColors.depleted
        case .critical: return statusColors.critical
        }
    }

    /// Get color for burnout status
    static func status(_ status: BurnoutStatus) -> Color {
        switch status {
        case .thriving: return statusColors.thriving
        case .balanced: return statusColors.balanced
        case .stretched: return statusColors.stretched
        case .depleted: return statusColors.depleted
        case .critical: return statusColors.critical
        }
    }

    // MARK: - Persona Colors

    enum personas {
        static let ferni = Color(hex: "4a6741")
        static let maya = Color(hex: "d4a574")
        static let peter = Color(hex: "2a5934")
        static let alex = Color(hex: "5a7a8a")
        static let nayan = Color(hex: "8b7355")
        static let jordan = Color(hex: "7a5a6a")
    }

    // MARK: - Glass Effects

    /// Glass background for overlays
    static func glass(opacity: Double = 0.8) -> Color {
        background.opacity(opacity)
    }

    /// Glass material for modern iOS look
    @available(iOS 15.0, *)
    static var glassMaterial: Material {
        .ultraThinMaterial
    }
}

// MARK: - Color Extension

extension Color {
    /// Initialize from hex string (without #)
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)

        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - Gradient Presets

extension LinearGradient {
    /// Ferni brand gradient
    static var ferni: LinearGradient {
        LinearGradient(
            colors: [FerniColors.accent, FerniColors.accentSecondary],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    /// Warm background gradient
    static var warmBackground: LinearGradient {
        LinearGradient(
            colors: [FerniColors.background, FerniColors.backgroundSecondary],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    /// Energy ring gradient (emotional → mental → physical)
    static var energyRings: LinearGradient {
        LinearGradient(
            colors: [FerniColors.energy.emotional, FerniColors.energy.mental, FerniColors.energy.physical],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

// MARK: - Shadow Presets

extension View {
    /// Ferni-style subtle shadow
    func ferniShadow(radius: CGFloat = 8) -> some View {
        self.shadow(
            color: FerniColors.textPrimary.opacity(0.08),
            radius: radius,
            x: 0,
            y: 2
        )
    }

    /// Elevated card shadow
    func cardShadow() -> some View {
        self.shadow(
            color: FerniColors.textPrimary.opacity(0.05),
            radius: 16,
            x: 0,
            y: 4
        )
    }
}
