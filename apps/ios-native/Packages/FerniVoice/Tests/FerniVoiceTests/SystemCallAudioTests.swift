import AVFAudio
import Foundation
import LiveKit
import os
import XCTest
@testable import FerniVoice

/// The real adapter: under the system's call service the engine stays off
/// until the system hands over the session (LiveKit 2.12.1 README,
/// "Integration with CallKit"), stays on for every room of that call, and goes
/// off when the call ends or the system takes the audio back.
@MainActor
final class SystemCallAudioTests: XCTestCase {
    /// Every availability the adapter set, in order.
    final class Engine: @unchecked Sendable {
        private let states = OSAllocatedUnfairLock(initialState: [String]())
        var all: [String] { states.withLock { $0 } }
        var now: String? { all.last }
        func record(_ availability: AudioEngineAvailability) {
            let state = availability.isInputAvailable && availability.isOutputAvailable ? "on"
                : !availability.isInputAvailable && !availability.isOutputAvailable ? "off" : "partial"
            states.withLock { $0.append(state) }
        }
    }

    private var engine: (input: Bool, output: Bool) {
        let availability = AudioManager.shared.engineAvailability
        return (availability.isInputAvailable, availability.isOutputAvailable)
    }

    override func tearDown() async throws {
        try? AudioManager.shared.setEngineAvailability(.default)
        try await super.tearDown()
    }

    private func recorded(_ engine: Engine) -> SystemCallAudio {
        SystemCallAudio(systemManagesCalls: true, engine: { engine.record($0) })
    }

    /// Everything the adapter asked of the audio session, last value wins.
    final class Session: AudioSessionSettings, @unchecked Sendable {
        var category: AVAudioSession.Category?
        var mode: AVAudioSession.Mode?
        var options: AVAudioSession.CategoryOptions = []
        var configured = 0
        var ioBuffer: TimeInterval?
        var active: [Bool] = []
        func setCategory(_ category: AVAudioSession.Category, mode: AVAudioSession.Mode,
                         options: AVAudioSession.CategoryOptions) throws {
            self.category = category; self.mode = mode; self.options = options
            configured += 1
        }
        func setAllowHapticsAndSystemSoundsDuringRecording(_ inValue: Bool) throws {}
        func setPreferredIOBufferDuration(_ duration: TimeInterval) throws { ioBuffer = duration }
        func setActive(_ active: Bool, options: AVAudioSession.SetActiveOptions) throws { self.active.append(active) }
    }

    /// The SDK's automatic setup is off, so the call asks for a 20 ms buffer
    /// itself, whoever activates the session (LiveKit's mixer stutters on the
    /// larger buffers iOS can pick on its own).
    func testEveryCallAsksForA20MillisecondBuffer() throws {
        for systemOwned in [false, true] {
            let session = Session()
            let audio = SystemCallAudio(systemManagesCalls: systemOwned, engine: { _ in }, session: session)
            XCTAssertNil(session.ioBuffer, "nothing asked before a call")
            try audio.activate(systemOwned: systemOwned)
            XCTAssertEqual(session.ioBuffer, 0.02, "system owned: \(systemOwned)")
            XCTAssertEqual(session.category, .playAndRecord)
            XCTAssertEqual(session.mode, .voiceChat)
        }
        let session = Session()
        let audio = SystemCallAudio(systemManagesCalls: true, engine: { _ in }, session: session)
        audio.systemAudio(active: true)
        XCTAssertEqual(session.ioBuffer, 0.02, "when the system hands over the session")
    }

    /// Critic C1: never before the system's go, for the first call or the next.
    func testTheEngineWaitsForTheSystemToActivateTheSession() throws {
        let engine = Engine()
        let audio = recorded(engine)
        XCTAssertEqual(engine.now, "off", "off before any call")
        try audio.activate(systemOwned: true)
        XCTAssertEqual(engine.all, ["off"], "a system-owned room doesn't start it before the system does")
        audio.systemAudio(active: true)
        XCTAssertEqual(engine.now, "on", "on once the system activates")
        audio.systemAudio(active: false)
        XCTAssertEqual(engine.now, "off", "off when the system takes it back")
        audio.systemAudio(active: true)
        audio.callEnded()
        XCTAssertEqual(engine.now, "off", "off when the call ends, ready for the next")
        try audio.activate(systemOwned: true)
        XCTAssertEqual(engine.now, "off", "and the next call waits for the system again")
    }

    /// The P0 (2026-10-21): leaving a room mid-call turned the engine off, and
    /// the next system-owned room never turned it back on.
    func testBetweenRoomsOfOneCallTheEngineStaysAvailable() throws {
        let engine = Engine()
        let audio = recorded(engine)
        audio.systemAudio(active: true)
        try audio.activate(systemOwned: true)
        audio.deactivate(systemOwned: true) // a dropped room, or Ferni didn't join
        XCTAssertEqual(engine.now, "on", "not off between rooms")
        try audio.activate(systemOwned: true) // the next room of the same call
        XCTAssertEqual(engine.now, "on", "on for the next room")
    }

