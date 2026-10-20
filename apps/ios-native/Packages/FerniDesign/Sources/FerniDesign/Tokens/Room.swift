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

    public init(date: Date = .now) { self.date = date }

    public var body: some View {
        let light = RoomLight(hour: Calendar.current.component(.hour, from: date))
        ZStack {
            FerniColor.background
            light.tint.opacity(light.tintOpacity)
        }
        .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.45)],
                             startPoint: .top, endPoint: .bottom))
        .ignoresSafeArea(edges: .bottom)
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
            tintOpacity = 0.04
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
            tintOpacity = 0.04
        default: // late night: a little more amber
            wash = 0.08
            tintRGB = SIMD3(0.9, 0.55, 0.25)
            tintOpacity = 0.07
        }
    }
}
