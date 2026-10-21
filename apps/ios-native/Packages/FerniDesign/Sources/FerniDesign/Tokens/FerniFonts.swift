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

    /// Navigation titles in the brand face, inline (17, like headline) and
    /// large (34, like largeTitle), scaling with Dynamic Type (design audit
    /// P1-13: Settings, Team and Memory read as system screens). Call once at
    /// launch, after `register()`. Returns whether the face was there to use.
    /// A text-size change while the app runs re-sets them, on the bars on
    /// screen too: the appearance proxy only reaches bars made after it, and
    /// the scaled font was fixed at launch (critic L2).
    @MainActor @discardableResult
    public static func useForNavigationTitles() -> Bool {
        guard let titles = titles(for: nil) else { return false }
        let bar = UINavigationBar.appearance()
        bar.titleTextAttributes = titles.inline
        bar.largeTitleTextAttributes = titles.large
        if sizeObserver == nil {
            sizeObserver = NotificationCenter.default.addObserver(
                forName: UIContentSizeCategory.didChangeNotification, object: nil, queue: .main
            ) { note in
                let size = note.userInfo?[UIContentSizeCategory.newValueUserInfoKey] as? UIContentSizeCategory
                // The application posts it; its scenes hold the bars on screen
                // (UIApplication.shared isn't available to the widget's copy).
                let app = note.object as? UIApplication
                MainActor.assumeIsolated {
                    let windows = app?.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows) ?? []
                    retitle(size: size, windows: windows)
                }
            }
        }
        return true
    }

    nonisolated(unsafe) private static var sizeObserver: NSObjectProtocol?

    /// The title fonts at a text size (nil: the current one).
    static func titles(for size: UIContentSizeCategory?)
        -> (inline: [NSAttributedString.Key: Any], large: [NSAttributedString.Key: Any])? {
        guard register(), let inline = UIFont(name: greetingName, size: 17), let large = UIFont(name: greetingName, size: 34) else {
            return nil
        }
        let traits = size.map { UITraitCollection(preferredContentSizeCategory: $0) }
        return ([.font: UIFontMetrics(forTextStyle: .headline).scaledFont(for: inline, compatibleWith: traits)],
                [.font: UIFontMetrics(forTextStyle: .largeTitle).scaledFont(for: large, compatibleWith: traits)])
    }

    /// The proxy, and every navigation bar already in `windows`, at `size`.
    @MainActor
    static func retitle(size: UIContentSizeCategory?, windows: [UIWindow]) {
        guard let titles = titles(for: size) else { return }
        let proxy = UINavigationBar.appearance()
        proxy.titleTextAttributes = titles.inline
        proxy.largeTitleTextAttributes = titles.large
        func walk(_ view: UIView) {
            if let bar = view as? UINavigationBar {
                bar.titleTextAttributes = titles.inline
                bar.largeTitleTextAttributes = titles.large
            }
            view.subviews.forEach(walk)
        }
        windows.forEach(walk)
    }

    /// The brand face at `size`, scaling with Dynamic Type like `style`;
    /// `fallback` when the font isn't available.
    static func brand(_ name: String, size: CGFloat, relativeTo style: Font.TextStyle, fallback: Font) -> Font {
        UIFont(name: name, size: size) == nil ? fallback : .custom(name, size: size, relativeTo: style)
    }
}
