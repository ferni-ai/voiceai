import SwiftUI
import UIKit

/// Liquid Glass is for floating controls only, never for content (design
/// north star §3.2): the Talk button, the call controls and the toolbar. These
/// wrap the system's glass so no screen invents its own. (The web's
/// "visionOS glass" token ramp is deliberately not ported: fake glass next to
/// real glass.)
public extension View {
    /// The one primary action on a screen: tinted glass, forest in light mode, sage in dark.
    func ferniPrimaryGlass() -> some View {
        buttonStyle(.glassProminent).tint(FerniColor.accent)
    }

    /// Secondary floating controls (mute, more).
    func ferniGlass() -> some View {
        buttonStyle(.glass)
    }
}

public extension FerniType {
    /// Ferni's voice on screen (the greeting, names): Plus Jakarta Sans, the
    /// brand display face, when bundled; SF Rounded otherwise. Either way it
    /// scales with Dynamic Type relative to `.largeTitle`.
    static var greeting: Font {
        if UIFont(name: "PlusJakartaSans-Bold", size: 34) != nil {
            return .custom("PlusJakartaSans-Bold", size: 34, relativeTo: .largeTitle)
        }
        return display
    }
}
