import QuartzCore
import XCTest
@testable import FerniDesign

/// Critic M11 (motion spec §6.10), on the avatar's display link (red team
/// item 3): the link asks for the pace's rate, and stops when the app isn't
/// active or a sheet covers him.
final class AvatarScheduleTests: XCTestCase {
    private func assert(_ range: CAFrameRateRange, min: Float, max: Float, preferred: Float, _ message: String,
                        line: UInt = #line) {
        XCTAssertEqual(range.minimum, min, "\(message): minimum", line: line)
        XCTAssertEqual(range.maximum, max, "\(message): maximum", line: line)
        XCTAssertEqual(range.preferred ?? 0, preferred, "\(message): preferred", line: line)
    }

    func testTheLinkAsksForThePacesRate() {
        assert(FramePace.range(for: 120), min: 60, max: 120, preferred: 120, "the top: never below the call's floor")
        assert(FramePace.range(for: 60), min: 60, max: 60, preferred: 60, "in a call at rest")
        assert(FramePace.range(for: 30), min: 30, max: 30, preferred: 30, "at home at rest")
    }

    func testTheRangeNeverAsksAboveThePace() {
        // Low Power's 60 cap holds on the link: the range for 60 tops out at 60.
        let lowPower = FramePace.rate(inCall: true, speaking: true, fastMotion: true, settled: false, lowPower: true)
        XCTAssertEqual(FramePace.range(for: lowPower).maximum, 60)
    }

    func testCoveredOrInactiveDrawsNothing() {
        XCTAssertTrue(AvatarView.paused(covered: true, active: true), "under a sheet")
        XCTAssertTrue(AvatarView.paused(covered: false, active: false))
        XCTAssertFalse(AvatarView.paused(covered: false, active: true))
    }
}
