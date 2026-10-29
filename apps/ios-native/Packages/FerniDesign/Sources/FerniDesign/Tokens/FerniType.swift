import SwiftUI

/// Ferni's type scale, from design-system/tokens/typography.json `textStyles`.
///
/// Display type (the one big line on a screen, greetings) is the brand face,
/// Plus Jakarta Sans, scaled with Dynamic Type through `relativeTo:`. Everything
/// read at length is a system text style, which scales from xSmall to AX5 and is
/// what iOS readers expect (the web's body face, Inter, maps to SF).
public enum FerniType {
    /// heroDisplay (60/800): the one big line on a screen.
    public static var display: Font {
        FerniFonts.brand(FerniFonts.displayName, size: 34, relativeTo: .largeTitle,
                         fallback: .system(.largeTitle, design: .rounded, weight: .bold))
    }
    /// Ferni's voice on screen (the greeting, names): the brand face at 700.
    public static var greeting: Font {
        FerniFonts.brand(FerniFonts.greetingName, size: 34, relativeTo: .largeTitle,
                         fallback: .system(.largeTitle, design: .rounded, weight: .bold))
    }
    /// pageTitle (36/700)
    public static let title = Font.system(.title, design: .rounded, weight: .bold)
    /// sectionTitle (24/600)
    public static let section = Font.system(.title2, design: .rounded, weight: .semibold)
    /// cardTitle (17/600)
    public static let headline = Font.system(.headline)
    /// bodyLarge (17/400): captions during a call, anything read at length.
    public static let bodyLarge = Font.system(.body)
    /// body (15/400)
    public static let body = Font.system(.callout)
    /// bodySmall (13/400)
    public static let footnote = Font.system(.footnote)
    /// caption (12/500)
    public static let caption = Font.system(.caption, weight: .medium)
    /// buttonLarge (16/600)
    public static let button = Font.system(.body, weight: .semibold)
}

/// Spacing, from design-system/tokens/spacing.json `ma` (a Fibonacci scale).
public enum FerniSpace {
    public static let breath: CGFloat = 8
    public static let pause: CGFloat = 13
    public static let rest: CGFloat = 21
    public static let silence: CGFloat = 34
    public static let meditation: CGFloat = 55
}

/// Corner radii, from design-system/tokens/shape.json `cornerScale`.
public enum FerniRadius {
    public static let small: CGFloat = 8
    public static let medium: CGFloat = 12
    public static let large: CGFloat = 20
}
