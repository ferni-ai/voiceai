import XCTest
@testable import FerniDesign

/// The pacing measurements (avatar red team item 7): presented intervals
/// at p50/p99 and the hitch ratio.
final class PresentStatsTests: XCTestCase {
    private let period120 = 1.0 / 120

    func testSteady120HzHasNoHitches() throws {
        var s = PresentStats()
        for i in 0...240 { s.presented(at: 10 + Double(i) * period120, expected: period120) }
        let r = try XCTUnwrap(s.report())
        XCTAssertEqual(r.frames, 240)
        XCTAssertEqual(r.p50, period120, accuracy: 1e-9)
        XCTAssertEqual(r.p99, period120, accuracy: 1e-9)
        XCTAssertEqual(r.hitchMsPerSecond, 0)
    }

    func testAMissedRefreshIsAHitch() throws {
        var s = PresentStats(), t = 10.0
        for i in 0..<120 {
            t += i == 60 ? 3 * period120 : period120   // one frame two refreshes late
            s.presented(at: t, expected: period120)
        }
        let r = try XCTUnwrap(s.report())
        // 16.7 ms late over ~1 s.
        XCTAssertEqual(r.hitchMsPerSecond, 2 * period120 * 1000 / (t - 10 - period120), accuracy: 0.01)
        XCTAssertGreaterThan(r.hitchMsPerSecond, 1, "over the 1 ms/s target")
        XCTAssertEqual(r.p50, period120, accuracy: 1e-9)
    }

    func testSixtyAtItsOwnRateIsOnTime() throws {
        var s = PresentStats()
        for i in 0...60 { s.presented(at: Double(i + 1) / 60, expected: 1.0 / 60) }
        let r = try XCTUnwrap(s.report())
        XCTAssertEqual(r.hitchMsPerSecond, 0)
        XCTAssertEqual(r.p99, 1.0 / 60, accuracy: 1e-9)
    }

    func testPausesAndUnshownFramesAreNotHitches() throws {
        var s = PresentStats()
        s.presented(at: 1, expected: period120)
        s.presented(at: 0, expected: period120)          // never shown
        s.presented(at: 1 + period120, expected: period120)
        s.presented(at: 5, expected: period120)          // covered for 4 s
        s.presented(at: 5 + period120, expected: period120)
        let r = try XCTUnwrap(s.report())
        XCTAssertEqual(r.frames, 2)
        XCTAssertEqual(r.hitchMsPerSecond, 0)
        XCTAssertNil(s.report(), "the window starts fresh")
    }
}
