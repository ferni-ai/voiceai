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