    func testWithoutTheSystemTheEngineIsLeftAlone() {
        try? AudioManager.shared.setEngineAvailability(.default)
        withExtendedLifetime(SystemCallAudio(systemManagesCalls: false)) {
            XCTAssertTrue(engine == (true, true))
        }
    }

    /// Bluetooth in headset mode only: AirPods carry the mic and Ferni's
    /// voice together, never A2DP's music-only link.
    func testACallUsesBluetoothAsAHeadsetOnly() throws {
        let session = Session()
        let audio = SystemCallAudio(systemManagesCalls: false, engine: { _ in }, session: session)
        try audio.activate(systemOwned: false)
        XCTAssertFalse(session.options.contains(.allowBluetoothA2DP), "no A2DP")
        XCTAssertEqual(session.options, [.defaultToSpeaker, .allowBluetoothHFP, .allowAirPlay])
    }

    // MARK: - When the session changes under the call

    private func post(_ name: Notification.Name, _ info: [AnyHashable: Any] = [:], to center: NotificationCenter) {
        center.post(name: name, object: nil, userInfo: info)
    }

    private func route(_ reason: AVAudioSession.RouteChangeReason) -> [AnyHashable: Any] {
        [AVAudioSessionRouteChangeReasonKey: reason.rawValue]
    }

    /// AirPods in or out mid-call: the call's settings again. Not for the
    /// category change that setting them posts (it would loop), not at rest.
    func testADeviceComingOrGoingSetsTheSessionUpAgain() throws {
        let session = Session(), center = NotificationCenter()
        let audio = SystemCallAudio(systemManagesCalls: false, engine: { _ in }, session: session, notifications: center)
        try audio.activate(systemOwned: false)
        XCTAssertEqual(session.configured, 1)
        post(AVAudioSession.routeChangeNotification, route(.newDeviceAvailable), to: center)
        XCTAssertEqual(session.configured, 2, "a device arrived")
        post(AVAudioSession.routeChangeNotification, route(.oldDeviceUnavailable), to: center)
        XCTAssertEqual(session.configured, 3, "a device went")
        XCTAssertEqual(session.ioBuffer, 0.02)
        post(AVAudioSession.routeChangeNotification, route(.categoryChange), to: center)
        XCTAssertEqual(session.configured, 3, "its own category change")
        audio.deactivate(systemOwned: false)
        post(AVAudioSession.routeChangeNotification, route(.newDeviceAvailable), to: center)
        XCTAssertEqual(session.configured, 3, "at rest the session is left alone")
    }

    /// After a phone call or Siri, the call's settings again, and the session
    /// still hears that the interruption ended.
    func testAnInterruptionsEndSetsTheSessionUpAgain() async throws {
        let session = Session(), center = NotificationCenter()
        let audio = SystemCallAudio(systemManagesCalls: true, engine: { _ in }, session: session, notifications: center)
        var heard = audio.interruptions.makeAsyncIterator()
        let ended: [AnyHashable: Any] = [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.ended.rawValue]
        post(AVAudioSession.interruptionNotification, ended, to: center)
        XCTAssertEqual(session.configured, 0, "at rest the session is left alone")
        audio.systemAudio(active: true)
        XCTAssertEqual(session.configured, 1)
        post(AVAudioSession.interruptionNotification, ended, to: center)
        XCTAssertEqual(session.configured, 2, "in a call")
        _ = await heard.next()
        let second = await heard.next()
        XCTAssertEqual(second, .ended(shouldResume: false))
    }

    /// The media services restarted: the settings come back, and the engine
    /// follows the call as always (on only with the call's session active).
    func testAfterAMediaServicesResetTheEngineFollowsTheCall() throws {
        let reset = AVAudioSession.mediaServicesWereResetNotification
        let engine = Engine(), session = Session(), center = NotificationCenter()
        let audio = SystemCallAudio(systemManagesCalls: true, engine: { engine.record($0) }, session: session, notifications: center)
        try audio.activate(systemOwned: true)
        post(reset, to: center)
        XCTAssertEqual(engine.now, "off", "before the system's go (C1)")
        XCTAssertEqual(session.configured, 1, "not set up for a call the system hasn't started")
        audio.systemAudio(active: true)
        post(reset, to: center)
        XCTAssertEqual(engine.now, "on", "in the call")
        XCTAssertEqual(session.configured, 3)
        audio.callEnded()
        post(reset, to: center)
        XCTAssertEqual(engine.now, "off", "after the call")

        let own = Engine(), ownSession = Session(), ownCenter = NotificationCenter()
        let app = SystemCallAudio(systemManagesCalls: false, engine: { own.record($0) }, session: ownSession, notifications: ownCenter)
        try app.activate(systemOwned: false)
        post(reset, to: ownCenter)
        XCTAssertEqual(ownSession.configured, 2)
        XCTAssertEqual(ownSession.active, [true, true], "active again")
        XCTAssertEqual(own.now, "on")
        app.deactivate(systemOwned: false)
        post(reset, to: ownCenter)
        XCTAssertEqual(ownSession.active, [true, true, false], "at rest it stays inactive")
    }

