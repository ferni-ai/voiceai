import Foundation
import XCTest
@testable import FerniVoice

/// A caption heard in a call carries that call's room, through CallSession and
/// not just CaptionBook, so a report about a line goes to the call where it
/// was heard, even after a dropped call rejoins in a fresh room (train 26
/// verify: dropping the room at the session's call site kept every test green).
@MainActor
final class CallSessionCaptionRoomTests: XCTestCase {
    private typealias FakeRoom = CallSessionTests.FakeRoom

    private final class Made: @unchecked Sendable {
        var rooms: [FakeRoom] = []
        var tokens = 0
    }

    private let made = Made()

    /// Each token names its own room: "ios-call-1", then "ios-call-2".
    private func makeSession() -> CallSession {
        let made = made
        return CallSession(
            fetchToken: { _ in
                made.tokens += 1
                return CallToken(token: "lk-\(made.tokens)", url: "wss://lk.example.test",
                                 room: "ios-call-\(made.tokens)", agentDispatched: true)
            },
            makeRoom: {
                let room = FakeRoom()
                made.rooms.append(room)
                return room
            },
            audio: CallSessionTests.FakeAudio(),
            agentTimeout: .seconds(5),
            defaults: UserDefaults(suiteName: "caption-room-tests-\(UUID().uuidString)")!
        )
    }

    private func until(_ condition: @autoclosure () -> Bool, file: StaticString = #filePath, line: UInt = #line) async {
        let deadline = ContinuousClock.now + .seconds(10)
        while !condition(), ContinuousClock.now < deadline { try? await Task.sleep(for: .milliseconds(10)) }
        XCTAssertTrue(condition(), "timed out", file: file, line: line)
    }

    private func caption(_ segment: String, _ text: String) -> RoomEvent {
        .caption(CaptionChunk(streamID: "s-\(segment)", segmentID: segment, speaker: .ferni, text: text, isFinal: true))
    }

    func testALineHeardInACallCarriesThatCallsRoom() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)
        XCTAssertEqual(session.roomName, "ios-call-1")

        made.rooms[0].send(caption("a", "Good to hear you."))

        await until(session.captions.lines.count == 1)
        XCTAssertEqual(session.captions.lines.first?.room, "ios-call-1")
    }

    /// After a rejoin the old line keeps the room it was heard in; only new
    /// lines get the fresh room.
    func testARejoinDoesNotMoveEarlierLines() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)
        made.rooms[0].send(caption("a", "Before the drop."))
        await until(session.captions.lines.count == 1)

        made.rooms[0].send(.disconnected(byUs: false))
        await until(made.rooms.count == 2 && session.phase == .live)
        XCTAssertEqual(session.roomName, "ios-call-2")
        made.rooms[1].send(caption("b", "After the rejoin."))

        await until(session.captions.lines.count == 2)
        XCTAssertEqual(session.captions.lines.map(\.text), ["Before the drop.", "After the rejoin."])
        XCTAssertEqual(session.captions.lines.map(\.room), ["ios-call-1", "ios-call-2"])
    }
}
