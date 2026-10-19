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
