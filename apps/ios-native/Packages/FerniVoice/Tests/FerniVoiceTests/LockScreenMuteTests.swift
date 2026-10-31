import FerniKit
import Foundation
import XCTest
@testable import FerniVoice

/// #2868 item 45: the Lock Screen's mute button runs on a locked phone for
/// whoever holds it. It mutes a live call and never turns the mic back on.
@MainActor
final class LockScreenMuteTests: XCTestCase {
    final class Room: VoiceRoom, @unchecked Sendable {
        let events: AsyncStream<RoomEvent>
        let c: AsyncStream<RoomEvent>.Continuation
        var mic: [Bool] = []
        init() { (events, c) = AsyncStream.makeStream(of: RoomEvent.self) }
        func connect(url: String, token: String) async throws { c.yield(.agentJoined(attributes: ["lk.agent.state": "listening"])) }
        func setMicrophone(enabled: Bool) async throws { mic.append(enabled) }
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

    private let rooms = Rooms()

    private func makeSession() -> CallSession {
        let rooms = rooms
        return CallSession(
            fetchToken: { _ in CallToken(token: "t", url: "wss://x.test", room: "r", agentDispatched: true) },
            makeRoom: { let room = Room(); rooms.made.append(room); return room },
            audio: Audio(), defaults: UserDefaults(suiteName: "lock-mute-\(UUID().uuidString)")!
        )
    }

    private func until(_ c: @autoclosure () -> Bool) async {
        let deadline = ContinuousClock.now + .seconds(10)
        while !c(), ContinuousClock.now < deadline { try? await Task.sleep(for: .milliseconds(10)) }
        XCTAssertTrue(c(), "timed out")
    }

    func testItMutesALiveCall() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)
        await session.muteFromLockScreen()
        XCTAssertTrue(session.isMuted)
    }

    /// The verifier's probe: a second press used to unmute ([true, false, true]).
    func testASecondPressNeverUnmutes() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)
        await session.muteFromLockScreen()
        await session.muteFromLockScreen()
        XCTAssertTrue(session.isMuted, "a locked phone turned the mic back on")
        XCTAssertFalse(rooms.made.last?.mic.last ?? false, "the mic is on")
    }

    /// Muted in the app or with AirPods before the Lock Screen caught up: stays muted.
    func testACallMutedAnotherWayStaysMuted() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)
        await session.toggleMute()
        XCTAssertTrue(session.isMuted, "precondition")
        await session.muteFromLockScreen()
        XCTAssertTrue(session.isMuted)
    }

    func testNoLiveCallNothingChanges() async {
        let session = makeSession()
        await session.muteFromLockScreen()
        XCTAssertFalse(session.isMuted, "an idle call was muted")
        session.start()
        await until(session.phase == .live)
        await session.end()
        await session.muteFromLockScreen()
        XCTAssertFalse(session.isMuted, "an ended call was muted")
    }
}
