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
        private let states = OSAllocatedUnfairLock(initialState: [(String, ContinuousClock.Instant)]())
        var all: [String] { states.withLock { $0.map(\.0) } }
        var now: String? { all.last }
        func record(_ availability: AudioEngineAvailability) {
            let state = availability.isInputAvailable && availability.isOutputAvailable ? "on"
                : !availability.isInputAvailable && !availability.isOutputAvailable ? "off" : "partial"
            states.withLock { $0.append((state, .now)) }
        }
        /// Voice processing turned on restarts the engine.
        func restarted() { states.withLock { $0.append(("restart", .now)) } }
        /// Everything the engine did after `start`, and how long playout stopped:
        /// each off or partial until the next on. A restart can't be timed here.
        func since(_ start: ContinuousClock.Instant) -> (events: [String], gap: Duration) {
            let after = states.withLock { $0.filter { $0.1 >= start } }
            var gap = Duration.zero, stopped: ContinuousClock.Instant?
            for (state, at) in after {
                if state == "on", let from = stopped { gap += at - from; stopped = nil }
                if state == "off" || state == "partial" { stopped = stopped ?? at }
            }
            if let stopped { gap += .now - stopped }
            return (after.map(\.0), gap)
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
        var category: AVAudioSession.Category = .soloAmbient
        var mode: AVAudioSession.Mode = .default
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

    /// LiveKit's voice processing as a switch the test can flip.
    final class Processing: VoiceProcessing, @unchecked Sendable {
        var isOn = true
        var turnedOn = 0
        var refuses = false
        var engine: Engine?
        func turnOn() throws {
            if refuses { throw NSError(domain: "VoiceProcessing", code: 1) }
            isOn = true; turnedOn += 1; engine?.restarted()
        }
    }

    /// False stops come from Ferni's own voice reaching the mic. After each
    /// disruption the call is back in voice chat with voice processing on,
    /// whatever the phone call, Siri or the new route left behind; voice
    /// processing that stayed on is left alone (turning it on restarts the engine).
    func testVoiceChatAndVoiceProcessingComeBackAfterEachDisruption() throws {
        let ended: [AnyHashable: Any] = [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.ended.rawValue]
        let disruptions: [(String, Notification.Name, [AnyHashable: Any])] = [
            ("an interruption's end", AVAudioSession.interruptionNotification, ended),
            ("a new device", AVAudioSession.routeChangeNotification, route(.newDeviceAvailable)),
            ("a device gone", AVAudioSession.routeChangeNotification, route(.oldDeviceUnavailable)),
            ("a media services reset", AVAudioSession.mediaServicesWereResetNotification, [:]),
        ]
        for systemOwned in [true, false] {
            for (what, name, info) in disruptions {
                let why = "\(what), system owned: \(systemOwned)"
                let session = Session(), processing = Processing(), center = NotificationCenter()
                let audio = SystemCallAudio(systemManagesCalls: systemOwned, engine: { _ in }, session: session,
                                            notifications: center, voiceProcessing: processing)
                try audio.activate(systemOwned: systemOwned)
                if systemOwned { audio.systemAudio(active: true) }

                session.mode = .default
                processing.isOn = false
                post(name, info, to: center)
                XCTAssertEqual(session.mode, .voiceChat, why)
                XCTAssertEqual(session.category, .playAndRecord, why)
                XCTAssertTrue(processing.isOn, why)
                XCTAssertEqual(processing.turnedOn, 1, why)

                post(name, info, to: center)
                XCTAssertEqual(processing.turnedOn, 1, "left alone while on: \(why)")
            }
        }
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

    private func call(_ engine: Engine) -> CallSession { call(recorded(engine)) }

    private func call(_ audio: SystemCallAudio) -> CallSession {
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
            audio: Audio(audio),
            lifecycle: lifecycle,
            agentTimeout: .seconds(5),
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

    // MARK: - The app's own audio (the system never started it)

    /// #2868: under the system's call service the app sets the session up and
    /// never activates it or starts the engine itself; the system does (C1).
    /// Without the system, the app does both.
    func testASystemOwnedCallIsSetUpButNeverActivatedByTheApp() throws {
        let engine = Engine(), session = Session()
        let audio = SystemCallAudio(systemManagesCalls: true, engine: { engine.record($0) }, session: session)
        try audio.activate(systemOwned: true)
        XCTAssertEqual(session.category, .playAndRecord, "set up")
        XCTAssertEqual(session.mode, .voiceChat)
        XCTAssertEqual(session.active, [], "never activated by the app")
        XCTAssertEqual(engine.all, ["off"], "the engine waits for the system")

        try audio.activate(systemOwned: false)
        XCTAssertEqual(session.active, [true], "the app's own call")
        XCTAssertEqual(engine.now, "on")
    }

    /// The app took the audio because the system never activated it: the
    /// abandoned system call taking "its" audio back later leaves the call's
    /// sound on. The app's call ending turns it off, ready for the next.
    func testALateDeactivationLeavesTheAppsOwnAudioOn() throws {
        let engine = Engine(), session = Session()
        let audio = SystemCallAudio(systemManagesCalls: true, engine: { engine.record($0) }, session: session)
        try audio.activate(systemOwned: false)
        audio.systemAudio(active: false)
        XCTAssertEqual(engine.now, "on", "a late deactivation: \(engine.all)")
        audio.deactivate(systemOwned: false)
        XCTAssertEqual(session.active, [true, false])
        audio.callEnded()
        XCTAssertEqual(engine.now, "off")
        audio.systemAudio(active: false)
        XCTAssertEqual(engine.now, "off", "at rest the system's word holds")
    }

    /// The media services reset during a call whose audio the app took over
    /// (the system never started it): the app activates its own session again
    /// and the engine stays on. Only the system's word decides at rest.
    func testAfterAMediaServicesResetTheAppsOwnAudioStaysOn() throws {
        let engine = Engine(), session = Session(), center = NotificationCenter()
        let audio = SystemCallAudio(systemManagesCalls: true, engine: { engine.record($0) }, session: session, notifications: center)
        try audio.activate(systemOwned: false)
        post(AVAudioSession.mediaServicesWereResetNotification, to: center)
        XCTAssertEqual(engine.now, "on", "the app's call keeps its sound: \(engine.all)")
        XCTAssertEqual(session.active, [true, true], "the app activates its session again")
        XCTAssertEqual(session.mode, .voiceChat)
    }

    // MARK: - The speaker button, the route picker, a rebuilt route

    /// A session that, like iOS, posts a route change when its category is
    /// set, and can refuse it (`refuses`, still posting with `refusesAndPosts`),
    /// accept it and keep what it had (`sticks` false), or refuse the haptics
    /// setting after it (`hapticsRefused`). It posts during the write, or after
    /// it (`later`, posted by `drain`). `writes` counts every setCategory call.
    /// It stops posting after 20, so a loop shows as a count.
    final class EchoingSession: AudioSessionSettings, @unchecked Sendable {
        let center: NotificationCenter
        var category: AVAudioSession.Category = .soloAmbient
        var mode: AVAudioSession.Mode = .default
        var configured = 0
        var writes = 0
        var refuses = false
        var refusesAndPosts = false
        var hapticsRefused = false
        var sticks = true
        var later = false
        private var pending = 0
        init(_ center: NotificationCenter) { self.center = center }
        func drain() {
            while pending > 0 {
                pending -= 1
                echo()
            }
        }
        private func echo() {
            center.post(name: AVAudioSession.routeChangeNotification, object: nil,
                        userInfo: [AVAudioSessionRouteChangeReasonKey: AVAudioSession.RouteChangeReason.routeConfigurationChange.rawValue])
        }
        func setCategory(_ category: AVAudioSession.Category, mode: AVAudioSession.Mode,
                         options: AVAudioSession.CategoryOptions) throws {
            writes += 1
            if refusesAndPosts { post() }
            if refuses || refusesAndPosts { throw NSError(domain: "AVAudioSession", code: -50) }
            if sticks { self.category = category; self.mode = mode }
            configured += 1
            post()
        }
        private func post() {
            guard writes <= 20 else { return }
            if later { pending += 1 } else { echo() }
        }
        func setAllowHapticsAndSystemSoundsDuringRecording(_ inValue: Bool) throws {
            if hapticsRefused { throw NSError(domain: "AVAudioSession", code: -50) }
        }
        func setPreferredIOBufferDuration(_ duration: TimeInterval) throws {}
        func setActive(_ active: Bool, options: AVAudioSession.SetActiveOptions) throws {}
    }

    final class Failures: @unchecked Sendable {
        private let whys = OSAllocatedUnfairLock(initialState: [String]())
        var all: [String] { whys.withLock { $0 } }
        func record(_ why: StaticString) { whys.withLock { $0.append("\(why)") } }
    }

    /// The speaker button or the picker mid-call, a rebuilt route, the phone
    /// waking: whatever drifted from the call's settings comes back, and
    /// nothing is written when nothing drifted. No route can't be fixed by
    /// setting the session, and at rest the session is left alone.
    func testAnOverriddenOrRebuiltRouteSetsBackOnlyWhatDrifted() throws {
        let session = Session(), processing = Processing(), center = NotificationCenter()
        let audio = SystemCallAudio(systemManagesCalls: false, engine: { _ in }, session: session,
                                    notifications: center, voiceProcessing: processing)
        try audio.activate(systemOwned: false)
        XCTAssertEqual(session.configured, 1)
        for reason in [AVAudioSession.RouteChangeReason.override, .routeConfigurationChange, .wakeFromSleep] {
            post(AVAudioSession.routeChangeNotification, route(reason), to: center)
            XCTAssertEqual(session.configured, 1, "nothing drifted: \(reason.rawValue)")
        }
        session.mode = .default
        post(AVAudioSession.routeChangeNotification, route(.override), to: center)
        XCTAssertEqual(session.mode, .voiceChat)
        XCTAssertEqual(session.configured, 2, "the mode drifted")
        session.category = .playback
        post(AVAudioSession.routeChangeNotification, route(.routeConfigurationChange), to: center)
        XCTAssertEqual(session.category, .playAndRecord)
        XCTAssertEqual(session.configured, 3, "the category drifted")
        processing.isOn = false
        post(AVAudioSession.routeChangeNotification, route(.wakeFromSleep), to: center)
        XCTAssertEqual(processing.turnedOn, 1, "voice processing dropped")
        XCTAssertEqual(session.configured, 3, "voice processing alone: no session write")
        session.mode = .default
        post(AVAudioSession.routeChangeNotification, route(.noSuitableRouteForCategory), to: center)
        XCTAssertEqual(session.configured, 3, "no route: not set again")
        audio.deactivate(systemOwned: false)
        processing.isOn = false
        post(AVAudioSession.routeChangeNotification, route(.override), to: center)
        XCTAssertEqual(session.configured, 3, "at rest the session is left alone")
        XCTAssertEqual(processing.turnedOn, 1, "and so is voice processing")
    }

    /// The call's own write posts a route change; it finds nothing to do, so
    /// it never loops. A real override in the same call still sets it back.
    func testTheCallsOwnWriteDoesNotSetTheSessionAgain() throws {
        let center = NotificationCenter(), session = EchoingSession(center)
        let audio = SystemCallAudio(systemManagesCalls: false, engine: { _ in }, session: session,
                                    notifications: center, voiceProcessing: Processing())
        try audio.activate(systemOwned: false)
        post(AVAudioSession.routeChangeNotification, route(.override), to: center)
        XCTAssertEqual(session.configured, 1, "the speaker button with nothing drifted")
        session.mode = .default
        post(AVAudioSession.routeChangeNotification, route(.override), to: center)
        XCTAssertEqual(session.mode, .voiceChat)
        XCTAssertEqual(session.configured, 2, "set back once; its own route change did nothing more")
    }

    /// Mid-sentence: every route change the call handles keeps voice
    /// processing on, never stops or restarts the engine (no gap in Ferni's
    /// voice) and leaves the call as it was.
    func testARouteChangeWhileFerniSpeaksKeepsTheVoicePlaying() async {
        let engine = Engine(), session = Session(), processing = Processing(), center = NotificationCenter()
        processing.engine = engine
        let call = call(SystemCallAudio(systemManagesCalls: true, engine: { engine.record($0) }, session: session,
                                        notifications: center, voiceProcessing: processing))
        call.start()
        lifecycle.ask.yield(.audio(active: true))
        await until(call.phase == .live)
        rooms.made[0].send(.agentAttributes(["lk.agent.state": "speaking"]))
        await until(call.avatar.pose == .speaking)

        let start = ContinuousClock.now
        let reasons: [AVAudioSession.RouteChangeReason] = [.newDeviceAvailable, .oldDeviceUnavailable, .override,
                                                           .routeConfigurationChange, .wakeFromSleep]
        for reason in reasons {
            post(AVAudioSession.routeChangeNotification, route(reason), to: center)
            session.mode = .default // and once more with the route having moved the mode
            post(AVAudioSession.routeChangeNotification, route(reason), to: center)
            XCTAssertEqual(session.mode, .voiceChat, "\(reason.rawValue)")
        }
        let playout = engine.since(start)
        print("Route changes while speaking: engine events \(playout.events), playout gap \(Double(playout.gap.components.seconds) * 1000 + Double(playout.gap.components.attoseconds) / 1e15) ms")
        XCTAssertEqual(playout.events, [], "the engine was never stopped or restarted")
        XCTAssertEqual(playout.gap, .zero)
        XCTAssertTrue(processing.isOn)
        XCTAssertEqual(processing.turnedOn, 0)
        XCTAssertEqual(engine.now, "on")
        XCTAssertEqual(call.phase, .live)
        XCTAssertEqual(call.avatar.pose, .speaking)
        await call.end()
    }

    /// A refused write is logged and reported, never swallowed, and the call
    /// goes on: the set-backs stay held, and a device change sets it back once
    /// it's allowed. Voice processing that keeps refusing writes nothing to the
    /// session (no loop).
    func testAFailedSetBackIsReportedAndTheCallGoesOn() throws {
        let center = NotificationCenter(), session = EchoingSession(center), processing = Processing()
        let engine = Engine(), failures = Failures()
        let audio = SystemCallAudio(systemManagesCalls: false, engine: { engine.record($0) }, session: session,
                                    notifications: center, voiceProcessing: processing, failed: { failures.record($0) })
        try audio.activate(systemOwned: false)
        session.mode = .default
        session.refuses = true
        post(AVAudioSession.routeChangeNotification, route(.override), to: center)
        XCTAssertEqual(failures.all, ["route overridden"])
        session.refuses = false
        post(AVAudioSession.routeChangeNotification, route(.override), to: center)
        XCTAssertEqual(session.writes, 2, "held after the refusal")
        post(AVAudioSession.routeChangeNotification, route(.newDeviceAvailable), to: center)
        XCTAssertEqual(session.mode, .voiceChat, "set back once the session allowed it")
        XCTAssertEqual(session.configured, 2)

        processing.isOn = false
        processing.refuses = true
        post(AVAudioSession.routeChangeNotification, route(.override), to: center)
        XCTAssertEqual(failures.all, ["route overridden", "voice processing"])
        XCTAssertEqual(session.configured, 2, "no session write for voice processing")
        processing.refuses = false
        post(AVAudioSession.routeChangeNotification, route(.routeConfigurationChange), to: center)
        XCTAssertTrue(processing.isOn, "back on once it's allowed")
        XCTAssertEqual(failures.all.count, 2)
        XCTAssertEqual(engine.now, "on", "the call goes on")
    }

    /// The system accepts the settings and keeps its own, and each write posts
    /// a route change (during the write or after it): one write per route
    /// change, reported, then nothing more on these reasons until a write
    /// sticks. A device change tries anyway, and once one sticks they're armed again.
    func testASetBackThatDoesNotStickWritesOnceUntilOneDoes() throws {
        for later in [false, true] {
            for reason in [AVAudioSession.RouteChangeReason.override, .routeConfigurationChange, .wakeFromSleep] {
                let center = NotificationCenter(), session = EchoingSession(center), failures = Failures()
                session.later = later
                let audio = SystemCallAudio(systemManagesCalls: false, engine: { _ in }, session: session,
                                            notifications: center, voiceProcessing: Processing(),
                                            failed: { failures.record($0) })
                try audio.activate(systemOwned: false)
                session.drain()
                session.sticks = false
                session.mode = .default
                post(AVAudioSession.routeChangeNotification, route(reason), to: center)
                session.drain()
                XCTAssertEqual(session.configured, 2, "one write for one route change: \(reason.rawValue) later \(later)")
                post(AVAudioSession.routeChangeNotification, route(reason), to: center)
                session.drain()
                XCTAssertEqual(session.configured, 2, "held: \(reason.rawValue) later \(later)")
                XCTAssertEqual(failures.all, ["settings didn't stick"], "\(reason.rawValue) later \(later)")
            }
        }

        let center = NotificationCenter(), session = EchoingSession(center), failures = Failures()
        session.later = true
        let audio = SystemCallAudio(systemManagesCalls: false, engine: { _ in }, session: session,
                                    notifications: center, voiceProcessing: Processing(),
                                    failed: { failures.record($0) })
        try audio.activate(systemOwned: false)
        session.drain()
        session.sticks = false
        session.mode = .default
        post(AVAudioSession.routeChangeNotification, route(.override), to: center)
        session.drain()
        XCTAssertEqual(session.configured, 2)
        post(AVAudioSession.routeChangeNotification, route(.newDeviceAvailable), to: center)
        session.drain()
        XCTAssertEqual(session.configured, 3, "a device change tries again, once")
        XCTAssertEqual(failures.all.count, 2)
        session.sticks = true
        post(AVAudioSession.routeChangeNotification, route(.oldDeviceUnavailable), to: center)
        session.drain()
        XCTAssertEqual(session.configured, 4)
        XCTAssertEqual(session.mode, .voiceChat, "it stuck this time")
        session.mode = .default
        post(AVAudioSession.routeChangeNotification, route(.override), to: center)
        session.drain()
        XCTAssertEqual(session.configured, 5, "armed again once a write stuck")
        XCTAssertEqual(session.mode, .voiceChat)
        XCTAssertEqual(failures.all.count, 2)
    }

    /// A call whose set-backs are held: an override was set back and the
    /// session kept its own settings. Its route changes are posted after the write.
    private func heldCall(_ center: NotificationCenter, _ session: EchoingSession,
                          systemOwned: Bool = false) throws -> SystemCallAudio {
        session.later = true
        let audio = SystemCallAudio(systemManagesCalls: systemOwned, engine: { _ in }, session: session,
                                    notifications: center, voiceProcessing: Processing())
        if systemOwned { audio.systemAudio(active: true) } else { try audio.activate(systemOwned: false) }
        session.drain()
        session.sticks = false
        session.mode = .default
        post(AVAudioSession.routeChangeNotification, route(.override), to: center)
        session.drain()
        post(AVAudioSession.routeChangeNotification, route(.override), to: center)
        session.drain()
        XCTAssertEqual(session.writes, 2, "held")
        return audio
    }

    /// Then the session takes the settings again: a drift is set back.
    private func assertNotHeld(_ center: NotificationCenter, _ session: EchoingSession,
                               _ message: String, line: UInt = #line) {
        session.sticks = true
        session.drain()
        let before = session.writes
        session.mode = .default
        post(AVAudioSession.routeChangeNotification, route(.override), to: center)
        session.drain()
        XCTAssertEqual(session.writes, before + 1, message, line: line)
        XCTAssertEqual(session.mode, .voiceChat, message, line: line)
    }

    /// A write that sticks lets the hold go: the next drift is set back too.
    func testASetBackThatSticksLetsTheNextOneThrough() throws {
        let center = NotificationCenter(), session = EchoingSession(center)
        session.later = true
        let audio = SystemCallAudio(systemManagesCalls: false, engine: { _ in }, session: session,
                                    notifications: center, voiceProcessing: Processing())
        try audio.activate(systemOwned: false)
        session.drain()
        session.mode = .default
        post(AVAudioSession.routeChangeNotification, route(.override), to: center)
        session.drain()
        XCTAssertEqual(session.writes, 2)
        assertNotHeld(center, session, "the first set-back stuck")
    }

    /// A device coming or going tries even when held, once.
    func testADeviceChangeLetsTheHoldGo() throws {
        let center = NotificationCenter(), session = EchoingSession(center)
        let audio = try heldCall(center, session)
        post(AVAudioSession.routeChangeNotification, route(.newDeviceAvailable), to: center)
        session.drain()
        XCTAssertEqual(session.writes, 3, "tried once though held, and didn't stick")
        session.sticks = true
        post(AVAudioSession.routeChangeNotification, route(.oldDeviceUnavailable), to: center)
        assertNotHeld(center, session, "a device went and the write stuck")
        withExtendedLifetime(audio) {}
    }

    /// An interruption's end tries even when held, once.
    func testAnInterruptionsEndLetsTheHoldGo() throws {
        let center = NotificationCenter(), session = EchoingSession(center)
        let audio = try heldCall(center, session)
        let ended: [AnyHashable: Any] = [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.ended.rawValue]
        post(AVAudioSession.interruptionNotification, ended, to: center)
        session.drain()
        XCTAssertEqual(session.writes, 3, "tried once though held, and didn't stick")
        session.sticks = true
        post(AVAudioSession.interruptionNotification, ended, to: center)
        assertNotHeld(center, session, "an interruption ended and the write stuck")
        withExtendedLifetime(audio) {}
    }

    /// A media reset lets the hold go.
    func testAMediaResetLetsTheHoldGo() throws {
        let center = NotificationCenter(), session = EchoingSession(center)
        let audio = try heldCall(center, session, systemOwned: true)
        session.sticks = true
        post(AVAudioSession.mediaServicesWereResetNotification, to: center)
        XCTAssertEqual(session.writes, 3, "the reset set the session up again")
        assertNotHeld(center, session, "after the reset")
        withExtendedLifetime(audio) {}
    }

    /// The call's end lets the hold go: the next call isn't held.
    func testTheCallsEndLetsTheHoldGo() throws {
        let center = NotificationCenter(), session = EchoingSession(center)
        let audio = try heldCall(center, session)
        audio.deactivate(systemOwned: false)
        audio.callEnded()
        session.sticks = true
        try audio.activate(systemOwned: false)
        assertNotHeld(center, session, "the next call")
    }

    /// A write that throws keeps the hold, and its route changes (during the
    /// write or after it, as iOS posts them) write nothing more. Either
    /// setCategory throws and still posts one, or it doesn't stick and the
    /// haptics setting then throws. One write and one report per route change:
    /// an override's set-back, or a device change (which main writes too).
    func testASetBackThatThrowsWritesOnceAndKeepsTheHold() throws {
        let throwing: [(String, (EchoingSession) -> Void)] = [
            ("setCategory throws and posts", { $0.refusesAndPosts = true }),
            ("doesn't stick, then haptics throws", { $0.sticks = false; $0.hapticsRefused = true })
        ]
        for (how, fail) in throwing {
            for reason in [AVAudioSession.RouteChangeReason.override, .newDeviceAvailable] {
                for later in [false, true] {
                    let center = NotificationCenter(), session = EchoingSession(center), failures = Failures()
                    session.later = later
                    let audio = SystemCallAudio(systemManagesCalls: false, engine: { _ in }, session: session,
                                                notifications: center, voiceProcessing: Processing(),
                                                failed: { failures.record($0) })
                    try audio.activate(systemOwned: false)
                    session.drain()
                    session.mode = .default
                    fail(session)
                    let what = "\(how), \(reason.rawValue), later \(later)"
                    post(AVAudioSession.routeChangeNotification, route(reason), to: center)
                    session.drain()
                    XCTAssertEqual(session.writes, 2, "one write: \(what)")
                    XCTAssertEqual(failures.all.count, 1, "one report: \(what)")
                    post(AVAudioSession.routeChangeNotification, route(.override), to: center)
                    session.drain()
                    XCTAssertEqual(session.writes, 2, "still held: \(what)")
                    XCTAssertEqual(session.mode, .default, what)
                }
            }
        }
    }

    /// A write that throws after its settings stuck (the haptics setting
    /// refused) lets the hold go: the session reads back as the call's.
    func testASetBackThatThrowsAfterStickingLetsTheHoldGo() throws {
        let center = NotificationCenter(), session = EchoingSession(center), failures = Failures()
        session.later = true
        let audio = SystemCallAudio(systemManagesCalls: false, engine: { _ in }, session: session,
                                    notifications: center, voiceProcessing: Processing(),
                                    failed: { failures.record($0) })
        try audio.activate(systemOwned: false)
        session.drain()
        session.hapticsRefused = true
        session.mode = .default
        post(AVAudioSession.routeChangeNotification, route(.override), to: center)
        session.drain()
        XCTAssertEqual(session.writes, 2)
        XCTAssertEqual(failures.all, ["route overridden"])
        session.hapticsRefused = false
        assertNotHeld(center, session, "it stuck though it threw")
    }
}
