import AVFAudio
import Foundation
import LiveKit
import os

/// AVAudioSession set up for a conversation: voice-chat processing (echo
/// cancellation, voice-tuned gain), the speaker by default, and Bluetooth headsets
/// when connected. AirPlay isn't offered: it's output only, so the phone's mic
/// would hear Ferni's delayed voice. LiveKit's automatic setup would pick
/// `.videoChat` for the speaker, so the app configures the session itself.
///
/// Under LiveCommunicationKit the system owns activation. Per LiveKit's
/// CallKit contract (README, "Integration with CallKit") the audio engine is
/// unavailable until the system activates the session and again after it
/// takes it back; otherwise WebRTC can start its audio unit on a session the
/// system hasn't granted, and the call is deaf or silent (critic C1).
///
/// The system activates the session once per call, not once per room. So the
/// engine stays available between the rooms of one call (a rejoin after a
/// drop, the retry when Ferni didn't join) and goes off only when the call
/// ends or the system takes the audio back. It used to go off at every room's
/// end, and the next room, being system-owned, never turned it back on: no mic
/// and no speaker for the rest of a call that looked live.
///
/// When the system activates the call's session (at the start, or giving it
/// back after a hold), after an interruption ends, when a device comes or
/// goes, and after the media services reset, the call is set up again: voice
/// chat on the session, and LiveKit's voice processing (its echo cancellation)
/// back on if it dropped, even when the session refuses its settings. Without
/// it, Ferni's own voice reaches the mic and reads as the person talking. Each
/// time is logged with its reason and whether voice processing had dropped.
///
/// When the system never activates a call's audio, the call takes it itself
/// (`activate(systemOwned: false)`), and a late word from the system's
/// abandoned call leaves that audio on.
// The observer tokens are set in init and read in deinit; the call's state is behind a lock.
public final class SystemCallAudio: CallAudio, @unchecked Sendable {
    public let interruptions: AsyncStream<AudioInterruption>
    private var observers: [NSObjectProtocol] = []
    private let notifications: NotificationCenter
    private let systemManagesCalls: Bool
    private let engine: @Sendable (AudioEngineAvailability) throws -> Void
    private let session: any AudioSessionSettings
    private let voiceProcessing: any VoiceProcessing
    private let failed: @Sendable (StaticString) -> Void
    /// The system has activated this call's session (and not taken it back).
    private let systemActive = OSAllocatedUnfairLock(initialState: false)
    /// The app activated the session itself for a call (not the system).
    private let ownActive = OSAllocatedUnfairLock(initialState: false)
    /// Drift set-backs wait while held: taken for each write (its route
    /// changes would write again) and kept when it threw or didn't stick.
    /// Only `releaseHold` lets go.
    private let driftHeld = OSAllocatedUnfairLock(initialState: false)
    private let log = Logger(subsystem: "com.sethdford.ferni", category: "audio")

