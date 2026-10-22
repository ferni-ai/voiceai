import XCTest
@testable import FerniDesign

/// The avatar clock's frame time (red team item 3): each frame's motion is
/// for the moment it reaches the glass, the link's target presentation time.
final class FrameClockTests: XCTestCase {
    func testFrameTimeIsTheTargetSinceHeWoke() {
        var clock = FrameClock(origin: 1000)
        XCTAssertEqual(clock.seconds(presentingAt: 1000.5), 0.5, accuracy: 1e-12)
        XCTAssertEqual(clock.seconds(presentingAt: 1000.5 + 1.0 / 120), 0.5 + 1.0 / 120, accuracy: 1e-12)
    }

    func testFrameTimeFollowsTheTargetNotTheCallback() {
        // Two frames whose callbacks ran at the same moment but present a
        // refresh apart move a refresh apart; the callback time isn't an input.
        var clock = FrameClock(origin: 0)
        let a = clock.seconds(presentingAt: 10)
        let b = clock.seconds(presentingAt: 10 + 1.0 / 60)
        XCTAssertEqual(b - a, 1.0 / 60, accuracy: 1e-12)
    }

    func testFrameTimeNeverStepsBack() {
        var clock = FrameClock(origin: 0)
        XCTAssertEqual(clock.seconds(presentingAt: 5), 5)
        XCTAssertEqual(clock.seconds(presentingAt: 4.99), 5, "a late or reordered target holds, never rewinds the springs")
        XCTAssertEqual(clock.seconds(presentingAt: 5.01), 5.01, accuracy: 1e-12)
    }

    func testAPauseResumesAtTheNewTarget() {
        var clock = FrameClock(origin: 0)
        _ = clock.seconds(presentingAt: 2)
        XCTAssertEqual(clock.seconds(presentingAt: 12), 12, "covered for 10 s: the rig takes one capped step")
    }

    func testTheDateIsWhenTheFrameIsOnScreen() {
        let now = Date(timeIntervalSinceReferenceDate: 800_000_000)
        let d = FrameClock.date(presentingAt: 500.025, hostNow: 500, wallNow: now)
        XCTAssertEqual(d.timeIntervalSince(now), 0.025, accuracy: 1e-6)  // a Date this far from 2001 holds ~1e-7 s
    }

}
