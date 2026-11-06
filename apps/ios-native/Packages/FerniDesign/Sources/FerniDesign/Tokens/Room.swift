import SwiftUI

/// The room Ferni lives in (design north star §3.1): the theme's paper or
/// Night Ink field, lit softly from behind the avatar in the current
/// speaker's persona color. The time of day changes the light, never the
/// layout: brighter and warmer in the morning, dimmer and a little amber late
/// at night. Opaque content, never glass.
public struct RoomBackground: View {
    let persona: WindowPersona
    let date: Date

    public init(persona: WindowPersona, date: Date = .now) {
        self.persona = persona
        self.date = date
    }

    public var body: some View {
        let light = RoomLight(hour: Calendar.current.component(.hour, from: date))
        ZStack {
            FerniColor.background
            // Persona light: a radial wash from behind the avatar (persona glow token).
            RadialGradient(
                colors: [persona.primaryColor.opacity(light.wash), .clear],
                center: UnitPoint(x: 0.5, y: 0.3), startRadius: 0, endRadius: 420
            )
            light.tint.opacity(light.tintOpacity)
        }
        .ignoresSafeArea()
        .animation(.easeInOut(duration: 0.4), value: persona) // handoff crossfade
        .accessibilityHidden(true)
    }
}

/// A clear patch of the room for words: the paper and the time of day's tint,
/// without the persona light. Feathered wide, so it reads as the light
/// falling off before the words rather than as a card.
///
/// Text on the persona wash measured 6.5:1 (#5C544A on #F3EFE8), but the
/// dithered gradient under it made Apple's contrast audit fail every colour,
/// #2C2520 at 13:1 included, and the same text on a flat patch of that same
/// #F3EFE8 passed (2026-10-26). Words on the room sit on this instead: flat
/// under the text, and the paper's own 7:1 for secondary text by day.
public struct RoomPaper: View {
    let date: Date
    /// How far the patch reaches past the words: three blur radii, so the
    /// feathering stops short of the text and the paper under it is flat.
    static let blur: CGFloat = 24
    static let reach = blur * 3

    public init(date: Date = .now) { self.date = date }

    public var body: some View {
        let light = RoomLight(hour: Calendar.current.component(.hour, from: date))
        ZStack {
            FerniColor.background
            light.tint.opacity(light.tintOpacity)
        }
        // Corners as round as the reach: every point of the words keeps the full reach.
        .clipShape(RoundedRectangle(cornerRadius: Self.reach))
        .padding(-Self.reach)
        .blur(radius: Self.blur)
        .accessibilityHidden(true)
        .allowsHitTesting(false)
    }
}

extension View {
    /// Sets these words on `RoomPaper`, for text drawn over `RoomBackground`.
    public func onRoomPaper(date: Date = .now) -> some View {
        background { RoomPaper(date: date) }
    }
}

/// How the room is lit at an hour of the day.
public struct RoomLight: Equatable, Sendable {
    /// Persona wash opacity, within the north star's 6-10%.
    public let wash: Double
    public let tint: Color
    public let tintOpacity: Double

    public init(hour: Int) {
        switch hour {
        case 5..<11: // morning: warmer, brighter
            wash = 0.10
            tint = Color(red: 1, green: 0.85, blue: 0.6)
            tintOpacity = 0.04
        case 11..<18: // day: as designed
            wash = 0.08
            tint = .clear
            tintOpacity = 0
        case 18..<23: // evening
            wash = 0.07
            tint = Color(red: 1, green: 0.7, blue: 0.4)
            tintOpacity = 0.04
        default: // late night: dimmer, a little amber
            wash = 0.06
            tint = Color(red: 0.9, green: 0.55, blue: 0.25)
            tintOpacity = 0.07
        }
    }
}
