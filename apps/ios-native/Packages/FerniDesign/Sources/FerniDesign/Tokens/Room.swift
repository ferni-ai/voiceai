import SwiftUI

/// The room Ferni lives in (design north star §3.1): the theme's paper or
/// Night Ink field, lit softly from behind the avatar in the current
/// speaker's persona color. The time of day changes the light, never the
/// layout: brighter and warmer in the morning, a little amber in the evening
/// and late at night. Opaque content, never glass.
public struct RoomBackground: View {
    let persona: WindowPersona
    let date: Date
    @Environment(\.colorScheme) private var scheme

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
            light.tint.opacity(light.tintOpacity(dark: scheme == .dark))
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
    @Environment(\.colorScheme) private var scheme

    /// - Parameter from: the edge the floor (or ceiling) is solid at; it fades
    ///   to clear toward the other. The top one sits under the call's name chip
    ///   (design audit P2 #19).
    public init(date: Date = .now, from edge: VerticalEdge = .bottom) {
        self.date = date
        self.edge = edge
    }

    /// How far the ceiling's fade hangs below what it sits under.
    static let ceilingFade: CGFloat = 32
    /// The floor's fade: the padding above Talk.
    static let floorFade = FerniSpace.rest

    public var body: some View {
        let light = RoomLight(hour: Calendar.current.component(.hour, from: date))
        let room = ZStack {
            FerniColor.background
            light.tint.opacity(light.tintOpacity(dark: scheme == .dark))
        }
        Group {
            if edge == .bottom {
                // Fading in over the top padding, solid from Talk's top edge down.
                // Fading over a share of the whole height, it was still part
                // clear behind Talk: on an SE the team's faces showed at its
                // corners and the audit failed Talk's label (award upgrade 2).
                VStack(spacing: 0) {
                    room.mask(LinearGradient(colors: [.clear, .black], startPoint: .top, endPoint: .bottom))
                        .frame(height: Self.floorFade)
                    room
                }
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

/// Night Ink after 22:00 (award upgrade 3): from ten at night until five in
/// the morning the room goes dark (the Night Ink theme) whatever the phone's
/// appearance, so opening Ferni in bed doesn't light up the room. Settings can
/// turn it off; a phone already in dark mode is dark anyway.
public enum NightInk {
    /// The setting's key; on unless you turn it off.
    public static let key = "ferni.nightInk"
    public static let from = 22, until = 5

    public static func isNight(hour: Int) -> Bool { hour >= from || hour < until }

    /// The scheme to ask for: dark at night while it's on, else the phone's own.
    public static func scheme(hour: Int, enabled: Bool) -> ColorScheme? {
        enabled && isNight(hour: hour) ? .dark : nil
    }
}

/// How the room is lit at an hour of the day.
public struct RoomLight: Equatable, Sendable {
    /// Persona wash opacity, within the north star's 6-10%.
    public let wash: Double
    /// The tint as sRGB components (Ferni's own light takes it too).
    public let tintRGB: SIMD3<Double>
    public let tintOpacity: Double

    /// The tint's share over the theme's field. Night Ink keeps a warm
    /// near-black, not a brown room: the late-night amber at full strength
    /// turned #14110e into #312215 (award upgrade 3); at 40% it's #201811.
    public func tintOpacity(dark: Bool) -> Double { dark ? tintOpacity * 0.4 : tintOpacity }
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
        case 18..<22: // evening; Night Ink from 22:00
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
    static let turns = [5, 11, 12, 17, 18, 22]

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
