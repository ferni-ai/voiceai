import Foundation
import XCTest
@testable import FerniVoice

/// The call as the system sees it: begun, connected, ended, and what the
/// person does from the Lock Screen or AirPods.
@MainActor
final class CallLifecycleTests: XCTestCase {
    final class FakeLifecycle: CallLifecycle, @unchecked Sendable {
        let requests: AsyncStream<LifecycleRequest>
        let ask: AsyncStream<LifecycleRequest>.Continuation
        var refuse = false
        private(set) var log: [String] = []
        init() { (requests, ask) = AsyncStream.makeStream(of: LifecycleRequest.self) }
        func begin(id: UUID, name: String) async throws {
            log.append("begin \(name)")
            if refuse { throw URLError(.cancelled) }
        }
        func connected(id: UUID) { log.append("connected") }
        func setMuted(id: UUID, muted: Bool) async { log.append("muted \(muted)") }
        func ended(id: UUID, failed: Bool) async { log.append(failed ? "failed" : "ended") }
    }

    private let lifecycle = FakeLifecycle()
    private var room = CallSessionTests.FakeRoom()
    private let audio = CallSessionTests.FakeAudio()

    private func session() -> CallSession {
        let room = room
        return CallSession(
            fetchToken: { _ in CallToken(token: "t", url: "wss://x", room: "r", agentDispatched: true) },
            makeRoom: { room },
            audio: audio,
            lifecycle: lifecycle,
            agentTimeout: .milliseconds(200),
            defaults: UserDefaults(suiteName: "lifecycle-\(UUID().uuidString)")!
        )
    }

    private func until(_ condition: @autoclosure () -> Bool, file: StaticString = #filePath, line: UInt = #line) async {
        let deadline = ContinuousClock.now + .seconds(2)
        while !condition(), ContinuousClock.now < deadline { try? await Task.sleep(for: .milliseconds(10)) }
        XCTAssertTrue(condition(), "timed out", file: file, line: line)
    }

    func testTheSystemHearsTheCallBeginConnectAndEnd() async {
        let call = session()
        call.start(personaID: "maya")
        await until(call.phase == .live)
        await call.end()
        XCTAssertEqual(lifecycle.log, ["begin Maya", "connected", "ended"])
    }

    func testIfTheSystemRefusesTheCallStillWorks() async {
        lifecycle.refuse = true
        let call = session()
        call.start()
        await until(call.phase == .live)
    }

    func testEndingFromTheLockScreenEndsTheCall() async {
        let call = session()
        call.start()
        await until(call.phase == .live)
        lifecycle.ask.yield(.end)
        await until(call.phase == .ended)
        XCTAssertEqual(room.disconnects, 1)
    }

    func testASystemThatEndsTheCallAtOnceDoesNotStopIt() async {
        room = CallSessionTests.FakeRoom(agentOnConnect: nil)
        let call = session()
        call.start()
        await until(call.phase == .waitingForFerni)
        lifecycle.ask.yield(.end) // within a moment of starting, before it's live
        room.send(.agentJoined(attributes: [:]))
        await until(call.phase == .live)
        await call.end()
        XCTAssertFalse(lifecycle.log.contains("ended"), "a refused call isn't reported ended")
    }

    func testAirPodsMuteMutesTheCall() async {
        let call = session()
        call.start()
        await until(call.phase == .live)
        lifecycle.ask.yield(.mute(true))
        await until(call.isMuted)
        XCTAssertEqual(room.micStates.last, false)
        lifecycle.ask.yield(.mute(true))
        try? await Task.sleep(for: .milliseconds(50))
        XCTAssertEqual(room.micStates.filter { !$0 }.count, 1, "the same request twice changes nothing")
    }

    func testMutingInTheAppTellsTheSystem() async {
        let call = session()
        call.start()
        await until(call.phase == .live)
        await call.toggleMute()
        XCTAssertEqual(lifecycle.log.last, "muted true")
    }

    func testAFailedCallIsReportedFailed() async {
        room = CallSessionTests.FakeRoom(agentOnConnect: nil)
        let call = session()
        call.start()
        await until(call.phase == .failed(.ferniDidNotJoin))
        await until(lifecycle.log.last == "failed")
    }

    func testAPhoneCallPutsFerniOnHold() async {
        let call = session()
        call.start()
        await until(call.phase == .live)
        audio.interrupt.yield(.began)
        await until(call.isOnHold)
        audio.interrupt.yield(.ended(shouldResume: true))
        await until(!call.isOnHold)
    }

    // MARK: - Critic C1: the system owns the call's audio

    /// Under LiveCommunicationKit the app sets the session up but never
    /// activates it; the system does, and says so.
    func testUnderTheSystemTheAppNeverActivatesTheSessionItself() async {
        let call = session()
        call.start()
        await until(call.phase == .live)
        XCTAssertEqual(audio.ownership, [true])
        lifecycle.ask.yield(.audio(active: true))
        await until(audio.systemStates == [true])
    }

    /// The system taking the audio back mid-call (another call) puts Ferni on
    /// hold; giving it back resumes, mic and all.
    func testTheSystemsAudioDecidesHoldAndResume() async {
        let call = session()
        call.start()
        await until(call.phase == .live)
        lifecycle.ask.yield(.audio(active: true))
        lifecycle.ask.yield(.audio(active: false))
        await until(call.isOnHold)
        XCTAssertEqual(audio.systemStates, [true, false])

        lifecycle.ask.yield(.audio(active: true))
        await until(!call.isOnHold)
        XCTAssertEqual(room.micStates, [true, true])
    }

    /// If the system refuses the call, nobody else will activate the audio:
    /// the app does.
    func testARefusedCallRunsItsOwnAudio() async {
        lifecycle.refuse = true
        let call = session()
        call.start()
        await until(call.phase == .live)
        XCTAssertEqual(audio.ownership, [false])
    }

    /// The Simulator's call service ends the call at once, after the room is
    /// already up: the app takes the audio over.
    func testASystemThatDropsTheCallAtOnceHandsTheAudioBack() async {
        room = CallSessionTests.FakeRoom(agentOnConnect: nil)
        let call = session()
        call.start()
        await until(call.phase == .waitingForFerni)
        lifecycle.ask.yield(.end)
        await until(audio.ownership == [true, false])
        room.send(.agentJoined(attributes: [:]))
        await until(call.phase == .live)
    }
}

