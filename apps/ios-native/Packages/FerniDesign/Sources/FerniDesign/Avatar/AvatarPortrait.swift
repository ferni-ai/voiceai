import SwiftUI

/// A teammate at rest, small and still: the Metal Ferni rendered once per
/// persona and theme (`AlivePortraits`), in their brand colour. Used in the
/// team row, sheets and the Live Activity.
public struct AvatarPortrait: View {
    let persona: WindowPersona
    let present: Bool
    let onBlack: Bool
    @Environment(\.colorScheme) private var colorScheme

    /// - Parameters:
    ///   - present: false dims them (still in their colour): not yet on your team.
    ///   - onBlack: on the Dynamic Island's black, whatever the theme: the
    ///     daylight portrait, lifted a little. Ferni's dark-room portrait was
    ///     dark green on black, about 3.3:1 (design audit P2 #15).
    public init(persona: WindowPersona, present: Bool = true, onBlack: Bool = false) {
        self.persona = persona
        self.present = present
        self.onBlack = onBlack
    }

    /// How much the island lifts the daylight portrait (SwiftUI brightness).
    public static let islandLift = 0.06

    public var body: some View {
        Group {
            if let image = AlivePortraits.image(persona, dark: onBlack ? false : colorScheme == .dark) {
                Image(uiImage: image).resizable().interpolation(.high)
                    .brightness(onBlack ? Self.islandLift : 0)
            } else {
                Circle().fill(persona.primaryColor) // the images ship with the app; this never shows
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .opacity(present ? 1 : 0.5)
    }
}
