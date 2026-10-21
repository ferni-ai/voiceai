import SwiftUI

/// The room Ferni lives in (design north star §3.1): the theme's paper or
/// Night Ink field, lit softly from behind the avatar in the current
/// speaker's persona color. The time of day changes the light, never the
/// layout: brighter and warmer in the morning, a little amber in the evening
/// and late at night. Opaque content, never glass.
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

/// The room's floor colour (no persona wash reaches the bottom), fading in
/// from clear: under a floating control, so what scrolls beneath it goes soft
/// instead of sitting half-covered behind it (design audit P1-4).
public struct RoomFade: View {
    let date: Date
    let edge: VerticalEdge

    /// - Parameter from: the edge the floor (or ceiling) is solid at; it fades
    ///   to clear toward the other. The top one sits under the call's name chip
    ///   (design audit P2 #19).
    public init(date: Date = .now, from edge: VerticalEdge = .bottom) {
        self.date = date
        self.edge = edge
    }

    /// How far the ceiling's fade hangs below what it sits under.
    static let ceilingFade: CGFloat = 32

    public var body: some View {
        let light = RoomLight(hour: Calendar.current.component(.hour, from: date))
        let room = ZStack {
            FerniColor.background
            light.tint.opacity(light.tintOpacity)
        }
        Group {
            if edge == .bottom {
                room
                    .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.45)],
                                         startPoint: .top, endPoint: .bottom))
                    .ignoresSafeArea(edges: .bottom)
            } else {
                // Solid behind what it sits under (the words stay on the room's
                // paper), fading out just below it.
                VStack(spacing: 0) {
                    room
                    room.mask(LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom))
                        .frame(height: Self.ceilingFade)
                }
                .padding(.bottom, -Self.ceilingFade)
                .ignoresSafeArea(edges: .top)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// How the room is lit at an hour of the day.
public struct RoomLight: Equatable, Sendable {
    /// Persona wash opacity, within the north star's 6-10%.
    public let wash: Double
    /// The tint as sRGB components (Ferni's own light takes it too).
    public let tintRGB: SIMD3<Double>
    public let tintOpacity: Double
    public var tint: Color { Color(red: tintRGB.x, green: tintRGB.y, blue: tintRGB.z) }

    public init(hour: Int) {
        switch hour {
        case 5..<11: // morning: warmer, brighter
            wash = 0.10
            tintRGB = SIMD3(1, 0.85, 0.6)
            // Felt, not just measured: at 0.04-0.07 the four bands came out
            // #f6f3ed / #f7f5f1 / #f7f2eb / #f6eee5 (design audit P2 #1).
            tintOpacity = 0.08
        case 11..<18: // day: as designed
            wash = 0.08
            tintRGB = SIMD3(1, 1, 1)
            tintOpacity = 0
        // Evening and night keep the day's wash: at 0.07/0.06 Apple's audit failed
        // Home's secondary line on contrast (2026-10-19), though its pixels measure
        // 6.5:1. AccessibilityAuditTests.testHome checks every band.
        case 18..<23: // evening
            wash = 0.08
            tintRGB = SIMD3(1, 0.7, 0.4)
            tintOpacity = 0.10
        default: // late night: a little more amber
            wash = 0.08
            tintRGB = SIMD3(0.9, 0.55, 0.25)
            tintOpacity = 0.14
        }
    }
}

/// The widget's day (design audit P2 #16: the medium widget never changed).
/// Its hello follows Home's greeting hours and its light follows RoomLight, so
/// the widget turns over at both sets of boundaries.
public enum WidgetMoment: Equatable, Sendable {
    case morning, afternoon, evening, night

    /// The day's greeting hours: 5-12, 12-17, 17-22, then night. Home's
    /// Greeting reads them from here, so the two can't drift.
    public init(hour: Int) {
        switch hour {
        case 5..<12: self = .morning
        case 12..<17: self = .afternoon
        case 17..<22: self = .evening
        default: self = .night
        }
    }

    /// Hours where either the hello or the light changes.
    static let turns = [5, 11, 12, 17, 18, 22, 23]

    /// The next day's worth of turns after `date`, in order: the widget's timeline.
    public static func turns(after date: Date, calendar: Calendar = .current) -> [Date] {
        let start = calendar.startOfDay(for: date)
        return (0...1).flatMap { day in
            turns.compactMap { hour in
                calendar.date(byAdding: DateComponents(day: day, hour: hour), to: start)
            }
        }
        .filter { $0 > date && $0 <= date.addingTimeInterval(24 * 3600) }
    }
}
