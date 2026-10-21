import SwiftUI
import XCTest
@testable import Ferni

/// Award upgrade 8: after a call the remember card rises out of where the
/// captions were and settles without a bounce; under Reduce Motion it fades.
final class GoodbyeSettleTests: XCTestCase {
    func testASoftSettleOrAFade() {
        XCTAssertEqual(RememberCard.settle(reduceMotion: false), .spring(response: 0.6, dampingFraction: 0.9))
        XCTAssertEqual(RememberCard.settle(reduceMotion: true), .easeOut(duration: 0.25), "no travel under Reduce Motion")
    }
}

/// Award upgrade 9: muted, Ferni looks away only while he'd be watching you.
final class LookAwayWhileMutedTests: XCTestCase {
    func testOnlyWhileHeWouldBeListening() {
        XCTAssertTrue(CallAvatar.looksAway(muted: true, pose: .listening))
        XCTAssertFalse(CallAvatar.looksAway(muted: false, pose: .listening))
        XCTAssertFalse(CallAvatar.looksAway(muted: true, pose: .speaking), "he still looks at you to talk")
        XCTAssertFalse(CallAvatar.looksAway(muted: true, pose: .thinking))
    }
}
