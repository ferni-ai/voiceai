import XCTest
@testable import FerniDesign

/// Critic M11 (motion spec §6.10): the clock runs at the pace's rate (the
/// display's own at the top) and not at all when the app isn't active or a
/// sheet covers him.
final class AvatarScheduleTests: XCTestCase {
    func testTheClockRunsAtThePacesRate() {
        XCTAssertNil(AvatarView.schedule(hz: 120, covered: false, active: true).interval, "the display's own rate")
        XCTAssertEqual(AvatarView.schedule(hz: 60, covered: false, active: true).interval ?? 0, 0.9 / 60, accuracy: 1e-9)
        XCTAssertEqual(AvatarView.schedule(hz: 30, covered: false, active: true).interval ?? 0, 0.9 / 30, accuracy: 1e-9)
    }

    func testCoveredOrInactiveDrawsNothing() {
        XCTAssertTrue(AvatarView.schedule(hz: 120, covered: true, active: true).paused, "under a sheet")
        XCTAssertTrue(AvatarView.schedule(hz: 30, covered: false, active: false).paused)
        XCTAssertFalse(AvatarView.schedule(hz: 30, covered: false, active: true).paused)
    }
}
