import XCTest
@testable import FerniLink

final class WatchLinkTests: XCTestCase {
    func testCommandsRoundTripAndNothingElseIsOne() {
        for command in RemoteCommand.allCases {
            XCTAssertEqual(RemoteCommand(message: command.message), command)
        }
        XCTAssertNil(RemoteCommand(message: ["command": "delete-account"]))
        XCTAssertNil(RemoteCommand(message: ["command": 3]))
        XCTAssertNil(RemoteCommand(message: [:]))
    }

    func testStateRoundTripsThroughTheContext() {
        let state = RemoteState(phase: .live, muted: true, name: "Maya")
        XCTAssertEqual(RemoteState(context: state.context), state)
        XCTAssertTrue(state.inCall)
        XCTAssertFalse(RemoteState(phase: .ended).inCall)
    }

    /// A garbled or hostile context shows an idle Ferni, never stray text.
    func testUnreadableContextIsIdleFerni() {
        XCTAssertEqual(RemoteState(context: ["phase": "exploded", "muted": "yes", "name": 7]), RemoteState())
        XCTAssertEqual(RemoteState(context: ["name": String(repeating: "x", count: 500)]).name.count, 24)
        XCTAssertEqual(RemoteState(context: ["name": "   "]).name, "Ferni")
    }

    /// The context carries only who and what's happening: never what was said.
    func testTheContextHoldsNothingSaid() {
        XCTAssertEqual(Set(RemoteState(phase: .live).context.keys), ["phase", "muted", "name"])
    }
}
