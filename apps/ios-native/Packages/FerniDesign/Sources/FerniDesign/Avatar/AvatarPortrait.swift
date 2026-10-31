import SwiftUI

/// A teammate at rest, small and still: the Metal Ferni rendered once per
/// persona and theme (`AlivePortraits`), in their brand colour. Used in the
/// team row, sheets and the Live Activity.
public struct AvatarPortrait: View {
    let persona: WindowPersona
    let present: Bool
    @Environment(\.colorScheme) private var colorScheme

    /// - Parameter present: false dims them (still in their colour): not yet on your team.
    public init(persona: WindowPersona, present: Bool = true) {
        self.persona = persona
        self.present = present
    }

    public var body: some View {
        Group {
            if let image = AlivePortraits.image(persona, dark: colorScheme == .dark) {
                Image(uiImage: image).resizable().interpolation(.high)
            } else {
                Circle().fill(persona.primaryColor) // the images ship with the app; this never shows
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .opacity(present ? 1 : 0.5)
    }
}
