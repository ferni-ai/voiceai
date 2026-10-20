import FerniDesign
import SwiftUI

/// A screen's first line, in Ferni's voice, with a small Ferni beside it: the
/// screens around the call read as his, not the system's (design audit P1-13).
/// He only blinks there (QuietAvatar). VoiceOver reads the line, not him.
///
/// It sits above the list, not in it: a list row's element is the whole row,
/// so the accessibility audit measured the line against Ferni's green inside
/// that frame and failed it on every launch. At AX3 and up the intro steps
/// aside so the screen's own words get the room (pinned, Memory's line alone
/// ran five lines at AX5; as a row, the audit couldn't resolve it).
enum ScreenIntro {
    static var settings: LocalizedStringKey { "Make me yours." }
    static var team: LocalizedStringKey { "The people I work with." }
    static var memory: LocalizedStringKey { "Here's what I keep about you. Change anything." }
    static var help: LocalizedStringKey { "You're not alone in this." }

    static func shows(at size: DynamicTypeSize) -> Bool { size < .accessibility3 }
}

private struct IntroLine: View {
    let line: LocalizedStringKey

    var body: some View {
        Text(line)
            .font(FerniType.bodyLarge)
            .foregroundStyle(FerniColor.textPrimary)
            .accessibilityIdentifier("screen.intro")
    }
}

extension View {
    /// The intro, above the list, below AX3.
    func screenIntro(_ line: LocalizedStringKey) -> some View { modifier(ScreenIntroAbove(line: line)) }
}

private struct ScreenIntroAbove: ViewModifier {
    let line: LocalizedStringKey
    @Environment(\.dynamicTypeSize) private var typeSize

    func body(content: Content) -> some View {
        content.safeAreaInset(edge: .top, spacing: 0) {
            if ScreenIntro.shows(at: typeSize) {
                HStack(spacing: FerniSpace.pause) {
                    // 44 pt of Ferni: his body is 0.6 of the slot, whose margin
                    // (room for a glow) overlaps the padding.
                    QuietAvatar(persona: .ferni)
                        .frame(width: 44 / 0.6, height: 44 / 0.6)
                        .clipped()
                        .padding(-44 / 0.6 * 0.2)
                    IntroLine(line: line)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, FerniSpace.rest)
                .padding(.vertical, FerniSpace.breath)
                .background(FerniColor.background)
            }
        }
    }
}
