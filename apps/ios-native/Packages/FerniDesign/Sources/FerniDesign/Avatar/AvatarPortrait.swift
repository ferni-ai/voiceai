import SwiftUI

/// A teammate at rest, small and still: the same renderer as the live avatar,
/// one frame, no clock (the team row, sheets, a Live Activity image).
public struct AvatarPortrait: View {
    let persona: WindowPersona
    let present: Bool

    /// - Parameter present: false draws them faded, not yet on your team.
    public init(persona: WindowPersona, present: Bool = true) {
        self.persona = persona
        self.present = present
    }

    public var body: some View {
        var frame = AvatarFrame()
        frame.persona = persona
        frame.lowPower = true // no glow at this size
        return Canvas { context, size in AvatarRenderer.draw(frame, in: &context, size: size) }
            .aspectRatio(1, contentMode: .fit)
            .saturation(present ? 1 : 0)
            .opacity(present ? 1 : 0.45)
    }
}
