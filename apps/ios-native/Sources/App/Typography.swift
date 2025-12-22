import SwiftUI

// MARK: - Ferni Typography System
/// Brand-aligned typography for iOS.
///
/// Brand Fonts (with iOS fallbacks):
/// - Display: Plus Jakarta Sans → SF Pro Display
/// - Body: Inter → SF Pro Text
///
/// We use SF Pro as the iOS fallback since it's in the brand guidelines.
/// For full brand alignment, bundle Plus Jakarta Sans and Inter fonts.

enum FerniFont {

    // MARK: - Display Font (Headlines, Buttons, Navigation)

    /// Display font - for headlines and prominent UI
    /// Brand: Plus Jakarta Sans | Fallback: SF Pro Display
    static func display(size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        // Check if Plus Jakarta Sans is available (bundled)
        if let _ = UIFont(name: "PlusJakartaSans-SemiBold", size: size) {
            return .custom("PlusJakartaSans", size: size).weight(weight)
        }
        // Fallback to SF Pro (system default, not rounded)
        return .system(size: size, weight: weight, design: .default)
    }

    // MARK: - Body Font (Body Copy, UI Elements)

    /// Body font - for readable content and UI elements
    /// Brand: Inter | Fallback: SF Pro Text
    static func body(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        // Check if Inter is available (bundled)
        if let _ = UIFont(name: "Inter-Regular", size: size) {
            return .custom("Inter", size: size).weight(weight)
        }
        // Fallback to SF Pro (system default)
        return .system(size: size, weight: weight, design: .default)
    }

    // MARK: - Semantic Styles

    /// Large title - 32pt bold display
    static var largeTitle: Font {
        display(size: 32, weight: .bold)
    }

    /// Title 1 - 28pt bold display
    static var title1: Font {
        display(size: 28, weight: .bold)
    }

    /// Title 2 - 22pt semibold display
    static var title2: Font {
        display(size: 22, weight: .semibold)
    }

    /// Title 3 - 20pt semibold display
    static var title3: Font {
        display(size: 20, weight: .semibold)
    }

    /// Headline - 17pt semibold display
    static var headline: Font {
        display(size: 17, weight: .semibold)
    }

    /// Body - 17pt regular body
    static var bodyText: Font {
        body(size: 17, weight: .regular)
    }

    /// Callout - 16pt regular body
    static var callout: Font {
        body(size: 16, weight: .regular)
    }

    /// Subheadline - 15pt regular body
    static var subheadline: Font {
        body(size: 15, weight: .regular)
    }

    /// Footnote - 13pt regular body
    static var footnote: Font {
        body(size: 13, weight: .regular)
    }

    /// Caption 1 - 12pt regular body
    static var caption1: Font {
        body(size: 12, weight: .regular)
    }

    /// Caption 2 - 11pt regular body
    static var caption2: Font {
        body(size: 11, weight: .regular)
    }

    // MARK: - Button Styles

    /// Primary button - 17pt semibold display
    static var buttonPrimary: Font {
        display(size: 17, weight: .semibold)
    }

    /// Secondary button - 15pt medium body
    static var buttonSecondary: Font {
        body(size: 15, weight: .medium)
    }

    /// Small button - 13pt medium body
    static var buttonSmall: Font {
        body(size: 13, weight: .medium)
    }
}

// MARK: - View Extension for Easy Usage

extension View {
    /// Apply Ferni display font
    func ferniDisplay(size: CGFloat, weight: Font.Weight = .semibold) -> some View {
        self.font(FerniFont.display(size: size, weight: weight))
    }

    /// Apply Ferni body font
    func ferniBody(size: CGFloat, weight: Font.Weight = .regular) -> some View {
        self.font(FerniFont.body(size: size, weight: weight))
    }
}
