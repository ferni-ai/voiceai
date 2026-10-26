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

    func testMorningIsBrighterAndLateNightDimmerThanTheDay() {
        XCTAssertGreaterThan(RoomLight(hour: 8).wash, RoomLight(hour: 14).wash)
        XCTAssertLessThan(RoomLight(hour: 1).wash, RoomLight(hour: 14).wash)
        XCTAssertEqual(RoomLight(hour: 14).tintOpacity, 0, "daytime is the room as designed")
        XCTAssertGreaterThan(RoomLight(hour: 23).tintOpacity, RoomLight(hour: 19).tintOpacity)
    }
}