    /// - Parameters:
    ///   - systemManagesCalls: calls run on the system's call service
    ///     (false in the Simulator, which has none).
    ///   - engine: sets LiveKit's engine availability; tests record it.
    ///   - session: the audio session; tests record what is asked of it.
    ///   - notifications: where the session's notifications arrive; tests post their own.
    ///   - voiceProcessing: LiveKit's voice processing; tests fake it.
    ///   - failed: told each time the call's settings couldn't be put back
    ///     (after the error is logged); tests count them.
    public init(systemManagesCalls: Bool,
                engine: @escaping @Sendable (AudioEngineAvailability) throws -> Void = {
                    try AudioManager.shared.setEngineAvailability($0)
                },
                session: any AudioSessionSettings = AVAudioSession.sharedInstance(),
                notifications: NotificationCenter = .default,
                voiceProcessing: any VoiceProcessing = LiveKitVoiceProcessing(),
                failed: @escaping @Sendable (StaticString) -> Void = { _ in }) {
        self.systemManagesCalls = systemManagesCalls
        self.failed = failed
        self.engine = engine
        self.session = session
        self.voiceProcessing = voiceProcessing
        self.notifications = notifications
        AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
        let (stream, continuation) = AsyncStream.makeStream(of: AudioInterruption.self)
        interruptions = stream
        observers = [
            notifications.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: nil) { [weak self] note in
                guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                      let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
                switch type {
                case .began:
                    continuation.yield(.began)
                case .ended:
                    // Another app may have changed the session meanwhile.
                    self?.reapply("interruption ended")
                    let options = (note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt)
                        .map(AVAudioSession.InterruptionOptions.init(rawValue:)) ?? []
                    continuation.yield(.ended(shouldResume: options.contains(.shouldResume)))
                @unknown default:
                    break
                }
            },
            notifications.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: nil) { [weak self] note in
                guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                      let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else { return }
                switch reason {
                case .newDeviceAvailable, .oldDeviceUnavailable:
                    // A device came or went (AirPods in or out, a car).
                    self?.reapply("route changed")
                case .override:
                    // The speaker button or the route picker mid-call.
                    self?.reapplyIfDrifted("route overridden")
                case .routeConfigurationChange, .wakeFromSleep:
                    self?.reapplyIfDrifted("route reconfigured")
                default:
                    // .categoryChange: setting the category posts it, and it would
                    // loop. .noSuitableRouteForCategory: no route can take a call, and
                    // setting the session again can't make one.
                    break
                }
            },
            notifications.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: nil) { [weak self] _ in
                self?.rebuildAfterReset()
            }
        ]
        // As early as possible, before any room connects.
        if systemManagesCalls { setEngine(.none) }
    }

    deinit { for observer in observers { notifications.removeObserver(observer) } }

    /// In a call: the system or the app has the session active.
    private var inCall: Bool { systemActive.withLock { $0 } || ownActive.withLock { $0 } }

    /// The session isn't in the call's category and mode.
    private var drifted: Bool { session.category != .playAndRecord || session.mode != .voiceChat }

    /// The call's session settings again, in a call only (at rest the app
    /// leaves the session alone). A device change or an interruption's end
    /// tries even when held.
    private func reapply(_ why: StaticString) {
        guard inCall else { return }
        releaseHold()
        if takeHold() { write(why) }
    }

    /// Takes the hold: false when it's already held.
    private func takeHold() -> Bool {
        driftHeld.withLock { driftHeld in
            defer { driftHeld = true }
            return !driftHeld
        }
    }

    /// The one way the hold lets go: a write that stuck, a device change, an
    /// interruption's end, a media reset or the call's end. Never a throw.
    private func releaseHold() {
        driftHeld.withLock { driftHeld in driftHeld = false }
    }

    /// Sets the session up again (the hold taken), then reads it back whether
    /// or not it threw: a write can throw part-way and still stick, or not
    /// throw and not stick. Each write posts a route change, so one that
    /// didn't stick keeps the hold, and its route changes write nothing more.
    private func write(_ why: StaticString) {
        let threw: Bool
        do {
            try setUpAgain(why)
            threw = false
        } catch {
            log.error("Session not set again (\(why, privacy: .public)): \(error.localizedDescription, privacy: .public)")
            failed(why)
            threw = true
        }
        if !drifted {
            releaseHold()
        } else if !threw {
            log.error("Session settings didn't stick (\(why, privacy: .public)); held until one does")
            failed("settings didn't stick")
        }
    }

    /// Only what drifted from the call's settings. The call's own
    /// setCategory/setMode can post these reasons, and then finds nothing to
    /// do: no loop, and no needless write while Ferni is talking. Voice
    /// processing alone comes back without a session write, so even one that
    /// keeps refusing posts nothing back. Options aren't compared: the system
    /// can report them differently from what was asked, and a mismatch that
    /// never clears would loop. Held set-backs (`driftHeld`) aren't tried.
    private func reapplyIfDrifted(_ why: StaticString) {
        if drifted, inCall, takeHold() {
            write(why)
        } else if inCall, !voiceProcessing.isOn {
            let processing = restoreVoiceProcessing()
            log.notice("Voice processing \(processing, privacy: .public) (\(why, privacy: .public))")
        }
    }

    /// Voice chat on the session and voice processing on, logged with the
    /// reason. Voice processing comes back even if the session refuses its
    /// settings: the echo cancellation doesn't depend on them.
    private func setUpAgain(_ why: StaticString) throws {
        var refused: Error?
        do { try configure() } catch { refused = error }
        let processing = restoreVoiceProcessing()
        log.notice("Session set again (\(why, privacy: .public)); voice processing \(processing, privacy: .public)")
        if let refused { throw refused }
    }

    /// Turns LiveKit's voice processing back on only if it dropped: turning it
    /// on restarts the audio engine, so a call where it's on is left alone.
    private func restoreVoiceProcessing() -> StaticString {
        guard !voiceProcessing.isOn else { return "on" }
        do {
            try voiceProcessing.turnOn()
            return "was off, back on"
        } catch {
            log.error("Voice processing not back on: \(error.localizedDescription, privacy: .public)")
            failed("voice processing")
            return "off, not restored"
        }
    }

    /// The media services restarted: every session setting is gone. The
    /// settings come back, and the engine follows the same rule as always:
    /// on only once the call's session is active again; off at rest when the
    /// system owns calls.
    private func rebuildAfterReset() {
        log.error("Media services were reset; setting the session up again")
        releaseHold()
        if systemActive.withLock({ $0 }) {
            try? setUpAgain("media services reset")
            setEngine(.default)
        } else if ownActive.withLock({ $0 }) {
            // The app's own session (no system call service, or the system
            // never started this call's audio): the app activates it again.
            do {
                try setUpAgain("media services reset")
                try session.setActive(true, options: [])
                setEngine(.default)
            } catch {
                log.error("Session not active again after the reset: \(error.localizedDescription, privacy: .public)")
            }
        } else if systemManagesCalls {
            setEngine(.none)
        }
    }

    public func requestMicrophone() async -> Bool {
        await AVAudioApplication.requestRecordPermission()
    }

    public func activate(systemOwned: Bool) throws {
        try configure()
        if systemOwned {
            // The system activates it and tells us (systemAudio(active:)),
            // which is what turns the engine on, never before (C1). A later
            // room of the same call finds it still on: leaving a room doesn't
            // turn it off.
            return
        }
        setEngine(.default)
        try session.setActive(true, options: [])
        ownActive.withLock { $0 = true }
    }

    public func deactivate(systemOwned: Bool) {
        if !systemOwned {
            ownActive.withLock { $0 = false }
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
        }
        // Between rooms the engine is left as it is: the system activates the
        // session once per call (callEnded and systemAudio(active: false) turn it off).
    }

    public func systemAudio(active: Bool) {
        systemActive.withLock { $0 = active }
        // A hold's end may come before this or not at all: this is where the
        // call is surely back, so it's set up again here, before the engine starts.
        if active { reapply("system activated") }
        // The app took the audio over when the system never activated it: a
        // late word from the system's abandoned call leaves the engine on.
        setEngine(active || ownActive.withLock({ $0 }) ? .default : .none)
    }

    public func callEnded() {
        releaseHold()
        systemActive.withLock { $0 = false }
        ownActive.withLock { $0 = false }
        // Ready for the next call, which the system will own again.
        if systemManagesCalls { setEngine(.none) }
    }

    public var engineState: String {
        let availability = AudioManager.shared.engineAvailability
        return "engine in \(availability.isInputAvailable) out \(availability.isOutputAvailable) running \(AudioManager.shared.isEngineRunning)"
    }

    private func configure() throws {
        // Bluetooth in headset mode only (HFP): the mic and Ferni's voice on
        // one link. A2DP (output only) is not a call route, so a Bluetooth
        // speaker with no mic isn't offered; the call plays on the phone.
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: Self.options)
        // Otherwise iOS silences every haptic while the mic records (B9).
        try session.setAllowHapticsAndSystemSoundsDuringRecording(true)
        // Automatic configuration is off, so the SDK never asks for a buffer.
        // 20 ms is the frame WebRTC processes; a larger one the system picks
        // on its own stutters the mixer. The sample rate is the system's.
        // A preference: the call still works if it's refused.
        do {
            try session.setPreferredIOBufferDuration(Self.ioBuffer)
        } catch {
            log.error("IO buffer not set: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// The speaker by default and Bluetooth headsets.
    static let options: AVAudioSession.CategoryOptions = [.defaultToSpeaker, .allowBluetoothHFP]

    /// The IO buffer a call asks for, in seconds.
    static let ioBuffer: TimeInterval = 0.02

    private func setEngine(_ availability: AudioEngineAvailability) {
        do {
            try engine(availability)
        } catch {
            log.error("Audio engine availability not set: \(error.localizedDescription, privacy: .public)")
        }
    }
}

/// What the call asks of the audio session; AVAudioSession in the app, a
/// recorder in tests.
public protocol AudioSessionSettings: AnyObject {
    var category: AVAudioSession.Category { get }
    var mode: AVAudioSession.Mode { get }
    func setCategory(_ category: AVAudioSession.Category, mode: AVAudioSession.Mode,
                     options: AVAudioSession.CategoryOptions) throws
    func setAllowHapticsAndSystemSoundsDuringRecording(_ inValue: Bool) throws
    func setPreferredIOBufferDuration(_ duration: TimeInterval) throws
    func setActive(_ active: Bool, options: AVAudioSession.SetActiveOptions) throws
}

extension AVAudioSession: AudioSessionSettings {}

/// The echo cancellation and voice-tuned gain in LiveKit's audio engine;
/// LiveKit in the app, a fake in tests.
public protocol VoiceProcessing: AnyObject, Sendable {
    /// Enabled and not bypassed.
    var isOn: Bool { get }
    func turnOn() throws
}

/// LiveKit's own switches. Both default to on, and the app never turns them
/// off: this only puts back what something else changed.
public final class LiveKitVoiceProcessing: VoiceProcessing {
    public init() {}

    public var isOn: Bool {
        AudioManager.shared.isVoiceProcessingEnabled && !AudioManager.shared.isVoiceProcessingBypassed
    }

    public func turnOn() throws {
        let audio = AudioManager.shared
        if !audio.isVoiceProcessingEnabled { try audio.setVoiceProcessingEnabled(true) }
        if audio.isVoiceProcessingBypassed { audio.isVoiceProcessingBypassed = false }
    }
}
