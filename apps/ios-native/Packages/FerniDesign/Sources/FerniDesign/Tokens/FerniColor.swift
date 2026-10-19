import SwiftUI
import UIKit

/// Ferni's colors, from design-system/tokens/colors.json: the light "Zen Garden"
/// theme and the dark "Night Ink" theme. Every color follows the system
/// appearance, so a view never checks the color scheme itself.
///
/// Keep the hex values in step with colors.json; `FerniColorTests` pins the
/// ones a screen would look wrong without.
public enum FerniColor {
    // Backgrounds: themes.zen.background / themes.midnight.background
    public static let background = adaptive(light: 0xFAF8F5, dark: 0x14110E)
    public static let surface = adaptive(light: 0xF5F2ED, dark: 0x1E1A16)
    public static let surfaceRaised = adaptive(light: 0xFFFDFB, dark: 0x352E28)

    // Text: themes.*.text
    public static let textPrimary = adaptive(light: 0x2C2520, dark: 0xF4EFE6)
    public static let textSecondary = adaptive(light: 0x5C544A, dark: 0xCFC3B4)
    public static let textMuted = adaptive(light: 0x6B635A, dark: 0xA89B8C)

    // Actions: themes.*.accent
    public static let accent = adaptive(light: 0x3D5A45, dark: 0x8EAE7A)
    public static let accentPressed = adaptive(light: 0x2D4535, dark: 0x6F8F5C)
    /// Text and icons drawn on `accent`.
    public static let onAccent = adaptive(light: 0xFAF8F5, dark: 0x14110E)

    // Hairlines: themes.*.border.medium
    public static let border = adaptive(light: 0x2C2520, dark: 0xF4EFE6, alpha: 0.10, darkAlpha: 0.16)

    // Status: themes.*.semantic
    public static let error = adaptive(light: 0xB5453A, dark: 0xE7A39A)
    /// Text and glyphs on `error` (the End button): white on the light theme's
    /// red, near-black on the dark theme's coral (white there is about 2:1).
    public static let onError = adaptive(light: 0xFFFFFF, dark: 0x14110E)
    public static let success = adaptive(light: 0x3D7A52, dark: 0x6BC48F)

    static func adaptive(
        light: UInt32, dark: UInt32, alpha: CGFloat = 1, darkAlpha: CGFloat? = nil
    ) -> Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(rgb: dark, alpha: darkAlpha ?? alpha)
                : UIColor(rgb: light, alpha: alpha)
        })
    }
}

extension UIColor {
    convenience init(rgb: UInt32, alpha: CGFloat = 1) {
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: alpha
        )
    }
}

extension Color {
    /// "#4a6741" or "4a6741". Malformed input is a programming error in a
    /// token table, so it draws magenta rather than failing quietly.
    init(hexString: String) {
        let digits = hexString.hasPrefix("#") ? String(hexString.dropFirst()) : hexString
        let rgb = digits.count == 6 ? UInt32(digits, radix: 16) : nil
        self.init(uiColor: UIColor(rgb: rgb ?? 0xFF00FF))
    }
}
