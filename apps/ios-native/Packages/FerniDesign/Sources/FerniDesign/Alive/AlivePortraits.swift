import SwiftUI
import UIKit

/// Each teammate at rest, rendered once by the Metal Ferni and bundled as
/// images (the team row, sheets, the Live Activity, where a live GPU view
/// isn't possible). Regenerate with
/// `FERNI_RENDER_PORTRAITS=1` on `PortraitAssetTests` (see that test).
public enum AlivePortraits {
    /// Pixel size of the bundled images (64 pt at 3x).
    public static let pixels = 192

    /// The portrait pose: the face at rest, eyes a touch toward you, no ring.
    public static func uniforms(for persona: WindowPersona, dark: Bool) -> AliveUniforms {
        let colours = AliveRig.colours(persona)
        var face = Face.of("neutral")
        face.gy = 0.06
        face.halo = 0
        face.glow = 0.15
        var u = AliveUniforms.settled(face, body: colours.body, glow: colours.glow)
        u.light(dark: dark, roomTop: linear(hex: dark ? "#1e1a16" : "#faf8f5"),
                roomBottom: linear(hex: dark ? "#14110e" : "#efe9e0"))
        let side = Float(pixels)
        u.frame(size: SIMD2(side, side), radius: side * 0.4)
        return u
    }

    static func name(_ persona: WindowPersona, dark: Bool) -> String {
        "portrait-\(persona.rawValue)-\(dark ? "dark" : "light")"
    }

    /// The bundled portrait, or nil if it's missing.
    public static func image(_ persona: WindowPersona, dark: Bool) -> UIImage? {
        UIImage(named: name(persona, dark: dark), in: .module, with: nil)
    }
}
