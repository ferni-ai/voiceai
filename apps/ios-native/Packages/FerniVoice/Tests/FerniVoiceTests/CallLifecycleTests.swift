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
        /// How many times the mic had been asked for when the system's call began.
        var micAsks: (() -> Int)?
        private(set) var micAsksAtBegin: Int?
        init() { (requests, ask) = AsyncStream.makeStream(of: LifecycleRequest.self) }
        func begin(id: UUID, name: String) async throws {
            micAsksAtBegin = micAsks?()
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

    private var breadcrumbs: [String] = []

    /// `audioStart`: long by default, so only the audio-start tests ever see
    /// the watchdog, however slow the runner.
    private func session(agentTimeout: Duration = .milliseconds(200), audioStart: Duration = .seconds(60)) -> CallSession {
        let room = room
        let call = CallSession(
            fetchToken: { _ in CallToken(token: "t", url: "wss://x", room: "r", agentDispatched: true) },
            makeRoom: { room },
            audio: audio,
            lifecycle: lifecycle,
            agentTimeout: agentTimeout,
            arrivingAfter: .milliseconds(50), // "on the way" soon, as in CallSessionTests
            audioStartTimeout: audioStart,
            defaults: UserDefaults(suiteName: "lifecycle-\(UUID().uuidString)")!
        )
        call.breadcrumb = { [weak self] reason, _ in self?.breadcrumbs.append(reason) }
        return call
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
        // Generous: under a loaded test run 200 ms could expire before the agent joins.
        let call = session(agentTimeout: .seconds(2))
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

    // MARK: - The audio starts, or the call says so (App Review, January 2026)

    /// The system takes the call but never activates its audio: live would be
    /// silence. The app starts the audio itself and the call carries on, and
    /// the next call doesn't wait on the system at all.
    func testWhenTheSystemNeverStartsTheAudioTheAppDoes() async {
        let rooms = CallSessionTests.Rooms()
        let call = CallSession(
            fetchToken: { _ in CallToken(token: "t", url: "wss://x", room: "r", agentDispatched: true) },
            makeRoom: { let room = rooms.next(); rooms.made.append(room); return room },
            audio: audio, lifecycle: lifecycle, audioStartTimeout: .milliseconds(100),
            defaults: UserDefaults(suiteName: "lifecycle-\(UUID().uuidString)")!
        )
        call.breadcrumb = { [weak self] reason, _ in self?.breadcrumbs.append(reason) }
        call.start()
        await until(call.phase == .live)
        XCTAssertEqual(audio.ownership, [true])
        await until(audio.ownership == [true, false])
        XCTAssertEqual(call.phase, .live)
        await until(rooms.made.first?.micStates == [true, true])
        XCTAssertEqual(breadcrumbs, ["system_audio_missing", "own_audio_started"])

        await call.end()
        call.start()
        await until(call.phase == .live && rooms.made.count == 2)
        XCTAssertEqual(lifecycle.log.filter { $0.hasPrefix("begin") }.count, 1, "the next call skips the system")
        XCTAssertEqual(audio.ownership.last, false)
    }

    /// Neither the system nor the app can start the audio: never a silent
    /// "live". The call ends with the problem in words and Try again.
    func testIfTheAudioCantStartTheCallEndsWithRetry() async {
        audio.refuseOwnAudio = true
        let call = session(audioStart: .milliseconds(100))
        call.start()
        await until(call.phase == .failed(.audioDidNotStart))
        XCTAssertEqual(room.disconnects, 1)
        await until(lifecycle.log.last == "failed")
        XCTAssertEqual(breadcrumbs, ["system_audio_missing", "own_audio_failed"])
        XCTAssertFalse(CallProblem.audioDidNotStart.message.isEmpty)

        // Try again: straight to the app's own audio, and still no sound says
        // so (not "check your connection").
        call.start()
        await until(audio.ownership.count == 3 && call.phase == .failed(.audioDidNotStart))
        XCTAssertEqual(audio.ownership, [true, false, false])
        XCTAssertEqual(lifecycle.log.filter { $0.hasPrefix("begin") }.count, 1)
    }

    /// The usual case: the system activates the audio as its call starts.
    /// The watchdog leaves that call exactly as it was.
    func testAudioTheSystemStartsOnTimeIsLeftAlone() async {
        let call = session(audioStart: .milliseconds(100))
        call.start()
        lifecycle.ask.yield(.audio(active: true))
        await until(call.phase == .live)
        try? await Task.sleep(for: .milliseconds(400))
        XCTAssertEqual(audio.ownership, [true], "the app never took the audio")
        XCTAssertEqual(room.micStates, [true])
        XCTAssertTrue(breadcrumbs.isEmpty)
        XCTAssertEqual(call.phase, .live)
    }

    /// The mic is asked for before the system's call begins, so a first-time
    /// prompt never races the system call UI.
    func testTheMicIsAskedBeforeTheSystemsCallBegins() async {
        let audio = audio
        lifecycle.micAsks = { audio.micRequests }
        let call = session()
        call.start()
        await until(call.phase == .live)
        XCTAssertEqual(lifecycle.micAsksAtBegin, 1)
    }

    /// No mic, no call: the system's call never begins and no room is joined.
    func testNoMicrophoneNoSystemCall() async {
        audio.micAllowed = false
        let call = session()
        call.start()
        await until(call.phase == .failed(.microphoneDenied))
        XCTAssertFalse(lifecycle.log.contains { $0.hasPrefix("begin") }, "\(lifecycle.log)")
        XCTAssertNil(room.connectedTo)
    }
}

