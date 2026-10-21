import simd
import XCTest
@testable import FerniDesign

/// The time of day changes the room's light, within the north star's range.
final class RoomTests: XCTestCase {
    func testThePersonaLightStaysSoft() {
        for hour in 0..<24 {
            let wash = RoomLight(hour: hour).wash
            XCTAssertGreaterThanOrEqual(wash, 0.06, "hour \(hour)")
            XCTAssertLessThanOrEqual(wash, 0.10, "hour \(hour)")
        }
    }

    /// Evening and night dim with their amber tint; the persona wash stays at
    /// the day's, which Home's secondary line needs to pass the accessibility
    /// audit (2026-10-19; AccessibilityAuditTests.testHome, every band).
    func testMorningIsBrighterAndTheNightIsAmber() {
        XCTAssertGreaterThan(RoomLight(hour: 8).wash, RoomLight(hour: 14).wash)
        XCTAssertEqual(RoomLight(hour: 19).wash, RoomLight(hour: 14).wash)
        XCTAssertEqual(RoomLight(hour: 1).wash, RoomLight(hour: 14).wash)
        XCTAssertEqual(RoomLight(hour: 14).tintOpacity, 0, "daytime is the room as designed")
        XCTAssertGreaterThan(RoomLight(hour: 19).tintOpacity, 0)
        XCTAssertGreaterThan(RoomLight(hour: 23).tintOpacity, RoomLight(hour: 19).tintOpacity)
    }
}

/// Award upgrade 3: Night Ink from 22:00 to 05:00, on unless it's turned off;
/// the room's late-night light starts with it.
final class NightInkTests: XCTestCase {
    func testDarkFromTenAtNightUntilFive() {
        XCTAssertEqual((0..<24).filter { NightInk.isNight(hour: $0) }, [0, 1, 2, 3, 4, 22, 23])
        XCTAssertEqual(NightInk.scheme(hour: 22, enabled: true), .dark)
        XCTAssertEqual(NightInk.scheme(hour: 4, enabled: true), .dark)
        XCTAssertNil(NightInk.scheme(hour: 5, enabled: true), "morning is the phone's own")
        XCTAssertNil(NightInk.scheme(hour: 21, enabled: true))
        XCTAssertNil(NightInk.scheme(hour: 23, enabled: false), "turned off, never forced")
    }

    /// Warm near-black, not brown: the tint's share over Night Ink's field.
    func testNightInkStaysNearBlack() {
        let light = RoomLight(hour: 23), field = SIMD3<Double>(0x14, 0x11, 0x0e)
        let a = light.tintOpacity(dark: true)
        let room = field * (1 - a) + light.tintRGB * 255 * a
        XCTAssertLessThan(room.max() ?? 255, 36, "the late-night room in Night Ink: \(room)")
        XCTAssertGreaterThan(room.x - room.z, 10, "and still warm")
        XCTAssertEqual(light.tintOpacity(dark: false), light.tintOpacity, "paper keeps its tint")
    }

    func testTheLateNightLightStartsWithIt() {
        XCTAssertEqual(RoomLight(hour: 22), RoomLight(hour: 2))
        XCTAssertNotEqual(RoomLight(hour: 21), RoomLight(hour: 22))
    }
}

/// Design audit P2 #1: the time of day was too faint to feel. Each band's
/// floor (the paper under its tint) is a visibly different colour.
final class RoomBandsTests: XCTestCase {
    static func floor(_ hour: Int) -> SIMD3<Double> {
        let light = RoomLight(hour: hour), paper = SIMD3<Double>(250, 248, 245)
        return paper * (1 - light.tintOpacity) + light.tintRGB * 255 * light.tintOpacity
    }

    func testEachBandIsVisiblyItsOwn() {
        let bands = [8, 14, 20, 2].map(Self.floor)
        for (i, a) in bands.enumerated() {
            for b in bands[(i + 1)...] {
                XCTAssertGreaterThan(simd_distance(a, b), 6, "\(a) and \(b) are too close")
            }
        }
        XCTAssertGreaterThan(Self.floor(2).x - Self.floor(2).z, 20, "late night is plainly amber")
    }
}

/// Expression audit P2 #7: the evening and late-night amber lit the room,
/// not Ferni. His light leans toward the room's tint; by day it's unchanged.
final class RoomLightOnFerniTests: XCTestCase {
    private func lit(_ hour: Int) -> AliveUniforms {
        var u = AliveUniforms()
        u.light(dark: false, roomTop: linear(hex: "#faf8f5"), roomBottom: linear(hex: "#efe9e0"))
        u.roomLight(RoomLight(hour: hour))
        return u
    }

    func testDayIsUnchanged() {
        var plain = AliveUniforms()
        plain.light(dark: false, roomTop: linear(hex: "#faf8f5"), roomBottom: linear(hex: "#efe9e0"))
        XCTAssertEqual(lit(14).key, plain.key)
        XCTAssertEqual(lit(14).bg0, plain.bg0)
    }

    func testEveningAndNightWarmHisLight() {
        func warmth(_ u: AliveUniforms) -> Float { u.key.x / u.key.z }
        XCTAssertGreaterThan(warmth(lit(20)), warmth(lit(14)) * 1.03, "evening")
        XCTAssertGreaterThan(warmth(lit(2)), warmth(lit(20)), "late night, more amber")
        XCTAssertGreaterThan(lit(2).fill.x / lit(2).fill.z, lit(14).fill.x / lit(14).fill.z)
    }
}
