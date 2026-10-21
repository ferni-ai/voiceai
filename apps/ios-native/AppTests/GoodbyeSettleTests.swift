import SwiftUI
import XCTest
@testable import Ferni

/// Award upgrade 8: after a call the remember card rises out of where the
/// captions were and settles without a bounce; under Reduce Motion it fades.
final class GoodbyeSettleTests: XCTestCase {
    /// The settle's own curve, sampled every 10 ms for 2 s (critic L: the test
    /// restated the constants): it never passes its resting place by more than
    /// 1%, so no bounce, and it's there within 1.2 s.
    func testItSettlesWithoutABounce() {
        let spring = RememberCard.settleSpring
        let samples = stride(from: 0.0, through: 2.0, by: 0.01).map { spring.value(target: 1.0, time: $0) }
        XCTAssertLessThanOrEqual(samples.max() ?? 0, 1.01, "overshoot \((samples.max() ?? 0) - 1)")
        XCTAssertGreaterThan(spring.value(target: 1.0, time: 1.2), 0.99, "settled by 1.2 s")
        XCTAssertLessThan(spring.value(target: 1.0, time: 0.1), 0.5, "and it moves: not a jump")
    }

    func testUnderReduceMotionItFadesWhereItRests() {
        XCTAssertFalse(RememberCard.travels(reduceMotion: true))
        XCTAssertTrue(RememberCard.travels(reduceMotion: false))
    }
}

/// Award upgrade 9: muted, Ferni looks away only while he'd be watching you.
/// The rule; AvatarGlueTests.testMutingALiveCallTurnsHisRigAway checks it
/// reaches his rig from a real muted call, and LookAwayTests what the rig
/// then draws (the look, and no nods).
final class LookAwayWhileMutedPoseTests: XCTestCase {
    func testOnlyWhileHeWouldBeListening() {
        XCTAssertTrue(CallAvatar.looksAway(muted: true, pose: .listening))
        XCTAssertFalse(CallAvatar.looksAway(muted: false, pose: .listening))
        XCTAssertFalse(CallAvatar.looksAway(muted: true, pose: .speaking), "he still looks at you to talk")
        XCTAssertFalse(CallAvatar.looksAway(muted: true, pose: .thinking))
    }
}
