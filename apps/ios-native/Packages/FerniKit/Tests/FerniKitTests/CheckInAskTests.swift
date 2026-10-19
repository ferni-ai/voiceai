import Foundation
import XCTest
@testable import FerniKit

final class CheckInAskTests: XCTestCase {
    private let ask = CheckInAsk(defaults: UserDefaults(suiteName: "checkin-\(UUID().uuidString)")!)

    func testNeverBeforeAGoodCall() {
        XCTAssertFalse(ask.shouldAsk(uid: "a"))
        ask.recordGoodCall(uid: "a")
        XCTAssertTrue(ask.shouldAsk(uid: "a"))
    }

    func testNotNowWaitsThreeGoodCallsThenAsksOnceMoreThenNever() {
        ask.recordGoodCall(uid: "a")
        ask.declined(uid: "a")
        for _ in 0..<2 { ask.recordGoodCall(uid: "a"); XCTAssertFalse(ask.shouldAsk(uid: "a")) }
        ask.recordGoodCall(uid: "a")
        XCTAssertTrue(ask.shouldAsk(uid: "a"), "three more good calls: once more")
        ask.declined(uid: "a")
        for _ in 0..<10 { ask.recordGoodCall(uid: "a") }
        XCTAssertFalse(ask.shouldAsk(uid: "a"), "then never again")
    }

    func testEachPersonIsAskedForThemselves() {
        ask.recordGoodCall(uid: "a")
        XCTAssertFalse(ask.shouldAsk(uid: "b"))
    }
}