    // MARK: - Through a whole call

    /// The adapter as the session uses it, with a microphone that says yes.
    final class Audio: CallAudio, @unchecked Sendable {
        let real: SystemCallAudio
        let interruptions: AsyncStream<AudioInterruption>
        init(_ real: SystemCallAudio) {
            self.real = real
            interruptions = AsyncStream { _ in }
        }
        func requestMicrophone() async -> Bool { true }
        func activate(systemOwned: Bool) throws { try real.activate(systemOwned: systemOwned) }
        func deactivate(systemOwned: Bool) { real.deactivate(systemOwned: systemOwned) }
        func systemAudio(active: Bool) { real.systemAudio(active: active) }
        func callEnded() { real.callEnded() }
    }

    private let lifecycle = CallLifecycleTests.FakeLifecycle()
    private let rooms = CallSessionTests.Rooms()
    private let tokens = CallSessionTests.Tokens()

    private func call(_ engine: Engine) -> CallSession {
        let rooms = rooms, tokens = tokens
        return CallSession(
            fetchToken: { _ in
                tokens.requests.append("ferni")
                return CallToken(token: "t", url: "wss://x", room: "r", agentDispatched: tokens.dispatched)
            },
            makeRoom: {
                let room = rooms.next()
                rooms.made.append(room)
                return room
            },
            audio: Audio(recorded(engine)),
            lifecycle: lifecycle,
            agentTimeout: .seconds(5),
            arrivingAfter: .milliseconds(50),
            defaults: UserDefaults(suiteName: "system-audio-\(UUID().uuidString)")!
        )
    }

    private func until(_ condition: @autoclosure () -> Bool, file: StaticString = #filePath, line: UInt = #line) async {
        let deadline = ContinuousClock.now + .seconds(10)
        while !condition(), ContinuousClock.now < deadline { try? await Task.sleep(for: .milliseconds(10)) }
        XCTAssertTrue(condition(), "timed out", file: file, line: line)
    }

    /// 1. A drop mid-call and a rejoin: the voice comes back in the new room.
    func testAfterARejoinTheEngineIsOn() async {
        let engine = Engine()
        let session = call(engine)
        session.start()
        lifecycle.ask.yield(.audio(active: true)) // the system activates, once
        await until(session.phase == .live)
        XCTAssertEqual(engine.now, "on")

        rooms.made[0].send(.disconnected(byUs: false))
        await until(rooms.made.count == 2 && session.phase == .live)
        XCTAssertEqual(engine.now, "on", "after the rejoin: \(engine.all)")
    }

    /// 2. Ferni didn't join the first room; the second room's call has a voice.
    func testAfterARetryTheEngineIsOn() async {
        let engine = Engine()
        tokens.dispatched = false // the first room: Ferni missing, at once
        let tokens = tokens
        var first = true
        rooms.next = {
            defer { first = false; tokens.dispatched = true }
            return CallSessionTests.FakeRoom(agentOnConnect: first ? nil : [:])
        }
        let session = call(engine)
        session.start()
        lifecycle.ask.yield(.audio(active: true))
        await until(session.phase == .live)
        XCTAssertEqual(rooms.made.count, 2, "attempt 2")
        XCTAssertEqual(engine.now, "on", "in attempt 2's room: \(engine.all)")
    }

    /// 3. The call ends: off, ready for the next. The system taking the audio: off.
    func testEndingOrLosingTheSystemAudioTurnsItOff() async {
        let engine = Engine()
        let session = call(engine)
        session.start()
        lifecycle.ask.yield(.audio(active: true))
        await until(session.phase == .live)
        lifecycle.ask.yield(.audio(active: false))
        await until(engine.now == "off")
        lifecycle.ask.yield(.audio(active: true))
        await until(engine.now == "on")
        await session.end()
        XCTAssertEqual(engine.now, "off", "ended: \(engine.all)")
    }

    /// 3b. A call that fails (the rejoin room never gets Ferni): off as well.
    func testAFailedCallTurnsItOff() async {
        let engine = Engine()
        let session = call(engine)
        session.start()
        lifecycle.ask.yield(.audio(active: true))
        await until(session.phase == .live)
        XCTAssertEqual(engine.now, "on")

        tokens.dispatched = false // the rejoin room: Ferni missing, at once
        rooms.next = { CallSessionTests.FakeRoom(agentOnConnect: nil) }
        rooms.made[0].send(.disconnected(byUs: false))
        await until(session.phase == .failed(.connectionLost))
        XCTAssertEqual(engine.now, "off", "failed: \(engine.all)")
    }
}
