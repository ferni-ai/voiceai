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

public extension View {
    /// A list on Ferni's paper, not the system's grouped grey #F2F2F7 (design
    /// audit P1-13: Settings, Team, Memory and Help read as system screens).
    /// Rows keep the system's raised card.
    func ferniPaper() -> some View {
        scrollContentBackground(.hidden)
            .background(FerniColor.background.ignoresSafeArea())
    }
}
