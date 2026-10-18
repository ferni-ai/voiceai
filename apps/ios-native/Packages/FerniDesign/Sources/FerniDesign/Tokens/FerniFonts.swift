import CoreText
import SwiftUI
import UIKit

/// The brand display face, Plus Jakarta Sans (SIL OFL 1.1; the license ships
/// next to the font in Resources/Fonts). One variable font carries every weight.
///
/// A package can't list fonts in the app's Info.plist, so the app calls
/// `register()` once at launch. Until then, and if registration ever fails,
/// display type falls back to SF Rounded: the screen never shows a missing font.
public enum FerniFonts {
    // CoreText registers the variable font's named instances as
    // "<default PostScript name>_<instance>", not the instances' own
    // PostScript names (PlusJakartaSans-ExtraBold resolves to nothing).
    /// Named instance for the web's heroDisplay (weight 800).
    static let displayName = "PlusJakartaSans-Regular_ExtraBold"
    /// Named instance for greetings and names (weight 700).
    static let greetingName = "PlusJakartaSans-Regular_Bold"

    private static let registered: Bool = {
        guard let url = Bundle.module.url(forResource: "PlusJakartaSans-Variable", withExtension: "ttf") else {
            return false
        }
        var error: Unmanaged<CFError>?
        if CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) { return true }
        // Already registered in this process (a second caller) is still success.
        return UIFont(name: greetingName, size: 17) != nil
    }()

    /// The SIL OFL text, which must ship with the font.
    static var licenseURL: URL? { Bundle.module.url(forResource: "PlusJakartaSans-OFL", withExtension: "txt") }

    /// Registers the brand font for this process. Safe to call more than once.
    @discardableResult
    public static func register() -> Bool { registered }

    /// The brand face at `size`, scaling with Dynamic Type like `style`;
    /// `fallback` when the font isn't available.
    static func brand(_ name: String, size: CGFloat, relativeTo style: Font.TextStyle, fallback: Font) -> Font {
        UIFont(name: name, size: size) == nil ? fallback : .custom(name, size: size, relativeTo: style)
    }
}
