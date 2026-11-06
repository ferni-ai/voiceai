import AVFAudio
import LiveKit
import os
import XCTest
@testable import FerniVoice

/// The real adapter against LiveKit's real audio manager: under the system's
/// call service the engine stays off until the system hands over the session
/// (LiveKit 2.12.1 README, "Integration with CallKit").
final class SystemCallAudioTests: XCTestCase {
    private var engine: (input: Bool, output: Bool) {
        let availability = AudioManager.shared.engineAvailability
        return (availability.isInputAvailable, availability.isOutputAvailable)
    }

    override func tearDown() {
        try? AudioManager.shared.setEngineAvailability(.default)
        super.tearDown()
    }

    func testTheEngineWaitsForTheSystemToActivateTheSession() {
        let audio = SystemCallAudio(systemManagesCalls: true)
        XCTAssertTrue(engine == (false, false), "off before any call")
        audio.systemAudio(active: true)
        XCTAssertTrue(engine == (true, true), "on once the system activates")
        audio.systemAudio(active: false)
        XCTAssertTrue(engine == (false, false), "off when the system takes it back")
        audio.systemAudio(active: true)
        audio.deactivate(systemOwned: true)
        XCTAssertTrue(engine == (false, false), "off again, ready for the next call")
    }

    func testWithoutTheSystemTheEngineIsLeftAlone() {
        try? AudioManager.shared.setEngineAvailability(.default)
        withExtendedLifetime(SystemCallAudio(systemManagesCalls: false)) {
            XCTAssertTrue(engine == (true, true))
        }
    }

    // MARK: - Recorded engine and session

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

    /// Everything the adapter asked of the audio session, last value wins.
    final class Session: AudioSessionSettings, @unchecked Sendable {
        var category: AVAudioSession.Category?
        var mode: AVAudioSession.Mode?
        var active: [Bool] = []
        func setCategory(_ category: AVAudioSession.Category, mode: AVAudioSession.Mode,
                         options: AVAudioSession.CategoryOptions) throws {
            self.category = category; self.mode = mode
        }
        func setAllowHapticsAndSystemSoundsDuringRecording(_ inValue: Bool) throws {}
        func setActive(_ active: Bool, options: AVAudioSession.SetActiveOptions) throws { self.active.append(active) }
    }

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
    /// sound on. Leaving the app's call turns it off, ready for the next.
    func testALateDeactivationLeavesTheAppsOwnAudioOn() throws {
        let engine = Engine(), session = Session()
        let audio = SystemCallAudio(systemManagesCalls: true, engine: { engine.record($0) }, session: session)
        try audio.activate(systemOwned: false)
        audio.systemAudio(active: false)
        XCTAssertEqual(engine.now, "on", "a late deactivation: \(engine.all)")
        audio.deactivate(systemOwned: false)
        XCTAssertEqual(engine.now, "off")
        XCTAssertEqual(session.active, [true, false])
        audio.systemAudio(active: false)
        XCTAssertEqual(engine.now, "off", "at rest the system's word holds")
    }
}
