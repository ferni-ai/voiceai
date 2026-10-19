import SwiftUI

/// Ferni's type scale, from design-system/tokens/typography.json `textStyles`.
///
/// Each style is a system text style, so it follows Dynamic Type from xSmall to
/// AX5 without any extra work. The web's sizes and weights pick the nearest
/// text style; the web's brand fonts (Plus Jakarta Sans, Inter) map to SF,
/// which is what iOS readers expect and what scales best.
public enum FerniType {
    /// heroDisplay (60/800): the one big line on a screen.
    public static let display = Font.system(.largeTitle, design: .rounded, weight: .bold)
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
