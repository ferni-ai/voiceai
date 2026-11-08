import Foundation
import XCTest
@testable import FerniKit

/// #2868 item 38: a crisis call never brings the check-in ask back.
@MainActor
final class CrisisMarkerTests: XCTestCase {
    private let defaults = UserDefaults(suiteName: "crisis-\(UUID().uuidString)")!
    override func setUp() async throws { CrisisMarker.reset() }

    func testTheServersCrisisSignalAndOnlyThatOne() {
        XCTAssertTrue(CrisisMarker.isCrisisSignal(["type": "humanization_signal", "concernLevel": "crisis"]))
        XCTAssertFalse(CrisisMarker.isCrisisSignal(["type": "humanization_signal", "concernLevel": "elevated"]))
        XCTAssertFalse(CrisisMarker.isCrisisSignal(["type": "expression_update", "concernLevel": "crisis"]))
        XCTAssertFalse(CrisisMarker.isCrisisSignal([:]))
    }

    func testTheCrisisLineAndOnlyThatOne() {
        XCTAssertTrue(CrisisMarker.isCrisisLine(URL(string: "tel:988")!))
        XCTAssertTrue(CrisisMarker.isCrisisLine(URL(string: "sms:988")!))
        XCTAssertFalse(CrisisMarker.isCrisisLine(URL(string: "tel:911")!))
        XCTAssertFalse(CrisisMarker.isCrisisLine(URL(string: "tel:19885550100")!))
        XCTAssertFalse(CrisisMarker.isCrisisLine(URL(string: "https://988lifeline.org")!))
    }

    func testAMarkLastsUntilTheCallEndsThenClears() {
        CrisisMarker.mark()
        XCTAssertTrue(CrisisMarker.thisCall)
        XCTAssertTrue(CrisisMarker.endCall())
        XCTAssertFalse(CrisisMarker.endCall(), "the next call starts clear")
    }

    /// #2868 item 2: the call's sounds stay quiet through its goodbye, which
    /// plays after `endCall()`, and come back when the next call begins.
    func testTheSoundsMarkOutlastsTheCallsEndUntilTheNextCallBegins() {
        XCTAssertFalse(CrisisMarker.latestCallHadCrisis, "precondition: a normal call")
        CrisisMarker.mark()
        XCTAssertTrue(CrisisMarker.latestCallHadCrisis)
        XCTAssertTrue(CrisisMarker.endCall())
        XCTAssertTrue(CrisisMarker.latestCallHadCrisis, "still set for the goodbye")
        CrisisMarker.beginCall()
        XCTAssertFalse(CrisisMarker.latestCallHadCrisis, "the next call's sounds play")
    }

    /// Beginning a call touches only the sounds: a failed call's mark still
    /// carries to the next one for the check-in ask, as before.
    func testBeginningACallLeavesTheCheckInMarkAlone() {
        let ask = CheckInAsk(defaults: defaults)
        ask.recordGoodCall(uid: "a")
        CrisisMarker.mark()
        CrisisMarker.beginCall()
        XCTAssertTrue(CrisisMarker.thisCall)
        XCTAssertFalse(ask.shouldAsk(uid: "a"))
    }

    func testNoAskAfterACrisisCallEvenWhenTheCountIsAlreadyMet() {
        let ask = CheckInAsk(defaults: defaults)
        ask.recordGoodCall(uid: "a")
        XCTAssertTrue(ask.shouldAsk(uid: "a"), "precondition: the ask is due")
        CrisisMarker.mark()
        _ = CrisisMarker.endCall()
        XCTAssertFalse(ask.shouldAsk(uid: "a"), "not right after a crisis call")
        ask.recordGoodCall(uid: "a")
        XCTAssertTrue(ask.shouldAsk(uid: "a"), "a later good call without one brings it back")
    }

    /// The mark is never written to disk: it says something about how the person was doing.
    /// (No crisis-named key in the app's defaults after a mark, whatever ran before.)
    func testAMarkLeavesNothingOnDisk() {
        CrisisMarker.mark()
        let crisisKeys = UserDefaults.standard.dictionaryRepresentation().keys.filter { $0.lowercased().contains("crisis") }
        XCTAssertEqual(crisisKeys, [])
    }
}
