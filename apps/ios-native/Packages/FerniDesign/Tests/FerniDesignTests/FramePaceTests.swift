import XCTest
@testable import FerniDesign

/// Avatar red team 2026-10-22: the rate follows motion, not only speech.
/// Blinks, saccades, nods and keyed moments drew at 30 fps whenever he
/// wasn't speaking, and a blink's closed frame was often skipped.
@MainActor
final class FramePaceTests: XCTestCase {
    private func rate(inCall: Bool = true, speaking: Bool = false, fast: Bool = false, settled: Bool = true,
                      lowPower: Bool = false) -> Int {
        FramePace.rate(inCall: inCall, speaking: speaking, fastMotion: fast, settled: settled, lowPower: lowPower)
    }

    // MARK: The policy

    func testSpeakingRunsAtTheTop() {
        XCTAssertEqual(rate(speaking: true), 120)
    }

    func testQuickMotionRunsAtTheTopInACallAndAtHome() {
        XCTAssertEqual(rate(fast: true), 120)
        XCTAssertEqual(rate(inCall: false, fast: true), 120)
        XCTAssertEqual(rate(settled: false), 120, "a spring still moving")
        XCTAssertEqual(rate(inCall: false, settled: false), 120)
    }

    func testACallNeverDropsBelowSixty() {
        XCTAssertEqual(rate(), 60, "listening or thinking, at rest")
        XCTAssertEqual(rate(lowPower: true), 60)
        for speaking in [false, true] {
            for fast in [false, true] {
                for settled in [false, true] {
                    for lowPower in [false, true] {
                        XCTAssertGreaterThanOrEqual(rate(speaking: speaking, fast: fast, settled: settled, lowPower: lowPower), 60)
                    }
                }
            }
        }
    }

    func testThirtyOnlyAtHomeAtRest() {
        XCTAssertEqual(rate(inCall: false), 30)
        XCTAssertEqual(rate(inCall: false, lowPower: true), 30)
    }

    func testLowPowerCapsAtSixty() {
        XCTAssertEqual(rate(speaking: true, lowPower: true), 60)
        XCTAssertEqual(rate(fast: true, lowPower: true), 60)
        XCTAssertEqual(rate(inCall: false, settled: false, lowPower: true), 60)
    }

    func testOnlyHomeAndErrorAreOutsideACall() {
        XCTAssertFalse(FramePace.inCall(.idle))
        XCTAssertFalse(FramePace.inCall(.error))
        for a in [AvatarActivity.arriving, .listening, .thinking, .speaking, .reconnecting] {
            XCTAssertTrue(FramePace.inCall(a), "\(a)")
        }
    }

    // MARK: The rig drives it

    /// Steps a listening rig at the rate the pace asks for, as the view's clock does.
    private func runListening(seconds: Double, seed: UInt64, sample: (AliveRig, Int, AliveUniforms) -> Void) {
        let rig = AliveRig(persona: .ferni, seed: seed)
        rig.activity = .listening
        var t = 0.0, hz = FramePace.inCallFloor
        while t < seconds {
            t += 1.0 / Double(hz)
            let u = rig.frame(at: t)
            hz = AvatarView.pace(activity: .listening, rig: rig, throttled: false)
            sample(rig, hz, u)
        }
    }

    func testABlinkInFlightWhileIdleInACallGetsAtLeastSixty() {
        var blinkFrames = 0
        runListening(seconds: 30, seed: 7) { rig, hz, _ in
            guard rig.blinking else { return }
            blinkFrames += 1
            XCTAssertTrue(rig.fastMotion, "a blink is fast motion")
            XCTAssertGreaterThanOrEqual(hz, 60)
            XCTAssertEqual(hz, 120, "a blink draws at the top rate")
        }
        XCTAssertGreaterThan(blinkFrames, 10, "the run saw blinks")
    }

    /// The flicker: a blink is ~130 ms (55 ms closing, 20 ms shut, 75 ms
    /// opening). At 30 fps that's four or five frames, each segment stretched
    /// to a frame boundary; at the top rate it's fifteen.
    func testEveryBlinkIsDrawnInFullMotion() {
        for seed: UInt64 in [3, 7, 11, 19] {
            var blinks: [Int] = [], frames = 0
            runListening(seconds: 30, seed: seed) { rig, _, _ in
                if rig.blinking {
                    frames += 1
                } else if frames > 0 {
                    blinks.append(frames)
                    frames = 0
                }
            }
            XCTAssertGreaterThan(blinks.count, 2, "seed \(seed)")
            XCTAssertGreaterThanOrEqual(blinks.min() ?? 0, 12, "seed \(seed): frames per blink \(blinks)")
        }
    }

    func testAtHomeHeSettlesToThirtyBetweenMoments() {
        let rig = AliveRig(persona: .ferni, seed: 5)
        var t = 0.0, hz = FramePace.rest, frames = [Int: Double]()
        while t < 40 {
            let dt = 1.0 / Double(hz)
            t += dt
            _ = rig.frame(at: t)
            hz = AvatarView.pace(activity: .idle, rig: rig, throttled: false)
            if t > 3 { frames[hz, default: 0] += dt }
        }
        XCTAssertGreaterThan(frames[30] ?? 0, 5, "seconds at 30 fps: he does settle at home")
        XCTAssertGreaterThan(frames[120] ?? 0, 1, "seconds at the top rate: blinks and glances")
    }

    func testARequestStirsTheRigAtOnce() {
        let rig = AliveRig(persona: .ferni, seed: 5)
        rig.blinksOnly = true
        var t = 0.0
        while t < 3 { t += 1.0 / 30; _ = rig.frame(at: t) }
        // Between blinks a quiet rig is settled; a micro-expression stirs it before the next frame.
        while rig.fastMotion { t += 1.0 / 30; _ = rig.frame(at: t) }
        while !rig.settled { t += 1.0 / 30; _ = rig.frame(at: t) }
        XCTAssertEqual(AvatarView.pace(activity: .idle, rig: rig, throttled: false), 30)
        rig.micro(.recognition)
        XCTAssertFalse(rig.settled)
        XCTAssertEqual(AvatarView.pace(activity: .idle, rig: rig, throttled: false), 120)
    }

    func testKeyedMomentsAreFastMotion() {
        let rig = AliveRig(persona: .ferni, seed: 5)
        _ = rig.frame(at: 1)
        rig.play(.join)
        XCTAssertTrue(rig.fastMotion)
        XCTAssertEqual(AvatarView.pace(activity: .listening, rig: rig, throttled: false), 120)
        XCTAssertEqual(AvatarView.pace(activity: .listening, rig: rig, throttled: true), 60)
    }
}
