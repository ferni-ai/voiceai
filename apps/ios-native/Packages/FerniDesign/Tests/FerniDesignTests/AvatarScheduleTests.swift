import XCTest
@testable import FerniDesign

/// Critic M11 (motion spec §6.10): Ferni draws at the display's rate only
/// while speaking, 30 fps otherwise or when throttled, and not at all when
/// the app isn't active or a sheet covers him.
final class AvatarScheduleTests: XCTestCase {
    func testOnlySpeakingRunsAtTheDisplayRate() {
        XCTAssertNil(AvatarView.schedule(speaking: true, throttled: false, covered: false, active: true).interval)
        XCTAssertEqual(AvatarView.schedule(speaking: false, throttled: false, covered: false, active: true).interval, 1.0 / 30)
        XCTAssertEqual(AvatarView.schedule(speaking: true, throttled: true, covered: false, active: true).interval, 1.0 / 30)
    }

    func testCoveredOrInactiveDrawsNothing() {
        XCTAssertTrue(AvatarView.schedule(speaking: false, throttled: false, covered: true, active: true).paused, "under a sheet")
        XCTAssertTrue(AvatarView.schedule(speaking: false, throttled: false, covered: false, active: false).paused)
        XCTAssertFalse(AvatarView.schedule(speaking: false, throttled: false, covered: false, active: true).paused)
    }
}
