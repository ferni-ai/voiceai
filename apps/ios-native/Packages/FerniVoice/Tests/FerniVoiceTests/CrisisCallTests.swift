import FerniKit
import Foundation
import XCTest
@testable import FerniVoice

/// #2868 item 38: a call with a crisis in it is never a "good call", so it
/// never brings the check-in ask back.
@MainActor
final class CrisisCallTests: XCTestCase {
    final class Room: VoiceRoom, @unchecked Sendable {
        let events: AsyncStream<RoomEvent>
        let c: AsyncStream<RoomEvent>.Continuation
        init() { (events, c) = AsyncStream.makeStream(of: RoomEvent.self) }
        func connect(url: String, token: String) async throws { c.yield(.agentJoined(attributes: ["lk.agent.state": "listening"])) }
        func setMicrophone(enabled: Bool) async throws {}
        func send(_ data: Data) async throws {}
        func disconnect() async { c.finish() }
    }

    final class Audio: CallAudio, @unchecked Sendable {
        let interruptions: AsyncStream<AudioInterruption>
        init() { (interruptions, _) = AsyncStream.makeStream(of: AudioInterruption.self) }
        func requestMicrophone() async -> Bool { true }
        func activate(systemOwned: Bool) throws {}
        func deactivate(systemOwned: Bool) {}
        func systemAudio(active: Bool) {}
    }

    final class Rooms: @unchecked Sendable { var made: [Room] = [] }

    final class Clock: @unchecked Sendable {
        var now = ContinuousClock.now
        func advance(by d: Duration) { now = now.advanced(by: d) }
    }

    private let defaults = UserDefaults(suiteName: "crisis-call-\(UUID().uuidString)")!
    private let rooms = Rooms()
    private let clock = Clock()
    private let crisis = try! JSONSerialization.data(withJSONObject: [
        "type": "humanization_signal", "signalType": "concern_detected", "concernLevel": "crisis", "timestamp": 0.0,
    ])

    override func setUp() async throws { CrisisMarker.reset() }

    private func makeSession() -> CallSession {
        let rooms = rooms
        let session = CallSession(
            fetchToken: { _ in CallToken(token: "t", url: "wss://x.test", room: "r", agentDispatched: true) },
            makeRoom: { let room = Room(); rooms.made.append(room); return room },
            audio: Audio(), defaults: defaults
        )
        let clock = clock
        session.now = { clock.now }
        return session
    }

    private func until(_ c: @autoclosure () -> Bool) async {
        let deadline = ContinuousClock.now + .seconds(10)
        while !c(), ContinuousClock.now < deadline { try? await Task.sleep(for: .milliseconds(10)) }
        XCTAssertTrue(c(), "timed out")
    }

    /// A call: live, an optional crisis signal at `crisisAfter`, ended by the person after `length`.
    private func call(_ session: CallSession, length: Duration, crisisAfter: Duration? = nil) async {
        session.start()
        await until(session.phase == .live)
        if let crisisAfter {
            clock.advance(by: crisisAfter)
            rooms.made.last?.c.yield(.data(crisis))
            await until(CrisisMarker.thisCall)
            clock.advance(by: length - crisisAfter)
        } else {
            clock.advance(by: length)
        }
        await session.end()
    }

    func testControlALongCallYouEndIsGood() async {
        let session = makeSession()
        await call(session, length: .seconds(300))
        XCTAssertTrue(session.lastCallWasGood)
    }

    /// The verifier's probe: a real crisis signal, 300 s, ended by the person.
    func testACrisisCallIsNeverAGoodCall() async {
        let session = makeSession()
        await call(session, length: .seconds(300), crisisAfter: .zero)
        XCTAssertFalse(session.lastCallWasGood, "a crisis call counted as a good call")
    }

    func testACrisisDetectedLateInTheCallStillCounts() async {
        let session = makeSession()
        await call(session, length: .seconds(300), crisisAfter: .seconds(280))
        XCTAssertFalse(session.lastCallWasGood)
    }

    func testTheNextCallWithoutOneIsGoodAgain() async {
        let session = makeSession()
        await call(session, length: .seconds(300), crisisAfter: .seconds(10))
        XCTAssertFalse(session.lastCallWasGood)
        await call(session, length: .seconds(300))
        XCTAssertTrue(session.lastCallWasGood, "the mark is per call")
    }

    /// End to end with the ask: due before, not after a crisis call.
    func testNoCheckInAskRightAfterACrisisCall() async {
        let ask = CheckInAsk(defaults: defaults)
        ask.recordGoodCall(uid: "a")
        XCTAssertTrue(ask.shouldAsk(uid: "a"), "precondition: the ask is due")
        let session = makeSession()
        await call(session, length: .seconds(300), crisisAfter: .seconds(60))
        if session.lastCallWasGood { ask.recordGoodCall(uid: "a") } // what FerniApp does on .ended
        XCTAssertFalse(ask.shouldAsk(uid: "a"))
    }
}
